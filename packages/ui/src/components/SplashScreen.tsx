import React from 'react';
import { Spinner } from './Spinner';

export interface SplashScreenProps {
  /** Status line shown under the spinner. */
  label?: string;
  /** Small caption under the brand name (e.g. "Desktop client"). */
  caption?: string;
}

/**
 * Full-screen boot splash shown while the app resolves its startup state
 * (genesis/auth bootstrap on desktop, token hydration on web). Shared by
 * apps/desktop, apps/web and the desktop UI Lab previews.
 */
export function SplashScreen({
  label = 'Starting…',
  caption,
}: SplashScreenProps): React.ReactElement {
  return (
    <div
      data-testid="splash-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: 'var(--it-bg)',
        padding: 32,
      }}
    >
      <div
        style={{
          width: 360,
          background: 'var(--it-card)',
          border: '1px solid var(--it-border)',
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <img src="/favicon.svg" alt="" aria-hidden="true" width={48} height={48} />
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--it-text-primary)' }}>
          inven-Tory
        </div>
        {caption && (
          <div
            style={{
              fontSize: 11,
              fontFamily: 'var(--it-font-mono)',
              color: 'var(--it-text-disabled)',
            }}
          >
            {caption}
          </div>
        )}
        <Spinner size="md" />
        <div style={{ fontSize: 13, color: 'var(--it-text-secondary)' }}>{label}</div>
      </div>
    </div>
  );
}
