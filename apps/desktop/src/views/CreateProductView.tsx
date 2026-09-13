import React, { useState, useCallback } from 'react';
import { Trash2, Check, AlertCircle, Plus } from 'lucide-react';
import { createProduct } from '../services/tauriProductService';
import { CreateProductInput } from '../types/product';
import { LinearGridEntry, GridFieldDef, DataTable } from '@invenTory/ui';
import type { ColumnDef } from '@invenTory/ui';
import { Button } from '@invenTory/ui';

interface SessionRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  barcode?: string;
  timestamp: string;
}

export const CreateProductView: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);

  const handleCommit = useCallback(
    async (row: { id: string; values: Record<string, string | number> }, _rowIndex: number) => {
      setError(null);
      setSuccess(false);

      const finalName = String(row.values.name ?? '').trim();
      const finalModel = String(row.values.model ?? '').trim();

      // SKU is derived from the model number — same value, uppercased, no prefix.
      const finalSku = (finalModel || String(row.values.sku ?? '').trim()).toUpperCase();

      if (!finalName) {
        setError('Product name is required.');
        return;
      }
      if (!finalSku) {
        setError('Model number is required (it becomes the SKU).');
        return;
      }

      try {
        const input: CreateProductInput = {
          sku: finalSku,
          name: finalName,
          brand: String(row.values.brand ?? '').trim() || undefined,
          model: finalModel || undefined,
          // Category and unit are not grid columns — default to General/pcs.
          // Users can update via the Products catalogue view.
          category: DEFAULT_CATEGORY,
          unit: DEFAULT_UNIT,
          barcode: String(row.values.barcode ?? '').trim() || undefined,
          alternate_names: String(row.values.alternate_names ?? '').trim() || undefined,
          serial_tracking_enabled: false,
          is_active: true,
        };

        const product = await createProduct(input);

        setSessionRows((prev) => [
          ...prev,
          {
            id: product.id,
            sku: product.sku,
            name: product.name,
            category: product.category,
            unit: product.unit,
            barcode: product.barcode || undefined,
            timestamp: new Date().toLocaleString(),
          },
        ]);

        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  const removeSessionRow = useCallback((rowId: string, _rowIndex: number) => {
    setSessionRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  // Category is not a grid column — default to 'General' so users don't have to
  // pick from a dropdown on every row. They can change it via the Products view.
  const DEFAULT_CATEGORY = 'General';
  const DEFAULT_UNIT = 'pcs';

  const fields: GridFieldDef[] = [
    {
      id: 'name',
      type: 'text',
      label: 'Product Name',
      required: true,
      placeholder: 'e.g. Apple iPhone 15 Pro 256GB',
    },
    {
      id: 'brand',
      type: 'text',
      label: 'Brand',
      required: false,
      placeholder: 'e.g. Apple, Samsung',
    },
    {
      id: 'model',
      type: 'text',
      label: 'Model / SKU',
      required: true,
      placeholder: 'Model number — becomes the SKU',
    },
    {
      id: 'barcode',
      type: 'text',
      label: 'Barcode',
      required: false,
      placeholder: 'EAN / UPC / Internal',
    },
    {
      id: 'alternate_names',
      type: 'text',
      label: 'Alternate Names',
      required: false,
      placeholder: 'Comma-separated aliases',
    },
  ];

  const columns: ColumnDef<SessionRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            fontFamily: 'var(--it-font-mono)',
            color: 'var(--it-green-text)',
          }}
        >
          {row.sku}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Product Name',
      render: (row) => <div style={{ fontWeight: 500 }}>{row.name}</div>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span style={{ color: 'var(--it-text-secondary)' }}>{row.category}</span>,
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (row) => <span style={{ color: 'var(--it-text-secondary)' }}>{row.unit}</span>,
    },
    {
      key: 'barcode',
      header: 'Barcode',
      render: (row) => row.barcode || '—',
    },
    {
      key: 'timestamp',
      header: 'Created At',
      render: (row) => (
        <span style={{ fontSize: '12px', color: 'var(--it-text-secondary)' }}>{row.timestamp}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      numeric: true,
      render: (row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            title="Remove entry"
            onClick={() => removeSessionRow(row.id, 0)}
            data-testid={`void-product-${row.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div
      data-testid="create-product-view"
      style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 60%', minWidth: '320px' }}>
        <div className="view-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Plus size={24} color="var(--it-green)" />
            <div>
              <h2 className="view-title">Create Product</h2>
              <p className="view-subtitle">Rapid product entry — model number becomes the SKU</p>
            </div>
          </div>
        </div>

        {success && (
          <div
            className="it-toast it-toast--success"
            data-testid="create-product-success"
            style={{ marginBottom: '16px' }}
          >
            <Check size={16} aria-hidden="true" />
            <span>Product created successfully.</span>
          </div>
        )}

        {error && (
          <div
            className="it-toast it-toast--error"
            data-testid="create-product-error"
            style={{ marginBottom: '16px' }}
          >
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <LinearGridEntry
          dataTestid="create-product-grid"
          fields={fields}
          onCommitRow={handleCommit}
          onSearch={() => {}}
          onBarcodeScan={() => {}}
          searchResults={[]}
          allItems={[]}
          initialRowCount={5}
          fieldTestIds={{
            name: 'field-name',
            brand: 'field-brand',
            model: 'field-model',
            barcode: 'field-barcode',
            alternate_names: 'field-alternate_names',
          }}
          onVoidRow={removeSessionRow}
        />

        <h3
          style={{
            marginTop: '24px',
            marginBottom: '12px',
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--it-text-primary)',
          }}
        >
          Recently Created
        </h3>

        <DataTable<SessionRow>
          columns={columns}
          rows={sessionRows}
          rowKey={(row) => row.id}
          emptySlot={
            <div
              style={{
                color: 'var(--it-text-secondary)',
                fontSize: '13px',
                textAlign: 'center',
                padding: '40px 0',
              }}
            >
              No products created yet
            </div>
          }
          data-testid="recently-created-table"
        />
      </div>
    </div>
  );
};
