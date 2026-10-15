/**
 * UI Lab tests — gallery, persisted startup override, mock invoke layer and
 * the GenesisWizard lab-only props.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import UiLab from '../uiLab/UiLab';
import {
  getUiLabState,
  setUiLab,
  openUiLab,
  closeUiLab,
  setStartupScenario,
  STARTUP_SCENARIO_KEY,
} from '../uiLab/state';
import {
  handleLabInvoke,
  installLabMocks,
  uninstallLabMocks,
  setLabProfile,
  isLabMockInstalled,
  MOCK_STORES,
} from '../uiLab/labMock';
import { LAB_ENTRIES, findLabEntry } from '../uiLab/registry';
import { GenesisWizard } from '../views/GenesisWizard';

type Internals = { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };

const internals = (): Internals =>
  (window as unknown as Record<string, Internals>).__TAURI_INTERNALS__;

function resetLab(): void {
  act(() => {
    closeUiLab();
    setStartupScenario(null);
    setUiLab({ profile: 'realistic', view: 'gallery', entryId: null });
  });
  uninstallLabMocks();
  localStorage.removeItem(STARTUP_SCENARIO_KEY);
}

beforeEach(resetLab);
afterEach(resetLab);

describe('UI Lab — state store', () => {
  it('opens into gallery view and closes', () => {
    openUiLab();
    expect(getUiLabState().open).toBe(true);
    expect(getUiLabState().view).toBe('gallery');
    closeUiLab();
    expect(getUiLabState().open).toBe(false);
  });

  it('persists and clears the startup scenario override', () => {
    setStartupScenario('login');
    expect(getUiLabState().view).toBe('scenario');
    expect(getUiLabState().startupScenario).toBe('login');
    expect(localStorage.getItem(STARTUP_SCENARIO_KEY)).toContain('login');

    setStartupScenario(null);
    expect(getUiLabState().startupScenario).toBeNull();
    expect(localStorage.getItem(STARTUP_SCENARIO_KEY)).toBeNull();
  });
});

describe('UI Lab — mock invoke layer', () => {
  it('returns realistic fixtures by default', async () => {
    await expect(handleLabInvoke('get_stores')).resolves.toEqual(MOCK_STORES);
    const products = await handleLabInvoke('get_products');
    expect(Array.isArray(products)).toBe(true);
    expect((products as unknown[]).length).toBeGreaterThan(0);
  });

  it('returns empty collections under the empty profile', async () => {
    setLabProfile('empty');
    await expect(handleLabInvoke('get_stores')).resolves.toEqual([]);
    await expect(handleLabInvoke('get_products')).resolves.toEqual([]);
  });

  it('rejects every command under the error profile', async () => {
    setLabProfile('error');
    await expect(handleLabInvoke('get_stores')).rejects.toThrow(/simulated failure/);
    await expect(handleLabInvoke('local_login')).rejects.toThrow(/Invalid username or password/);
  });

  it('never passes unknown writes through to the backend', async () => {
    setLabProfile('realistic');
    await expect(handleLabInvoke('drop_database')).rejects.toThrow(/no mock for Tauri command/);
    await expect(handleLabInvoke('get_unknown_thing')).resolves.toEqual([]);
  });

  it('wraps and restores window.__TAURI_INTERNALS__.invoke', async () => {
    const before = internals().invoke;
    installLabMocks('realistic');
    expect(isLabMockInstalled()).toBe(true);
    expect(internals().invoke).not.toBe(before);
    await expect(internals().invoke!('get_stores')).resolves.toEqual(MOCK_STORES);

    uninstallLabMocks();
    expect(isLabMockInstalled()).toBe(false);
    expect(internals().invoke).toBe(before);
  });
});

describe('UI Lab — gallery UI', () => {
  it('shows the dev entry button while closed and opens the gallery', () => {
    renderWithProviders(<UiLab />);
    expect(screen.getByTestId('lab-entry-button')).toBeInTheDocument();
    expect(screen.queryByTestId('lab-overlay')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lab-entry-button'));
    expect(screen.getByTestId('lab-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('lab-search')).toBeInTheDocument();
    expect(screen.getByTestId('lab-card-login')).toBeInTheDocument();
    expect(screen.getByTestId('lab-card-first-run')).toBeInTheDocument();
  });

  it('filters entries via search', () => {
    act(() => openUiLab());
    renderWithProviders(<UiLab />);
    const input = screen.getByTestId('lab-search');
    fireEvent.change(input, { target: { value: 'restore' } });
    expect(screen.getByTestId('lab-card-restore')).toBeInTheDocument();
    expect(screen.queryByTestId('lab-card-login')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzz-nothing' } });
    expect(screen.queryByTestId('lab-card-restore')).not.toBeInTheDocument();
    expect(screen.getByText(/No entries match/)).toBeInTheDocument();
  });

  it('previews an entry and returns to the gallery', () => {
    act(() => openUiLab());
    renderWithProviders(<UiLab />);
    fireEvent.click(screen.getByTestId('lab-card-login'));
    expect(screen.getByTestId('lab-preview')).toBeInTheDocument();
    expect(screen.getByTestId('login-view')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lab-back'));
    expect(screen.getByTestId('lab-search')).toBeInTheDocument();
    expect(screen.queryByTestId('lab-preview')).not.toBeInTheDocument();
  });

  it('activates and exits a startup scenario override', () => {
    act(() => openUiLab('first-run'));
    renderWithProviders(<UiLab />);
    fireEvent.click(screen.getByTestId('lab-set-startup'));

    expect(getUiLabState().view).toBe('scenario');
    expect(localStorage.getItem(STARTUP_SCENARIO_KEY)).toContain('first-run');
    expect(screen.getByTestId('lab-scenario')).toBeInTheDocument();
    expect(screen.getByTestId('genesis-wizard')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('lab-exit-app'));
    expect(getUiLabState().open).toBe(false);
    expect(localStorage.getItem(STARTUP_SCENARIO_KEY)).toBeNull();
  });

  it('switches mock profile from the toolbar', () => {
    act(() => openUiLab());
    renderWithProviders(<UiLab />);
    fireEvent.change(screen.getByTestId('lab-profile-select'), { target: { value: 'empty' } });
    expect(getUiLabState().profile).toBe('empty');
  });
});

describe('UI Lab — registry sanity', () => {
  it('covers every startup scenario with a renderer', () => {
    const startups = LAB_ENTRIES.filter((e) => e.startup);
    expect(startups.length).toBeGreaterThanOrEqual(10);
    for (const entry of startups) {
      expect(typeof entry.render).toBe('function');
      expect(findLabEntry(entry.id)).toBe(entry);
    }
  });

  it('has unique entry ids', () => {
    const ids = LAB_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('GenesisWizard — UI Lab props', () => {
  const base = {
    state: { ready: false, has_user_with_pin: false, has_any_store: false, has_tables: true },
    onComplete: () => {},
    onCancel: () => {},
    running: false,
    error: null,
    onRun: async () => ({
      success: true,
      result: { success: true, message: 'ok', username: 'admin', store_code: 'MAIN' },
      newState: null,
    }),
  };

  it('keeps default behaviour without lab props', () => {
    renderWithProviders(<GenesisWizard {...base} />);
    expect(screen.getByTestId('genesis-selection')).toBeInTheDocument();
  });

  it('starts at the requested mode and step with lab props', () => {
    renderWithProviders(<GenesisWizard {...base} initialMode="fresh" initialStep={1} />);
    expect(screen.getByTestId('genesis-step-store')).toBeInTheDocument();
    expect(screen.queryByTestId('genesis-selection')).not.toBeInTheDocument();
  });
});
