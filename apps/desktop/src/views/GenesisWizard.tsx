import React, { useState } from 'react';
import { Sparkles, AlertCircle, Check, Loader2, Database, RefreshCw } from 'lucide-react';
import { Button, TextInput, Card } from '@invenTory/ui';
import type { GenesisState, RestorePreview, RestoreProgress } from '../hooks/useGenesisState';

interface GenesisWizardProps {
  state: GenesisState;
  onComplete: (username: string, storeCode: string) => void;
  onCancel: () => void;
  running: boolean;
  error: string | null;
  onRun: (params: {
    username: string;
    email: string;
    fullName: string;
    password: string;
    role: string;
    storeCode: string;
    storeName: string;
    storeAddress?: string;
    apiBaseUrl?: string;
  }) => Promise<{
    success: boolean;
    result: {
      success: boolean;
      message: string;
      username: string | null;
      store_code: string | null;
    } | null;
    newState: GenesisState | null;
    error?: string;
  }>;
  onValidateRestore?: (params: {
    apiBaseUrl: string;
    username: string;
    password: string;
  }) => Promise<{ success: boolean; preview: RestorePreview | null; error: string | null }>;
  onStartRestore?: (params: {
    apiBaseUrl: string;
    username: string;
    password: string;
  }) => Promise<{ success: boolean; error: string | null }>;
  onGetRestoreProgress?: () => Promise<{
    success: boolean;
    progress: RestoreProgress | null;
    error: string | null;
  }>;
  /** Called immediately after restore kicks off — App.tsx takes over polling and dismisses wizard */
  onRestoreStarted?: (username: string) => void;
}

const FRESH_SETUP_STEPS = [
  { id: 'account', label: 'Account' },
  { id: 'store', label: 'Store' },
  { id: 'connect', label: 'Connect' },
];

const RESTORE_STEPS = [
  { id: 'connect', label: 'Connect' },
  { id: 'preview', label: 'Preview' },
  { id: 'restore', label: 'Restore' },
];

export const GenesisWizard: React.FC<GenesisWizardProps> = ({
  state,
  onComplete,
  onCancel,
  running,
  error,
  onRun,
  onValidateRestore,
  onStartRestore,
  onGetRestoreProgress,
  onRestoreStarted,
}) => {
  void state;
  const [setupMode, setSetupMode] = useState<'selection' | 'fresh' | 'restore'>('selection');
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('admin');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('GLOBAL_ADMIN');
  const [storeCode, setStoreCode] = useState('MAIN');
  const [storeName, setStoreName] = useState('My Store');
  const [storeAddress, setStoreAddress] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Restore-specific state
  const [restoreUsername, setRestoreUsername] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreValidating, setRestoreValidating] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<{
    phase: string;
    currentStep: string;
    progressPercent: number;
    criticalComplete: boolean;
    canUseApp: boolean;
    totalComplete: boolean;
  } | null>(null);
  const restorePollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const roles = [
    { value: 'GLOBAL_ADMIN', label: 'Global Admin' },
    { value: 'STORE_MANAGER', label: 'Store Manager' },
    { value: 'STORE_CLERK', label: 'Store Clerk' },
    { value: 'AUDITOR', label: 'Auditor' },
  ];

  const currentSteps =
    setupMode === 'fresh' ? FRESH_SETUP_STEPS : setupMode === 'restore' ? RESTORE_STEPS : [];

  const canProceed = (): boolean => {
    if (setupMode === 'selection') return true;

    if (setupMode === 'fresh') {
      if (step === 0) {
        if (!username.trim()) return false;
        if (!password || password.length < 8) return false;
        if (password !== confirmPassword) return false;
        if (!email.trim() || !email.includes('@')) return false;
        return true;
      }
      if (step === 1) {
        if (!storeCode.trim()) return false;
        if (!storeName.trim()) return false;
        return true;
      }
      return true;
    }

    if (setupMode === 'restore') {
      if (step === 0) {
        if (!apiBaseUrl.trim()) return false;
        if (!restoreUsername.trim()) return false;
        if (!restorePassword) return false;
        return true;
      }
      if (step === 1) {
        return !!restorePreview;
      }
      if (step === 2) {
        return false;
      }
      return true;
    }
    return true;
  };

  React.useEffect((): (() => void) => {
    return (): void => {
      if (restorePollRef.current) {
        clearInterval(restorePollRef.current);
        restorePollRef.current = null;
      }
    };
  }, []);

  const handleValidateRestore = async (): Promise<void> => {
    if (!onValidateRestore) return;

    setRestoreValidating(true);
    setRestoreError(null);
    try {
      const result = await onValidateRestore({
        apiBaseUrl: apiBaseUrl.trim(),
        username: restoreUsername.trim(),
        password: restorePassword,
      });

      if (result.success && result.preview) {
        setRestorePreview(result.preview);
        setStep(step + 1);
      } else {
        setRestoreError(result.error || 'Failed to validate server credentials');
      }
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoreValidating(false);
    }
  };

  const handleStartRestore = async (): Promise<void> => {
    if (!onStartRestore) return;

    setSubmitted(true);
    setRestoreError(null);
    try {
      const result = await onStartRestore({
        apiBaseUrl: apiBaseUrl.trim(),
        username: restoreUsername.trim(),
        password: restorePassword,
      });

      if (result.success) {
        setSubmitted(false);
        // Hand off to App.tsx: it will poll progress in the Header and dismiss this wizard
        if (onRestoreStarted) {
          onRestoreStarted(restoreUsername.trim());
        } else {
          // Fallback: advance to progress screen if no App-level handler
          setStep(2);
          if (!onGetRestoreProgress) {
            setTimeout(() => onComplete(restoreUsername.trim(), 'RESTORED'), 1000);
            return;
          }
          if (restorePollRef.current) clearInterval(restorePollRef.current);
          restorePollRef.current = setInterval(async () => {
            try {
              const prog = await onGetRestoreProgress();
              if (prog.success && prog.progress) {
                const p = prog.progress as {
                  phase: string;
                  current_step: string;
                  progress_percent: number;
                  critical_complete: boolean;
                  can_use_app: boolean;
                  total_complete: boolean;
                };
                setRestoreProgress({
                  phase: p.phase,
                  currentStep: p.current_step,
                  progressPercent: p.progress_percent,
                  criticalComplete: p.critical_complete,
                  canUseApp: p.can_use_app,
                  totalComplete: p.total_complete,
                });
                if (p.total_complete) {
                  if (restorePollRef.current) {
                    clearInterval(restorePollRef.current);
                    restorePollRef.current = null;
                  }
                  setTimeout(() => onComplete(restoreUsername.trim(), 'RESTORED'), 1200);
                }
                if (p.phase === 'error') {
                  if (restorePollRef.current) {
                    clearInterval(restorePollRef.current);
                    restorePollRef.current = null;
                  }
                  setRestoreError(p.current_step || 'Restore failed');
                }
              }
            } catch (pollErr) {
              // eslint-disable-next-line no-console
              console.error('[GenesisWizard] progress poll error:', pollErr);
            }
          }, 500);
        }
      } else {
        setRestoreError(result.error || 'Failed to start restore');
        setSubmitted(false);
      }
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
      setSubmitted(false);
    }
  };

  const handleSubmit = async (): Promise<void> => {
    setSubmitError(null);
    if (!canProceed()) return;

    if (setupMode === 'selection') {
      // Selection mode - user chose a path
      return;
    }

    if (setupMode === 'restore') {
      if (step === 0) {
        // Restore step 0 - validate credentials
        await handleValidateRestore();
        return;
      }
      if (step === 1) {
        // Restore step 1 - start restore
        await handleStartRestore();
        return;
      }
      return;
    }

    // Fresh setup mode
    if (step < FRESH_SETUP_STEPS.length - 1) {
      setStep(step + 1);
      return;
    }

    // All steps done — submit
    setSubmitted(true);
    try {
      const result = await onRun({
        username: username.trim(),
        email: email.trim(),
        fullName: fullName.trim() || username.trim(),
        password,
        role,
        storeCode: storeCode.trim().toUpperCase(),
        storeName: storeName.trim(),
        storeAddress: storeAddress ? storeAddress.trim() : undefined,
        apiBaseUrl: apiBaseUrl ? apiBaseUrl.trim() : undefined,
      });

      if (result.success && result.result?.success) {
        onComplete(result.result.username ?? username, result.result.store_code ?? storeCode);
      } else {
        setSubmitError(result.result?.message ?? 'Genesis failed');
        setSubmitted(false);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitted(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        backgroundColor: 'var(--it-bg)',
      }}
      data-testid="genesis-wizard"
    >
      <Card className="genesis-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'var(--it-green-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--it-green-text)',
              fontWeight: 700,
              fontSize: '20px',
            }}
          >
            <Sparkles size={24} />
          </div>
          <div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 700,
                margin: 0,
                color: 'var(--it-text-primary)',
              }}
            >
              Set Up invenTory
            </h1>
            <p
              style={{
                fontSize: '13px',
                margin: 0,
                color: 'var(--it-text-secondary)',
              }}
            >
              First-time setup — create your account and store
            </p>
          </div>
        </div>

        {/* Steps indicator - only show for fresh/restore modes */}
        {setupMode !== 'selection' && (
          <nav aria-label="Setup progress" style={{ marginBottom: '28px' }}>
            <ol
              style={{
                display: 'flex',
                gap: '8px',
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}
            >
              {currentSteps.map((s, i) => (
                <li
                  key={s.id}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      background:
                        i < step
                          ? 'var(--it-green)'
                          : i === step
                            ? 'var(--it-green-surface)'
                            : 'var(--it-surface)',
                      color:
                        i < step
                          ? '#fff'
                          : i === step
                            ? 'var(--it-green-text)'
                            : 'var(--it-text-disabled)',
                      border: `1px solid ${i <= step ? 'var(--it-green-border)' : 'var(--it-border)'}`,
                    }}
                  >
                    {i < step ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: i <= step ? 'var(--it-text-primary)' : 'var(--it-text-disabled)',
                    }}
                  >
                    {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'var(--it-red-surface)',
              border: '1px solid var(--it-red-border)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--it-red-text)',
            }}
            data-testid="genesis-global-error"
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {submitted && running && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '32px',
              marginBottom: '16px',
            }}
            data-testid="genesis-submitting"
          >
            <Loader2 size={32} className="spin" style={{ color: 'var(--it-green-text)' }} />
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--it-text-secondary)' }}>
              Creating your account and store...
            </p>
          </div>
        )}

        {submitted && !running && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              padding: '32px',
              marginBottom: '16px',
            }}
            data-testid="genesis-submitted"
          >
            <Check size={32} style={{ color: 'var(--it-green-text)' }} />
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--it-text-secondary)' }}>
              Setup complete!
            </p>
          </div>
        )}

        {submitError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'var(--it-red-surface)',
              border: '1px solid var(--it-red-border)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--it-red-text)',
            }}
            data-testid="genesis-submit-error"
          >
            <AlertCircle size={16} />
            <span>{submitError}</span>
          </div>
        )}

        {restoreError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              backgroundColor: 'var(--it-red-surface)',
              border: '1px solid var(--it-red-border)',
              borderRadius: '8px',
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--it-red-text)',
            }}
            data-testid="restore-error"
          >
            <AlertCircle size={16} />
            <span>{restoreError}</span>
          </div>
        )}

        {/* Step content */}
        <div style={{ minHeight: '280px' }}>
          {setupMode === 'selection' && (
            <div data-testid="genesis-selection">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 16px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Choose Setup Path
              </h2>
              <p
                style={{
                  fontSize: '13px',
                  margin: '0 0 24px',
                  color: 'var(--it-text-secondary)',
                }}
              >
                How would you like to set up invenTory?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSetupMode('fresh');
                    setStep(0);
                  }}
                  disabled={running}
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    border: '2px solid var(--it-border)',
                    background: 'var(--it-surface)',
                    color: 'var(--it-text-primary)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: running ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  data-testid="select-fresh-setup"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <Sparkles size={24} style={{ color: 'var(--it-green-text)' }} />
                    <span>First-time Setup</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--it-text-secondary)' }}>
                    Create a new account and store from scratch
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupMode('restore');
                    setStep(0);
                  }}
                  disabled={running}
                  style={{
                    padding: '20px',
                    borderRadius: '12px',
                    border: '2px solid var(--it-border)',
                    background: 'var(--it-surface)',
                    color: 'var(--it-text-primary)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: running ? 'default' : 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  data-testid="select-restore"
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px',
                    }}
                  >
                    <Database size={24} style={{ color: 'var(--it-green-text)' }} />
                    <span>Restore from Server</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--it-text-secondary)' }}>
                    Reinstall and restore your existing data from the server
                  </p>
                </button>
              </div>
            </div>
          )}

          {setupMode === 'fresh' && step === 0 && (
            <div data-testid="genesis-step-account">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 16px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Your Account
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <TextInput
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  disabled={running}
                  data-testid="genesis-username"
                />
                <TextInput
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={running}
                  data-testid="genesis-email"
                />
                <TextInput
                  label="Display Name (optional)"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Leave empty to use username"
                  disabled={running}
                  data-testid="genesis-fullname"
                />
                <div style={{ display: 'flex', gap: '14px' }}>
                  <div style={{ flex: 1 }}>
                    <TextInput
                      label="Password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      disabled={running}
                      data-testid="genesis-password"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextInput
                      label="Confirm Password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      disabled={running}
                      data-testid="genesis-confirm"
                    />
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--it-text-secondary)',
                      marginBottom: '6px',
                      display: 'block',
                    }}
                  >
                    Role
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {roles.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setRole(r.value)}
                        disabled={running}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${role === r.value ? 'var(--it-green-border)' : 'var(--it-border)'}`,
                          background:
                            role === r.value ? 'var(--it-green-surface)' : 'var(--it-surface)',
                          color:
                            role === r.value ? 'var(--it-green-text)' : 'var(--it-text-secondary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: running ? 'default' : 'pointer',
                        }}
                        data-testid={`genesis-role-${r.value}`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {setupMode === 'fresh' && step === 1 && (
            <div data-testid="genesis-step-store">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 16px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Your Store
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <TextInput
                  label="Store Code (short)"
                  value={storeCode}
                  onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
                  placeholder="MAIN"
                  disabled={running}
                  data-testid="genesis-store-code"
                />
                <TextInput
                  label="Store Name"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="My Store"
                  disabled={running}
                  data-testid="genesis-store-name"
                />
                <TextInput
                  label="Address (optional)"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="123 Business Rd"
                  disabled={running}
                  data-testid="genesis-store-address"
                />
              </div>
            </div>
          )}

          {setupMode === 'fresh' && step === 2 && (
            <div data-testid="genesis-step-connect">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 8px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Optional: Push to Central Server
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  margin: '0 0 16px',
                  color: 'var(--it-text-secondary)',
                }}
              >
                If your central API server is reachable, enter its URL to create your account there
                too. This enables web dashboard login and multi-device sync.
              </p>
              <div style={{ maxWidth: '400px' }}>
                <TextInput
                  label="API Base URL"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="http://localhost:8000/api/v1"
                  disabled={running}
                  data-testid="genesis-api-url"
                />
              </div>
              <p
                style={{
                  fontSize: '11px',
                  margin: '12px 0 0',
                  color: 'var(--it-text-disabled)',
                }}
              >
                Leave empty to set up local-only. You can connect later via Settings.
              </p>
            </div>
          )}

          {setupMode === 'restore' && step === 0 && (
            <div data-testid="restore-step-connect">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 16px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Connect to Server
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  margin: '0 0 16px',
                  color: 'var(--it-text-secondary)',
                }}
              >
                Enter your server details to restore your existing data.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <TextInput
                  label="API Base URL"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="http://localhost:8000/api/v1"
                  disabled={running || restoreValidating}
                  data-testid="restore-api-url"
                />
                <TextInput
                  label="Username"
                  value={restoreUsername}
                  onChange={(e) => setRestoreUsername(e.target.value)}
                  placeholder="your username"
                  disabled={running || restoreValidating}
                  data-testid="restore-username"
                />
                <TextInput
                  label="Password"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="your password"
                  disabled={running || restoreValidating}
                  data-testid="restore-password"
                />
              </div>
            </div>
          )}

          {setupMode === 'restore' && step === 1 && restorePreview && (
            <div data-testid="restore-step-preview">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 16px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Restore Preview
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  margin: '0 0 16px',
                  color: 'var(--it-text-secondary)',
                }}
              >
                We found the following data on your server:
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--it-surface)',
                    border: '1px solid var(--it-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--it-text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Stores
                  </div>
                  <div
                    style={{ fontSize: '18px', fontWeight: 700, color: 'var(--it-text-primary)' }}
                  >
                    {restorePreview.stores_count || 0}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--it-surface)',
                    border: '1px solid var(--it-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--it-text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Products
                  </div>
                  <div
                    style={{ fontSize: '18px', fontWeight: 700, color: 'var(--it-text-primary)' }}
                  >
                    {restorePreview.products_count || 0}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--it-surface)',
                    border: '1px solid var(--it-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--it-text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Transactions
                  </div>
                  <div
                    style={{ fontSize: '18px', fontWeight: 700, color: 'var(--it-text-primary)' }}
                  >
                    {restorePreview.transactions_count || 0}
                  </div>
                </div>
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--it-surface)',
                    border: '1px solid var(--it-border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--it-text-secondary)',
                      marginBottom: '4px',
                    }}
                  >
                    Last Sync
                  </div>
                  <div
                    style={{ fontSize: '12px', fontWeight: 600, color: 'var(--it-text-primary)' }}
                  >
                    {restorePreview.last_sync_timestamp || 'Unknown'}
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'var(--it-green-surface)',
                  border: '1px solid var(--it-green-border)',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: 'var(--it-green-text)',
                  }}
                >
                  <Check size={16} />
                  <span>Critical data will be restored first (~30 seconds)</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: 'var(--it-green-text)',
                    marginTop: '4px',
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Background sync will continue after app is usable</span>
                </div>
              </div>
            </div>
          )}

          {setupMode === 'restore' && step === 2 && (
            <div data-testid="restore-step-progress">
              <h2
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: '0 0 16px',
                  color: 'var(--it-text-primary)',
                }}
              >
                Restoring Your Data
              </h2>
              {restoreProgress ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '8px',
                      background: 'var(--it-surface)',
                      border: '1px solid var(--it-border)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--it-text-secondary)',
                        marginBottom: '8px',
                      }}
                    >
                      {restoreProgress.currentStep}
                    </div>
                    <div
                      style={{
                        height: '8px',
                        borderRadius: '4px',
                        background: 'var(--it-border)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${restoreProgress.progressPercent}%`,
                          background: 'var(--it-green)',
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--it-text-secondary)',
                        marginTop: '4px',
                      }}
                    >
                      {restoreProgress.progressPercent}% complete
                    </div>
                  </div>
                  {restoreProgress.criticalComplete && !restoreProgress.totalComplete && (
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'var(--it-green-surface)',
                        border: '1px solid var(--it-green-border)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: 'var(--it-green-text)',
                        }}
                      >
                        <Check size={16} />
                        <span>Critical data restored! You can use the app now.</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '32px',
                  }}
                >
                  <Loader2 size={32} className="spin" style={{ color: 'var(--it-green-text)' }} />
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--it-text-secondary)' }}>
                    Starting restore process...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--it-border)',
          }}
          data-testid="genesis-footer"
        >
          {setupMode === 'selection' ? (
            <Button variant="ghost" onClick={onCancel} disabled={running}>
              Cancel
            </Button>
          ) : step > 0 ? (
            <Button
              variant="ghost"
              onClick={() => setStep(step - 1)}
              disabled={
                running ||
                restoreValidating ||
                (setupMode === 'restore' &&
                  step === 2 &&
                  !restoreError &&
                  restoreProgress?.phase !== 'error')
              }
            >
              Back
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setSetupMode('selection')}
              disabled={running || restoreValidating}
            >
              Back
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={
              running ||
              restoreValidating ||
              (setupMode === 'restore' &&
                step === 2 &&
                !restoreError &&
                restoreProgress?.phase !== 'error')
            }
            disabled={
              !canProceed() ||
              running ||
              restoreValidating ||
              (setupMode === 'restore' && step === 2)
            }
            data-testid="genesis-next-btn"
          >
            {setupMode === 'selection'
              ? 'Continue'
              : setupMode === 'restore' && step === 0
                ? 'Connect & Preview'
                : setupMode === 'restore' && step === 1
                  ? 'Start Restore'
                  : setupMode === 'restore' && step === 2
                    ? restoreProgress?.totalComplete
                      ? 'Completed'
                      : 'Restoring...'
                    : setupMode === 'fresh' && step === 2
                      ? 'Create Account & Store'
                      : 'Next'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default GenesisWizard;
