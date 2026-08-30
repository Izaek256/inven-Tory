import React, { useState, useEffect } from 'react';
import { Store, CreateStoreInput, UpdateStoreInput } from '../types/store';
import { X, Store as StoreIcon, AlertCircle } from 'lucide-react';

interface StoreModalProps {
  isOpen: boolean;
  store: Store | null; // null for Create mode, Store object for Edit mode
  onClose: () => void;
  onSubmitCreate: (input: CreateStoreInput) => Promise<void>;
  onSubmitUpdate: (input: UpdateStoreInput) => Promise<void>;
}

export const StoreModal: React.FC<StoreModalProps> = ({
  isOpen,
  store,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(store);

  useEffect(() => {
    if (store) {
      setCode(store.code);
      setName(store.name);
      setAddress(store.address || '');
    } else {
      setCode('');
      setName('');
      setAddress('');
    }
    setError(null);
  }, [store, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!isEdit && !code.trim()) {
      setError('Store code is required.');
      return;
    }
    if (!name.trim()) {
      setError('Store name is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && store) {
        await onSubmitUpdate({
          id: store.id,
          name: name.trim(),
          address: address.trim() || undefined,
        });
      } else {
        await onSubmitCreate({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          address: address.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" data-testid="store-modal-backdrop">
      <div className="modal-card" data-testid="store-modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StoreIcon size={20} color="var(--accent-primary)" />
            <h3 className="modal-title">{isEdit ? 'Edit Store Location' : 'Create New Store'}</h3>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            data-testid="modal-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-danger" data-testid="store-modal-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="store-code" className="form-label">
                Store Code <span className="required">*</span>
              </label>
              <input
                id="store-code"
                type="text"
                className="form-input"
                placeholder="e.g. ALPHA, DOWNTOWN, STORE-01"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={isEdit || submitting}
                data-testid="store-code-input"
                autoFocus={!isEdit}
              />
              <span className="form-hint">
                {isEdit
                  ? 'Unique store code is immutable after creation (FR-STORE-002).'
                  : 'Unique identifier for local inventory assignment (FR-STORE-002).'}
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="store-name" className="form-label">
                Store Name <span className="required">*</span>
              </label>
              <input
                id="store-name"
                type="text"
                className="form-input"
                placeholder="e.g. Store Alpha (Main Flagship)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                data-testid="store-name-input"
                autoFocus={isEdit}
              />
            </div>

            <div className="form-group">
              <label htmlFor="store-address" className="form-label">
                Address / Location
              </label>
              <textarea
                id="store-address"
                className="form-textarea"
                rows={3}
                placeholder="e.g. 100 Electronics Way, Tech District"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={submitting}
                data-testid="store-address-input"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
              data-testid="store-modal-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="store-modal-submit"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
