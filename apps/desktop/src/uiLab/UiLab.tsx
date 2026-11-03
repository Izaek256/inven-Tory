/**
 * UI Lab — DEVELOPMENT ONLY component gallery & startup scenario overrides.
 *
 * Mounted from main.tsx behind `import.meta.env.DEV` (compile-time constant;
 * stripped from production builds). Provides:
 *   - searchable gallery of screens / dialogs / wizards / states
 *   - direct previews of every entry using the real components
 *   - persisted startup scenario overrides (App.tsx skips its real bootstrap
 *     while the lab is open, so nothing real runs)
 *   - mock response profile switch (realistic / empty / slow / error)
 *
 * While open, Tauri commands are answered from labMock fixtures — no SQLite,
 * no auth records, no server sync is touched.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical, Search, ChevronLeft, ChevronRight, X, Play, RotateCcw } from 'lucide-react';
import {
  useUiLabState,
  getUiLabState,
  setUiLab,
  openUiLab,
  closeUiLab,
  setStartupScenario,
  isUiLabEnabled,
  type LabProfile,
  type UiLabState,
} from './state';
import { installLabMocks, uninstallLabMocks } from './labMock';
import { LAB_ENTRIES, LAB_CATEGORIES, findLabEntry, type LabEntry } from './registry';

const PROFILE_OPTIONS: { value: LabProfile; label: string }[] = [
  { value: 'realistic', label: 'Realistic data' },
  { value: 'empty', label: 'Empty data' },
  { value: 'slow', label: 'Slow (1.2s)' },
  { value: 'error', label: 'All failures' },
];

const barStyle: React.CSSProperties = {
  position: 'relative',
  // Above fixed preview layers so Back/Hide stay clickable: Modal backdrop is
  // z-index 200, the splash is 100, the store-switch overlay is 9999.
  zIndex: 300,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  borderBottom: '1px solid var(--it-border)',
  background: 'var(--it-card)',
  flex: '0 0 auto',
  flexWrap: 'wrap',
};

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--it-text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  padding: '6px 10px',
  border: '1px solid var(--it-border)',
  background: 'var(--it-card)',
  color: 'var(--it-text-primary)',
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--amber)',
  borderColor: 'var(--amber)',
  color: '#241300',
};

const selectStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: '6px 8px',
  border: '1px solid var(--it-border)',
  background: 'var(--it-bg)',
  color: 'var(--it-text-primary)',
};

function ProfileSelect({ value }: { value: LabProfile }): React.ReactElement {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--it-text-secondary)',
      }}
    >
      <span>Mock profile</span>
      <select
        aria-label="Mock response profile"
        data-testid="lab-profile-select"
        value={value}
        onChange={(e) => setUiLab({ profile: e.target.value as LabProfile })}
        style={selectStyle}
      >
        {PROFILE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const startupEntries = (): LabEntry[] => LAB_ENTRIES.filter((e) => e.startup);

function ScenarioSwitcher({ entryId }: { entryId: string | null }): React.ReactElement | null {
  const list = startupEntries();
  const idx = list.findIndex((e) => e.id === entryId);
  if (idx < 0) return null;
  const go = (next: number): void => {
    const target = list[(next + list.length) % list.length];
    setStartupScenario(target.id);
  };
  return (
    <>
      <button
        type="button"
        aria-label="Previous scenario"
        style={btnStyle}
        onClick={() => go(idx - 1)}
      >
        <ChevronLeft size={14} />
      </button>
      <select
        aria-label="Startup scenario"
        data-testid="lab-scenario-select"
        value={entryId ?? ''}
        onChange={(e) => setStartupScenario(e.target.value)}
        style={{ ...selectStyle, minWidth: 220 }}
      >
        {list.map((e) => (
          <option key={e.id} value={e.id}>
            {e.title}
          </option>
        ))}
      </select>
      <button type="button" aria-label="Next scenario" style={btnStyle} onClick={() => go(idx + 1)}>
        <ChevronRight size={14} />
      </button>
    </>
  );
}

function Gallery({ state }: { state: UiLabState }): React.ReactElement {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LAB_ENTRIES;
    return LAB_ENTRIES.filter((e) =>
      `${e.title} ${e.description} ${e.category} ${e.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [query]);

  const openEntry = (entry: LabEntry): void => {
    setUiLab({
      view: 'preview',
      entryId: entry.id,
      ...(entry.profile ? { profile: entry.profile } : {}),
    });
  };

  return (
    <>
      <div style={barStyle}>
        <span style={titleStyle}>
          <FlaskConical size={16} color="var(--amber)" />
          UI Lab
        </span>
        <span
          data-testid="lab-dev-badge"
          style={{
            fontSize: 10,
            fontFamily: 'var(--it-font-mono)',
            fontWeight: 700,
            padding: '2px 6px',
            border: '1px solid var(--amber)',
            background: 'var(--amber-tint)',
            color: 'var(--amber-ink)',
          }}
        >
          DEV ONLY
        </span>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Search size={14} color="var(--it-text-secondary)" aria-hidden="true" />
          <input
            data-testid="lab-search"
            type="search"
            placeholder="Search screens, dialogs, states…"
            aria-label="Search the UI Lab"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              fontSize: 13,
              padding: '7px 10px',
              width: 280,
              border: '1px solid var(--it-border)',
              background: 'var(--it-bg)',
              color: 'var(--it-text-primary)',
            }}
          />
        </label>
        <ProfileSelect value={state.profile} />
        <button
          type="button"
          aria-label="Hide UI Lab"
          data-testid="lab-close"
          style={btnStyle}
          onClick={closeUiLab}
        >
          <X size={14} />
          Hide
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
        {state.startupScenario && (
          <div
            data-testid="lab-startup-active"
            style={{
              marginBottom: 16,
              padding: '10px 14px',
              background: 'var(--amber-tint)',
              border: '1px solid var(--amber)',
              color: 'var(--amber-ink)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            Startup override active: <strong>{findLabEntry(state.startupScenario)?.title}</strong>
            <button
              type="button"
              style={btnStyle}
              onClick={() => {
                setStartupScenario(null);
                closeUiLab();
              }}
            >
              <RotateCcw size={13} /> Clear &amp; open app
            </button>
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ color: 'var(--it-text-secondary)', fontSize: 13 }}>
            No entries match “{query}”.
          </div>
        )}

        {LAB_CATEGORIES.map((cat) => {
          const items = filtered.filter((e) => e.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat} style={{ marginBottom: 24 }}>
              <h2
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--it-text-secondary)',
                  margin: '0 0 10px',
                }}
              >
                {cat} · {items.length}
              </h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 12,
                }}
              >
                {items.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    data-testid={`lab-card-${entry.id}`}
                    onClick={() => openEntry(entry)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      background: 'var(--it-card)',
                      border: '1px solid var(--it-border)',
                      cursor: 'pointer',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--it-text-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {entry.title}
                      {entry.startup && (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: 'var(--it-font-mono)',
                            border: '1px solid var(--it-border)',
                            padding: '1px 5px',
                            color: 'var(--it-text-secondary)',
                          }}
                        >
                          STARTUP
                        </span>
                      )}
                    </span>
                    <span
                      style={{ fontSize: 12, color: 'var(--it-text-secondary)', lineHeight: 1.45 }}
                    >
                      {entry.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Preview({ state, entry }: { state: UiLabState; entry: LabEntry }): React.ReactElement {
  const isActiveStartup = state.startupScenario === entry.id;
  return (
    <>
      <div style={barStyle}>
        <button
          type="button"
          data-testid="lab-back"
          style={btnStyle}
          onClick={() => setUiLab({ view: 'gallery', entryId: null })}
        >
          <ChevronLeft size={14} />
          Gallery
        </button>
        <span style={titleStyle}>{entry.title}</span>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--it-font-mono)',
            border: '1px solid var(--it-border)',
            padding: '2px 6px',
            color: 'var(--it-text-secondary)',
          }}
        >
          {entry.category}
        </span>
        <div style={{ flex: 1 }} />
        <ProfileSelect value={state.profile} />
        {entry.startup &&
          (isActiveStartup ? (
            <button
              type="button"
              data-testid="lab-clear-startup"
              style={btnStyle}
              onClick={() => setStartupScenario(null)}
            >
              <RotateCcw size={13} />
              Clear startup override
            </button>
          ) : (
            <button
              type="button"
              data-testid="lab-set-startup"
              style={primaryBtnStyle}
              onClick={() => setStartupScenario(entry.id)}
            >
              <Play size={13} />
              Use as startup scenario
            </button>
          ))}
        <button
          type="button"
          aria-label="Hide UI Lab"
          data-testid="lab-close"
          style={btnStyle}
          onClick={closeUiLab}
        >
          <X size={14} />
          Hide
        </button>
      </div>
      <div
        data-testid="lab-preview"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {entry.render()}
      </div>
    </>
  );
}

function Scenario({ state, entry }: { state: UiLabState; entry: LabEntry }): React.ReactElement {
  return (
    <>
      <div style={{ ...barStyle, background: 'var(--amber-tint)', borderColor: 'var(--amber)' }}>
        <span style={{ ...titleStyle, color: 'var(--amber-ink)' }}>
          <FlaskConical size={15} />
          Startup scenario preview
        </span>
        <span
          data-testid="lab-scenario-badge"
          style={{
            fontSize: 9,
            fontFamily: 'var(--it-font-mono)',
            fontWeight: 700,
            border: '1px solid var(--amber)',
            color: 'var(--amber-ink)',
            padding: '2px 6px',
          }}
        >
          OVERRIDE ACTIVE
        </span>
        <ScenarioSwitcher entryId={state.startupScenario} />
        <div style={{ flex: 1 }} />
        <ProfileSelect value={state.profile} />
        <button
          type="button"
          data-testid="lab-to-gallery"
          style={btnStyle}
          onClick={() => setUiLab({ view: 'gallery', entryId: null })}
        >
          <FlaskConical size={13} />
          Gallery
        </button>
        <button
          type="button"
          data-testid="lab-exit-app"
          style={primaryBtnStyle}
          onClick={() => {
            setStartupScenario(null);
            closeUiLab();
          }}
        >
          <X size={13} />
          Exit override &amp; open app
        </button>
      </div>
      <div
        data-testid="lab-scenario"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {entry.render()}
      </div>
    </>
  );
}

function LabButton(): React.ReactElement {
  return (
    <button
      type="button"
      data-testid="lab-entry-button"
      onClick={() => openUiLab()}
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 99999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontFamily: 'var(--it-font-mono)',
        fontWeight: 700,
        padding: '7px 11px',
        border: '1px solid var(--amber)',
        background: 'var(--amber-tint)',
        color: 'var(--amber-ink)',
        cursor: 'pointer',
        boxShadow: 'var(--it-shadow-md, 0 4px 16px rgba(0,0,0,0.25))',
      }}
      title="Open the UI Lab (Ctrl+Shift+L)"
    >
      <FlaskConical size={13} />
      UI LAB
    </button>
  );
}

export default function UiLab(): React.ReactElement | null {
  const state = useUiLabState();
  const autoOpened = useRef(false);

  // Deep link (dev convenience only — never a security boundary):
  //   ?ui-lab=1            → open gallery
  //   ?ui-lab=<entry-id>   → open that preview/scenario
  useEffect(() => {
    if (autoOpened.current || !isUiLabEnabled()) return;
    autoOpened.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('ui-lab')) return;
    const value = params.get('ui-lab');
    const entry = value && value !== '1' ? findLabEntry(value) : null;
    if (!getUiLabState().open) openUiLab(entry ? entry.id : undefined);
    params.delete('ui-lab');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  // Mock interceptor lifecycle: active exactly while the lab is open.
  useEffect(() => {
    if (!isUiLabEnabled()) return;
    if (state.open) installLabMocks(state.profile);
    else uninstallLabMocks();
  }, [state.open, state.profile]);

  useEffect(() => () => uninstallLabMocks(), []);

  // Ctrl/Cmd + Shift + L toggles the lab.
  useEffect(() => {
    if (!isUiLabEnabled()) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
        e.preventDefault();
        if (getUiLabState().open) closeUiLab();
        else openUiLab();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!isUiLabEnabled()) return null;
  if (!state.open) return <LabButton />;

  const entry =
    state.view === 'scenario' ? findLabEntry(state.startupScenario) : findLabEntry(state.entryId);

  return (
    <div
      data-testid="lab-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--it-bg)',
        color: 'var(--it-text-primary)',
      }}
    >
      {state.view === 'gallery' || !entry ? (
        <Gallery state={state} />
      ) : state.view === 'scenario' ? (
        <Scenario state={state} entry={entry} />
      ) : (
        <Preview state={state} entry={entry} />
      )}
    </div>
  );
}
