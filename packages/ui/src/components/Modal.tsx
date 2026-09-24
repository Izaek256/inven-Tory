import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

/* ─── Modal ──────────────────────────────────────────────────────────────── */
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
}: ModalProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus management + keyboard trap: focus the first control inside the
  // body on open, cycle Tab/Shift+Tab within the dialog, close on Escape,
  // and restore focus to the trigger element on close.
  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const getFocusables = (): HTMLElement[] =>
      dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialog !== null && dialog.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first || active === dialog) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // Land keyboard users on the first control in the body (skips the
    // header close button); fall back to the dialog itself.
    const body = dialog?.querySelector('.it-modal__body') ?? null;
    const initial = body?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialog ?? null;
    initial?.focus();

    return (): void => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = `it-modal--${size}`;

  return (
    <div
      className="it-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`it-modal ${sizeClass}`} ref={dialogRef} tabIndex={-1}>
        <div className="it-modal__header">
          <h2 className="it-modal__title">{title}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="Close dialog">
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
        <div className="it-modal__body">{children}</div>
        {footer && <div className="it-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ─── ConfirmModal ───────────────────────────────────────────────────────── */
export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = true,
  loading = false,
}: ConfirmModalProps): React.ReactElement | null {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDestructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="it-confirm__body">
        {isDestructive && (
          <div className="it-confirm__icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </div>
        )}
        <p className="it-confirm__message">{message}</p>
      </div>
    </Modal>
  );
}

const CSS = `
.it-modal-backdrop {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: var(--it-sp-6);
}

.it-modal {
  background-color: var(--it-card);
  border: 1px solid var(--it-border);
  border-radius: var(--it-r-sm);
  box-shadow: var(--it-shadow-md);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  width: 100%;
  animation: it-modal-in var(--it-dur-base) var(--it-ease) both;
  outline: none;
}
.it-modal--sm { max-width: 420px; }
.it-modal--md { max-width: 560px; }
.it-modal--lg { max-width: 660px; }
.it-modal--xl { max-width: 1440px; width: 96%; }

@keyframes it-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .it-modal { animation: none; }
}

.it-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--it-border);
}
.it-modal__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--it-text-primary);
}
.it-modal__body {
  padding: 16px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--it-sp-4);
}
.it-modal__footer {
  padding: 12px 20px;
  border-top: 1px solid var(--it-border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--it-sp-3);
  background-color: var(--it-surface);
  border-radius: 0;
}

/* ConfirmModal */
.it-confirm__body {
  display: flex;
  align-items: flex-start;
  gap: var(--it-sp-4);
}
.it-confirm__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--it-r-lg);
  background-color: var(--it-red-surface);
  color: var(--it-red-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
.it-confirm__message {
  font-size: var(--it-text-base);
  color: var(--it-text-primary);
  line-height: 1.6;
  padding-top: var(--it-sp-2);
}
`;

if (typeof document !== 'undefined') {
  const existing = document.getElementById('it-modal-styles');
  if (!existing) {
    const style = document.createElement('style');
    style.id = 'it-modal-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}
