import React from 'react';
import { ThemeToggle, EmptyState } from '@inven-tory/ui';
import { Smartphone } from 'lucide-react';

function App(): React.ReactElement {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--it-bg)',
        color: 'var(--it-text-primary)',
      }}
    >
      <header
        style={{
          height: '56px',
          backgroundColor: 'var(--it-surface)',
          borderBottom: '1px solid var(--it-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: 'var(--it-green-surface)',
              border: '1px solid var(--it-green-border)',
              borderRadius: 'var(--it-r-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-green-text)',
              fontWeight: 700,
              fontFamily: 'var(--it-font-mono)',
              fontSize: '12px',
            }}
          >
            IT
          </div>
          <h1 style={{ fontSize: '16px', fontWeight: 700 }}>INVENTORY Tory Companion</h1>
        </div>
        <ThemeToggle />
      </header>

      <main style={{ padding: '32px 16px' }}>
        <EmptyState
          icon={<Smartphone size={24} />}
          heading="Read-Only Mobile Companion"
          body="Read-only mobile stock lookup companion stub (FR-MOBILE-003)."
        />
      </main>
    </div>
  );
}

export default App;
