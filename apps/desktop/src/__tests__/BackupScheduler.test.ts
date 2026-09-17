/**
 * Automatic daily backup — scheduling behaviour.
 *
 * Regression guard for the reported bug: the automatic backup must be driven
 * by the clock (local midnight), never by an app start or restart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  localDateKey,
  msUntilNextLocalMidnight,
  startDailyBackupScheduler,
} from '../services/backupScheduler';
import { dailyBackupIfNeeded } from '../services/tauriDataService';

// The scheduler is the only caller of the Tauri backup command here.
vi.mock('../services/tauriDataService', () => ({
  dailyBackupIfNeeded: vi.fn(),
}));

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const backupResult = {
  filename: 'inven_tory_local_2026-09-17_00-00-00.db',
  path: 'C:/data/backups/inven_tory_local_2026-09-17_00-00-00.db',
  size: 4096,
  created_at: '2026-09-17T00:00:00.000Z',
};

describe('backupScheduler — time helpers', () => {
  it('localDateKey formats the local calendar date', () => {
    expect(localDateKey(new Date(2026, 8, 17, 13, 45, 0))).toBe('2026-09-17');
  });

  it('msUntilNextLocalMidnight returns the remaining ms of the day', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 16, 23, 30, 0, 0))).toBe(30 * 60 * 1000);
  });

  it('msUntilNextLocalMidnight returns a full day at exactly midnight', () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 8, 16, 0, 0, 0, 0))).toBe(MS_PER_DAY);
  });
});

describe('backupScheduler — automatic backups', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(dailyBackupIfNeeded).mockReset();
    vi.mocked(dailyBackupIfNeeded).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not create a backup at start-up — only at local midnight', async () => {
    // Start the app at 23:59:30 → 30 s left until midnight.
    let clock = new Date(2026, 8, 16, 23, 59, 30, 0);
    const stop = startDailyBackupScheduler({ now: () => clock });

    // Launch / restart alone must never trigger a backup.
    expect(dailyBackupIfNeeded).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(29_000);
    expect(dailyBackupIfNeeded).not.toHaveBeenCalled();

    // Midnight arrives → exactly one backup for the new day.
    clock = new Date(2026, 8, 17, 0, 0, 0, 0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(dailyBackupIfNeeded).toHaveBeenCalledTimes(1);

    // Another full day → one more backup (once per day, not per restart).
    clock = new Date(2026, 8, 18, 0, 0, 0, 0);
    await vi.advanceTimersByTimeAsync(MS_PER_DAY + 2_000);
    expect(dailyBackupIfNeeded).toHaveBeenCalledTimes(2);

    stop();
  });

  it('reports the created backup through onBackup', async () => {
    vi.mocked(dailyBackupIfNeeded).mockResolvedValue(backupResult);
    const onBackup = vi.fn();

    let clock = new Date(2026, 8, 16, 23, 59, 30, 0);
    const stop = startDailyBackupScheduler({ now: () => clock, onBackup });

    clock = new Date(2026, 8, 17, 0, 0, 0, 0);
    await vi.advanceTimersByTimeAsync(31_000);

    expect(onBackup).toHaveBeenCalledWith(backupResult);

    stop();
  });

  it('stop() cancels the pending midnight run', async () => {
    let clock = new Date(2026, 8, 16, 23, 59, 30, 0);
    const stop = startDailyBackupScheduler({ now: () => clock });
    stop();

    clock = new Date(2026, 8, 17, 0, 0, 5, 0);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(dailyBackupIfNeeded).not.toHaveBeenCalled();
  });

  it('catches up a midnight that passed while the machine was suspended', async () => {
    // Machine goes to sleep at 23:00 and wakes at 08:00 the next day: the
    // deferred timer may not fire, so the resume check runs the backup.
    let clock = new Date(2026, 8, 16, 23, 0, 0, 0);
    const stop = startDailyBackupScheduler({ now: () => clock });

    clock = new Date(2026, 8, 17, 8, 0, 0, 0);
    window.dispatchEvent(new Event('focus'));

    await vi.waitFor(() => {
      expect(dailyBackupIfNeeded).toHaveBeenCalledTimes(1);
    });

    stop();
  });

  it('does not run again on resume when the date has not changed', async () => {
    const clock = new Date(2026, 8, 16, 10, 0, 0, 0);
    const stop = startDailyBackupScheduler({ now: () => clock });

    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();

    expect(dailyBackupIfNeeded).not.toHaveBeenCalled();

    stop();
  });
});
