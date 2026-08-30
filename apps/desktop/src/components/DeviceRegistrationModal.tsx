import React, { useState } from 'react';
import { Store } from '../types/store';
import { X, Smartphone, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DeviceRegistrationModalProps {
  isOpen: boolean;
  store: Store | null;
  onClose: () => void;
  onRegisterDevice: (storeId: string, deviceName: string) => Promise<void>;
}

/**
 * Device registration stub (FR-STORE-003).
 * TODO(issue-13): Replace with full server-side OAuth device registration & pairing workflow in Issue 13.
 */
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
    <div className="modal-backdrop" data-testid="device-modal-backdrop">
      <div className="modal-card" data-testid="device-modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Smartphone size={20} color="var(--accent-primary)" />
            <h3 className="modal-title">Register Local Device (FR-STORE-003 Stub)</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} data-testid="device-modal-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="banner-info" style={{ marginBottom: '16px', fontSize: '12px' }}>
              <strong>TODO(issue-13):</strong> Provisional local device registration stub. Full cloud
              auth and device token pairing will arrive in Issue 13.
            </div>

            {error && (
              <div className="alert alert-danger" data-testid="device-modal-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="alert alert-success" data-testid="device-modal-success">
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Target Store Location</label>
              <div className="read-only-box" data-testid="device-target-store">
                <strong>{store.code}</strong> — {store.name}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="device-name-input" className="form-label">
                Device Terminal Name <span className="required">*</span>
              </label>
              <input
                id="device-name-input"
                type="text"
                className="form-input"
                placeholder="e.g. POS Register 1, Counter Tablet A"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                disabled={submitting}
                data-testid="device-name-input"
                autoFocus
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
              data-testid="device-modal-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="device-modal-submit"
            >
              {submitting ? 'Registering...' : 'Register Device'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
