import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'destructive' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconOnly?: boolean;
  children?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'it-btn--primary',
  destructive: 'it-btn--destructive',
  secondary: 'it-btn--secondary',
  ghost: 'it-btn--ghost',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'it-btn--sm',
  md: 'it-btn--md',
  lg: 'it-btn--lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      iconOnly = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const classes = [
      'it-btn',
      variantStyles[variant],
      sizeStyles[size],
      iconOnly ? 'it-btn--icon-only' : '',
      loading ? 'it-btn--loading' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? <Loader2 className="it-btn__spinner" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

/* ─────────────────────────────────────────────────────────────────────────────
   Styles (injected as a style tag — no separate CSS file needed for the pkg)
   ───────────────────────────────────────────────────────────────────────────── */
const CSS = `
.it-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--it-sp-2);
  font-family: var(--it-font-ui);
  font-weight: var(--it-weight-semibold);
  border: 1px solid transparent;
  border-radius: var(--it-r-md);
  cursor: pointer;
  transition:
    background-color var(--it-dur-fast) var(--it-ease),
    border-color var(--it-dur-fast) var(--it-ease),
    box-shadow var(--it-dur-fast) var(--it-ease),
    color var(--it-dur-fast) var(--it-ease);
  white-space: nowrap;
  user-select: none;
  text-decoration: none;
  line-height: 1;
}

/* Sizes */
.it-btn--sm { font-size: var(--it-text-sm); padding: var(--it-sp-1) var(--it-sp-3); min-height: 28px; }
.it-btn--md { font-size: var(--it-text-base); padding: var(--it-sp-2) var(--it-sp-4); min-height: 36px; }
.it-btn--lg { font-size: var(--it-text-md); padding: var(--it-sp-3) var(--it-sp-6); min-height: 44px; }

/* Icon-only — square */
.it-btn--icon-only.it-btn--sm { padding: var(--it-sp-1); width: 28px; }
.it-btn--icon-only.it-btn--md { padding: var(--it-sp-2); width: 36px; }
.it-btn--icon-only.it-btn--lg { padding: var(--it-sp-3); width: 44px; }

/* Primary — green */
.it-btn--primary {
  background-color: var(--it-green);
  color: #ffffff;
  border-color: transparent;
}
.it-btn--primary:hover:not(:disabled) {
  background-color: var(--it-green-hover);
}
.it-btn--primary:active:not(:disabled) {
  background-color: var(--it-green-active);
}
.it-btn--primary:focus-visible {
  outline: none;
  box-shadow: var(--it-focus-ring-green);
}

/* Destructive — red */
.it-btn--destructive {
  background-color: var(--it-red);
  color: #ffffff;
  border-color: transparent;
}
.it-btn--destructive:hover:not(:disabled) {
  background-color: var(--it-red-hover);
}
.it-btn--destructive:active:not(:disabled) {
  background-color: var(--it-red-active);
}
.it-btn--destructive:focus-visible {
  outline: none;
  box-shadow: var(--it-focus-ring-red);
}

/* Secondary — gray */
.it-btn--secondary {
  background-color: var(--it-gray-surface);
  color: var(--it-gray-text);
  border-color: var(--it-gray-border);
}
.it-btn--secondary:hover:not(:disabled) {
  background-color: var(--it-gray-border);
  color: var(--it-gray-hover);
}
.it-btn--secondary:focus-visible {
  outline: none;
  box-shadow: var(--it-focus-ring);
}

/* Ghost */
.it-btn--ghost {
  background-color: transparent;
  color: var(--it-text-secondary);
  border-color: transparent;
}
.it-btn--ghost:hover:not(:disabled) {
  background-color: var(--it-gray-surface);
  color: var(--it-text-primary);
}
.it-btn--ghost:focus-visible {
  outline: none;
  box-shadow: var(--it-focus-ring);
}

/* Disabled */
.it-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Loading spinner */
.it-btn__spinner {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  animation: it-spin 0.75s linear infinite;
}
@keyframes it-spin { to { transform: rotate(360deg); } }
.it-btn--loading { pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .it-btn__spinner { animation: none; }
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-btn-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-btn-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
