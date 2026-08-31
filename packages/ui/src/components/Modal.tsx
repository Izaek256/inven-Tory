import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

/* ─── Modal ──────────────────────────────────────────────────────────────── */
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  children,
  footer,
}: ModalProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap focus + close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    // Focus the dialog
    dialogRef.current?.focus();
    return (): void => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
  border-radius: var(--it-r-lg);
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
.it-modal--lg { max-width: 760px; }

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
  padding: var(--it-sp-4) var(--it-sp-6);
  border-bottom: 1px solid var(--it-border);
}
.it-modal__title {
  font-size: var(--it-text-md);
  font-weight: var(--it-weight-bold);
  color: var(--it-text-primary);
}
.it-modal__body {
  padding: var(--it-sp-6);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--it-sp-4);
}
.it-modal__footer {
  padding: var(--it-sp-4) var(--it-sp-6);
  border-top: 1px solid var(--it-border);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--it-sp-3);
  background-color: var(--it-surface);
  border-radius: 0 0 var(--it-r-lg) var(--it-r-lg);
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
