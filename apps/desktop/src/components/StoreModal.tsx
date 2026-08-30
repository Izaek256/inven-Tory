import React, { useState, useEffect } from 'react';
import { Store, CreateStoreInput, UpdateStoreInput } from '../types/store';
import { Modal, TextInput, Button } from '@inven-tory/ui';
import { AlertCircle } from 'lucide-react';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Store Location' : 'Create New Store'}
      size="md"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            data-testid="store-modal-cancel"
          >
            Discard
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            data-testid="store-modal-submit"
          >
            {isEdit ? 'Save Changes' : 'Save Store'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} data-testid="store-modal">
        {error && (
          <div
            className="it-toast it-toast--error"
            style={{ marginBottom: '16px' }}
            data-testid="store-modal-error"
          >
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <TextInput
          id="store-code"
          label="Store Code"
          required
          placeholder="e.g. ALPHA, DOWNTOWN, STORE-01"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          disabled={isEdit || submitting}
          data-testid="store-code-input"
          hint={
            isEdit
              ? 'Unique store code is immutable after creation (FR-STORE-002).'
              : 'Unique identifier for local inventory assignment (FR-STORE-002).'
          }
        />

        <div style={{ marginTop: '16px' }}>
          <TextInput
            id="store-name"
            label="Store Name"
            required
            placeholder="e.g. Store Alpha (Main Flagship)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            data-testid="store-name-input"
          />
        </div>

        <div style={{ marginTop: '16px' }} className="it-field">
          <label htmlFor="store-address" className="it-label">
            Address / Location
          </label>
          <textarea
            id="store-address"
            className="it-input"
            rows={3}
            placeholder="e.g. 100 Electronics Way, Tech District"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={submitting}
            data-testid="store-address-input"
          />
        </div>
      </form>
    </Modal>
  );
};
