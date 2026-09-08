import React, { useState, useCallback } from 'react';
import { Trash2, Check, AlertCircle } from 'lucide-react';
import { createProduct } from '../services/tauriProductService';
import { CreateProductInput } from '../types/product';
import { LinearEntryForm, FieldDef } from '@invenTory/ui';
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

const DEFAULT_CATEGORIES = [
  'Smartphones',
  'Laptops',
  'Audio',
  'Accessories',
  'Components',
  'General',
];
const DEFAULT_UNITS = ['pcs', 'ctn', 'set', 'box', 'kg', 'm'];

function generateSkuFromCategory(cat: string): string {
  const clean = cat
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 4)
    .toUpperCase();
  const prefix = clean || 'PROD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

export const CreateProductView: React.FC = () => {
  const [category] = useState(DEFAULT_CATEGORIES[0]);
  const [sku, setSku] = useState(() => generateSkuFromCategory(DEFAULT_CATEGORIES[0]));
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionRows, setSessionRows] = useState<SessionRow[]>([]);

  const handleCommit = useCallback(
    async (values: Record<string, string | number>) => {
      setError(null);
      setSuccess(false);

      const finalSku = (values.sku as string) || sku;
      const finalName = (values.name as string) || name;
      const finalCategory = (values.category as string) || category;

      if (!finalName.trim()) {
        setError('Product name is required.');
        return;
      }
      if (!finalCategory.trim()) {
        setError('Category is required.');
        return;
      }

      try {
        const input: CreateProductInput = {
          sku: finalSku.trim().toUpperCase(),
          name: finalName.trim(),
          brand: (values.brand as string) || undefined,
          model: (values.model as string) || undefined,
          category: finalCategory.trim(),
          unit: (values.unit as string) || 'pcs',
          barcode: (values.barcode as string) || undefined,
          alternate_names: (values.alternate_names as string) || undefined,
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
        setSku(generateSkuFromCategory(finalCategory));
        setName('');
        setUnit('pcs');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [category, name, sku],
  );

  const removeSessionRow = useCallback((id: string) => {
    setSessionRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const fields: FieldDef[] = [
    {
      id: 'sku',
      type: 'text',
      label: 'SKU',
      required: true,
      defaultValue: sku,
      placeholder: 'Auto-generated from category',
    },
    {
      id: 'name',
      type: 'text',
      label: 'Product Name',
      required: true,
      defaultValue: '',
      placeholder: 'e.g. Apple iPhone 15 Pro 256GB',
    },
    {
      id: 'brand',
      type: 'text',
      label: 'Brand',
      required: false,
      defaultValue: '',
      placeholder: 'e.g. Apple, Samsung',
    },
    {
      id: 'model',
      type: 'text',
      label: 'Model',
      required: false,
      defaultValue: '',
      placeholder: 'e.g. A3102',
    },
    {
      id: 'category',
      type: 'select',
      label: 'Category',
      required: true,
      defaultValue: category,
      options: DEFAULT_CATEGORIES.map((c) => ({ value: c, label: c })),
    },
    {
      id: 'unit',
      type: 'select',
      label: 'Unit',
      required: true,
      defaultValue: unit,
      options: DEFAULT_UNITS.map((u) => ({ value: u, label: u })),
    },
    {
      id: 'barcode',
      type: 'text',
      label: 'Barcode',
      required: false,
      defaultValue: '',
      placeholder: 'EAN / UPC / Internal',
    },
    {
      id: 'alternate_names',
      type: 'text',
      label: 'Alternate Names',
      required: false,
      defaultValue: '',
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
            onClick={() => removeSessionRow(row.id)}
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
          <div>
            <h2 className="view-title">Create Product</h2>
            <p className="view-subtitle">Rapid product entry (FR-PROD-001)</p>
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

        <LinearEntryForm
          dataTestid="create-product-form"
          fields={fields}
          onCommit={handleCommit}
          sessionTableTitle="Recently Created"
          sessionTableColumns={columns}
          sessionTableRows={sessionRows}
          sessionTableEmptyState={
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
        />
      </div>
    </div>
  );
};
