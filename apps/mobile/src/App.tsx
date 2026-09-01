import React, { useState } from 'react';
import { ThemeToggle, EmptyState } from '@inven-tory/ui';
import { Smartphone, LogOut } from 'lucide-react';
import { MobileLoginForm } from './components/MobileLoginForm';

function App(): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);

  const handleLoginSuccess = (session: {
    access_token: string;
    user_id: number;
    username: string;
    role: string;
  }): void => {
    // Store token in localStorage (for mobile PWA)
    localStorage.setItem('access_token', session.access_token);
    setUser({ username: session.username, role: session.role });
    setIsAuthenticated(true);
  };

  const handleLogout = (): void => {
    localStorage.removeItem('access_token');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--it-bg)',
          color: 'var(--it-text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '360px',
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '32px 24px',
            boxShadow: 'var(--it-shadow-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '24px',
            }}
          >
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
                fontSize: '14px',
              }}
            >
              IT
            </div>
            <div>
              <h1
                style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--it-text-primary)',
                  lineHeight: 1.2,
                }}
              >
                INVENTORY Tory
              </h1>
              <p style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
                Mobile Companion
              </p>
            </div>
          </div>

          <h2
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--it-text-primary)',
              marginBottom: '20px',
            }}
          >
            Sign In
          </h2>

          <MobileLoginForm onLoginSuccess={handleLoginSuccess} />
        </div>
      </div>
    );
  }

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>
            {user?.username}
          </span>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: 'var(--it-surface)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              color: 'var(--it-text-primary)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            <LogOut size={14} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main style={{ padding: '32px 16px' }}>
        <EmptyState
          icon={<Smartphone size={24} />}
          heading="Read-Only Mobile Companion"
          body="Read-only mobile stock lookup companion (FR-MOBILE-003)."
        />
      </main>
    </div>
  );
}

export default App;
