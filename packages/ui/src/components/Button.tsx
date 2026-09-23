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
  gap: 7px;
  font-family: var(--it-font-ui);
  font-size: 13px;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: var(--it-r-sm);
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
.it-btn svg { width: 14px; height: 14px; }

/* Sizes — match reference .btn (9px 15px md, 6px 10px sm) */
.it-btn--sm { font-size: 12px; padding: 6px 10px; min-height: 28px; }
.it-btn--md { font-size: 13px; padding: 9px 15px; min-height: 34px; }
.it-btn--lg { font-size: 13px; padding: 9px 18px; min-height: 38px; }

/* Icon-only — square */
.it-btn--icon-only.it-btn--sm { padding: 6px; width: 30px; height: 30px; }
.it-btn--icon-only.it-btn--md { padding: 7px; width: 34px; height: 34px; }
.it-btn--icon-only.it-btn--lg { padding: 8px; width: 38px; height: 38px; }

/* Primary — amber (reference .btn-primary) */
.it-btn--primary {
  background-color: var(--amber);
  color: #241300;
  border-color: var(--amber);
}
.it-btn--primary:hover:not(:disabled) {
  background-color: #c97c1f;
  border-color: #c97c1f;
}
.it-btn--primary:active:not(:disabled) {
  background-color: #b56e1c;
}
.it-btn--primary:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
  box-shadow: none;
}

/* Destructive — reference .btn-danger: surface with red */
.it-btn--destructive {
  background-color: var(--it-card);
  color: var(--red);
  border-color: #e3b6ac;
}
.it-btn--destructive:hover:not(:disabled) {
  background-color: var(--red-tint);
  color: var(--red);
}
.it-btn--destructive:active:not(:disabled) {
  background-color: var(--red-tint);
}
.it-btn--destructive:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
  box-shadow: none;
}

/* Secondary — reference .btn-outline: surface + line-strong */
.it-btn--secondary {
  background-color: var(--it-card);
  color: var(--it-text-primary);
  border-color: var(--it-border-strong);
}
.it-btn--secondary:hover:not(:disabled) {
  border-color: var(--text-faint);
  background-color: var(--it-card);
}
.it-btn--secondary:focus-visible {
  outline: 2px solid var(--teal);
  outline-offset: 2px;
  box-shadow: none;
}

/* Ghost — reference .btn-ghost */
.it-btn--ghost {
  background-color: transparent;
  color: var(--it-text-secondary);
  border-color: transparent;
}
.it-btn--ghost:hover:not(:disabled) {
  background-color: var(--it-bg);
  color: var(--it-text-primary);
}
.it-btn--ghost:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 2px;
  box-shadow: none;
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
