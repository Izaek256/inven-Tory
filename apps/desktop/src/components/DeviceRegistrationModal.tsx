import React, { useState } from 'react';
import { Store } from '../types/store';
import { Modal, TextInput, Button } from '@inven-tory/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface DeviceRegistrationModalProps {
  isOpen: boolean;
  store: Store | null;
  onClose: () => void;
  onRegisterDevice: (storeId: string, deviceName: string) => Promise<void>;
}

export const DeviceRegistrationModal: React.FC<DeviceRegistrationModalProps> = ({
  isOpen,
  store,
  onClose,
  onRegisterDevice,
}) => {
  const [deviceName, setDeviceName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !store) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!deviceName.trim()) {
      setError('Device name is required.');
      return;
    }

    setSubmitting(true);
    try {
      await onRegisterDevice(store.id, deviceName.trim());
      setSuccessMessage(`Device '${deviceName.trim()}' successfully registered to ${store.name}.`);
      setDeviceName('');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register Device (FR-STORE-003)"
      size="md"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            data-testid="device-modal-cancel"
          >
            Discard
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            data-testid="device-modal-submit"
          >
            Register Device
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} data-testid="device-modal">
        <p
          style={{ fontSize: '12px', color: 'var(--it-text-secondary)', marginBottom: '16px' }}
        >
          FR-STORE-003 Stub — Device registration links a physical terminal to a store
          location and embeds the device ID in every transaction for audit purposes.
        </p>
        {error && (
          <div
            className="it-toast it-toast--error"
            style={{ marginBottom: '16px' }}
            data-testid="device-modal-error"
          >
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div
            className="it-toast it-toast--success"
            style={{ marginBottom: '16px' }}
            data-testid="device-modal-success"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="it-field" style={{ marginBottom: '16px' }}>
          <label className="it-label">Target Store Location</label>
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--it-surface)',
              border: '1px solid var(--it-border)',
              borderRadius: 'var(--it-r-md)',
              fontSize: '14px',
              color: 'var(--it-text-secondary)',
            }}
            data-testid="device-target-store"
          >
            <strong>{store.code}</strong> — {store.name}
          </div>
        </div>

        <TextInput
          id="device-name-input"
          label="Device Terminal Name"
          required
          placeholder="e.g. POS Register 1, Counter Tablet A"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          disabled={submitting}
          data-testid="device-name-input"
        />
      </form>
    </Modal>
  );
};
