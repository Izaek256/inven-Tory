import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (variant: ToastVariant, message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

const ICONS: Record<ToastVariant, React.ReactElement> = {
  success: <CheckCircle2 size={16} aria-hidden="true" />,
  error: <XCircle size={16} aria-hidden="true" />,
  warning: <AlertTriangle size={16} aria-hidden="true" />,
  info: <Info size={16} aria-hidden="true" />,
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps): React.ReactElement {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (variant: ToastVariant, message: string, duration = 4000): void => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, variant, message, duration }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="it-toast-region" role="log" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`it-toast it-toast--${t.variant}`} role="status">
            <span className={`it-toast__icon it-toast__icon--${t.variant}`}>
              {ICONS[t.variant]}
            </span>
            <span className="it-toast__message">{t.message}</span>
            <button
              type="button"
              className="it-toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const CSS = `
.it-toast-region {
  position: fixed;
  bottom: var(--it-sp-6);
  right: var(--it-sp-6);
  z-index: 300;
  display: flex;
  flex-direction: column;
  gap: var(--it-sp-2);
  max-width: 400px;
  width: calc(100vw - var(--it-sp-12));
}

.it-toast {
  display: flex;
  align-items: center;
  gap: var(--it-sp-3);
  padding: var(--it-sp-3) var(--it-sp-4);
  border-radius: var(--it-r-md);
  border: 1px solid transparent;
  border-left: var(--it-status-bar) solid;
  box-shadow: var(--it-shadow-md);
  background-color: var(--it-card);
  animation: it-toast-in var(--it-dur-base) var(--it-ease) both;
  font-size: var(--it-text-base);
  color: var(--it-text-primary);
}
@keyframes it-toast-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
@media (prefers-reduced-motion: reduce) {
  .it-toast { animation: none; }
}

.it-toast--success { border-left-color: var(--it-green); border-color: var(--it-green-border); }
.it-toast--error   { border-left-color: var(--it-red);   border-color: var(--it-red-border);   }
.it-toast--warning { border-left-color: var(--it-amber); border-color: var(--it-amber-border); }
.it-toast--info    { border-left-color: var(--it-accent);border-color: var(--it-accent-border);}

.it-toast__icon { display: flex; align-items: center; flex-shrink: 0; }
.it-toast__icon--success { color: var(--it-green-text); }
.it-toast__icon--error   { color: var(--it-red-text); }
.it-toast__icon--warning { color: var(--it-amber-text); }
.it-toast__icon--info    { color: var(--it-accent-text); }

.it-toast__message { flex: 1; line-height: 1.4; }
.it-toast__close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--it-text-secondary);
  display: flex;
  align-items: center;
  padding: var(--it-sp-1);
  border-radius: var(--it-r-sm);
  transition: color var(--it-dur-fast) var(--it-ease);
}
.it-toast__close:hover { color: var(--it-text-primary); }
.it-toast__close:focus-visible { outline: none; box-shadow: var(--it-focus-ring); }
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-toast-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-toast-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
