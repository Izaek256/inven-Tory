import React from 'react';
import { ThemeToggle, EmptyState } from '@inven-tory/ui';
import { LayoutDashboard } from 'lucide-react';

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
          height: '64px',
          backgroundColor: 'var(--it-surface)',
          borderBottom: '1px solid var(--it-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: 'var(--it-green-surface)',
              border: '1px solid var(--it-green-border)',
              borderRadius: 'var(--it-r-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-green-text)',
              fontWeight: 700,
              fontFamily: 'var(--it-font-mono)',
            }}
          >
            IT
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 700 }}>INVENTORY Tory — Web Dashboard</h1>
        </div>
        <ThemeToggle />
      </header>

      <main style={{ padding: '48px 24px' }}>
        <EmptyState
          icon={<LayoutDashboard size={24} />}
          heading="Remote Management Dashboard"
          body="Notification center, global search, and cloud analytics dashboard stub."
        />
      </main>
    </div>
  );
}

export default App;
