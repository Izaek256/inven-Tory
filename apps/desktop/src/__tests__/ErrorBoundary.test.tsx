/**
 * ErrorBoundary regression guard for the blank-window symptom.
 *
 * An uncaught render exception must surface a readable error + retry
 * action instead of unmounting the whole tree into a white window.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';

function Bomb(): React.ReactElement {
  throw new Error('boom-render-failure');
}

let flakyShouldThrow = true;
function Flaky(): React.ReactElement {
  if (flakyShouldThrow) {
    throw new Error('boom-once');
  }
  return <div data-testid="recovered">recovered</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child-ok">healthy</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child-ok')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary')).not.toBeInTheDocument();
  });

  it('renders the error message + retry instead of a blank tree on crash', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent('boom-render-failure');
    expect(screen.queryByText('healthy')).not.toBeInTheDocument();
  });

  it('retry clears the error and calls onRetry', () => {
    flakyShouldThrow = true;
    const onRetry = vi.fn();
    render(
      <ErrorBoundary onRetry={onRetry}>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary')).toBeInTheDocument();
    flakyShouldThrow = false;
    fireEvent.click(screen.getByTestId('error-boundary-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('error-boundary')).not.toBeInTheDocument();
    expect(screen.getByTestId('recovered')).toBeInTheDocument();
  });
});
