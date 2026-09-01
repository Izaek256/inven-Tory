import React, { useState } from 'react';
import { ThemeToggle, EmptyState } from '@inven-tory/ui';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { LoginForm } from './components/LoginForm';

function App(): React.ReactElement {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);

  const handleLoginSuccess = (session: {
    access_token: string;
    user_id: number;
    username: string;
    role: string;
  }): void => {
    // Store token in localStorage (for web)
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
          padding: '24px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '400px',
            backgroundColor: 'var(--it-card)',
            border: '1px solid var(--it-border)',
            borderRadius: 'var(--it-r-lg)',
            padding: '40px 32px',
            boxShadow: 'var(--it-shadow-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                backgroundColor: 'var(--it-green-surface)',
                border: '1px solid var(--it-green-border)',
                borderRadius: 'var(--it-r-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--it-green-text)',
                fontWeight: 700,
                fontFamily: 'var(--it-font-mono)',
                fontSize: '16px',
              }}
            >
              IT
            </div>
            <div>
              <h1
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--it-text-primary)',
                  lineHeight: 1.2,
                }}
              >
                INVENTORY Tory
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--it-text-secondary)' }}>Web Dashboard</p>
            </div>
          </div>

          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--it-text-primary)',
              marginBottom: '24px',
            }}
          >
            Sign In
          </h2>

          <LoginForm onLoginSuccess={handleLoginSuccess} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', color: 'var(--it-text-secondary)' }}>
            {user?.username} ({user?.role})
          </span>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              backgroundColor: 'var(--it-surface)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              color: 'var(--it-text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
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
