import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * Called after the error state is cleared via the retry button.
   * Defaults to a full page reload.
   */
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort render guard for the desktop shell.
 *
 * Without this, any uncaught render exception unmounts the whole tree and
 * the user gets a blank window with zero feedback (the reported
 * "nothing displays" symptom). With this, they get the actual error
 * message plus a retry action.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Uncaught render error:', error);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    } else if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--it-bg, #ffffff)',
          color: 'var(--it-text-primary, #111111)',
          padding: '24px',
        }}
        data-testid="error-boundary"
        role="alert"
      >
        <div style={{ maxWidth: '520px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--it-text-secondary, #555555)',
              marginBottom: '12px',
            }}
          >
            The app hit an unexpected error instead of your workspace. Your local data is untouched.
          </p>
          <pre
            style={{
              fontSize: '12px',
              textAlign: 'left',
              backgroundColor: 'var(--it-card, #f4f4f4)',
              border: '1px solid var(--it-border, #dddddd)',
              borderRadius: '8px',
              padding: '12px',
              overflowX: 'auto',
              marginBottom: '16px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
            data-testid="error-boundary-message"
          >
            {error.message || String(error)}
          </pre>
          <button
            type="button"
            onClick={this.handleRetry}
            data-testid="error-boundary-retry"
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: '1px solid var(--it-green-border, #0a7a4e)',
              backgroundColor: 'var(--it-green, #0a7a4e)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
