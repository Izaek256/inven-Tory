/**
 * Automatic daily backup scheduler.
 *
 * The automatic backup is a *time*-triggered job, never a launch-triggered one:
 *
 *   - It fires at local midnight while the app is running (see
 *     `startDailyBackupScheduler`).
 *   - Restarting the app never creates a backup by itself.
 *   - A user-initiated backup is the "Create Backup Now" action in Settings
 *     (`createLocalBackup` in `tauriDataService`).
 *
 * If the machine is asleep/hidden across midnight the OS may defer the timer.
 * The scheduler therefore also re-checks on wake/focus and runs the (still
 * once-per-day guarded) backup when the local date rolled over.
 */

import { dailyBackupIfNeeded, type BackupInfo } from './tauriDataService';

/** `setTimeout`'s maximum delay (2^31 - 1 ms ≈ 24.8 days). */
const MAX_TIMEOUT_MS = 2_147_483_647;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for the given instant, in the machine's local time zone. */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Milliseconds from `from` until the next local midnight (00:00:00.000 local).
 * Always returns a positive value.
 */
export function msUntilNextLocalMidnight(from: Date = new Date()): number {
  const next = new Date(from.getTime());
  next.setHours(24, 0, 0, 0);
  const delta = next.getTime() - from.getTime();
  return delta > 0 ? delta : MS_PER_DAY;
}

export interface DailyBackupSchedulerOptions {
  /** Invoked after each scheduled run with the created backup (or `null`). */
  onBackup?: (info: BackupInfo | null) => void;
  /** Injectable clock — used by tests. Defaults to the system clock. */
  now?: () => Date;
}

/**
 * Start the midnight backup scheduler.
 *
 * Returns a `stop` function that clears the timer and removes the wake/focus
 * listeners — call it when the app is unauthenticated or unmounted.
 */
export function startDailyBackupScheduler(options: DailyBackupSchedulerOptions = {}): () => void {
  const now = options.now ?? ((): Date => new Date());
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Local date the scheduler last observed — detects a midnight that passed
  // while the machine was suspended.
  let observedDate = localDateKey(now());

  const runBackup = async (): Promise<void> => {
    observedDate = localDateKey(now());
    try {
      const info = await dailyBackupIfNeeded();
      options.onBackup?.(info ?? null);
    } catch {
      // Backup failures are non-fatal — the next midnight retries.
    }
  };

  const scheduleNextMidnight = (): void => {
    if (stopped) return;
    const delay = Math.min(msUntilNextLocalMidnight(now()), MAX_TIMEOUT_MS);
    timer = setTimeout(() => {
      if (stopped) return;
      void runBackup().finally(scheduleNextMidnight);
    }, delay);
  };

  const handleResume = (): void => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (localDateKey(now()) === observedDate) return;
    void runBackup();
  };

  scheduleNextMidnight();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleResume);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleResume);
  }

  return (): void => {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleResume);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleResume);
    }
  };
}
