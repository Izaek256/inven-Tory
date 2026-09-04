import React, { useState, useEffect } from 'react';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import { Modal, TextInput, Select, Button } from '@inven-tory/ui';
import { AlertCircle } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  product: Product | null; // null for Create, Product object for Edit
  onClose: () => void;
  onSubmitCreate: (input: CreateProductInput) => Promise<void>;
  onSubmitUpdate: (input: UpdateProductInput) => Promise<void>;
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
  const clean = cat.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  const prefix = clean || 'PROD';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${rand}`;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  product,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}) => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES[0]);
  const [unit, setUnit] = useState('pcs');
  const [barcode, setBarcode] = useState('');
  const [alternateNames, setAlternateNames] = useState('');
  const [serialTrackingEnabled, setSerialTrackingEnabled] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(product);

  useEffect(() => {
    if (product) {
      setSku(product.sku);
      setName(product.name);
      setBrand(product.brand || '');
      setModel(product.model || '');
      setCategory(product.category);
      setUnit(product.unit || 'pcs');
      setBarcode(product.barcode || '');
      setAlternateNames(product.alternate_names || '');
      setSerialTrackingEnabled(product.serial_tracking_enabled);
      setIsActive(product.is_active);
    } else {
      const defaultCat = DEFAULT_CATEGORIES[0];
      setCategory(defaultCat);
      setSku(generateSkuFromCategory(defaultCat));
      setName('');
      setBrand('');
      setModel('');
      setUnit('pcs');
      setBarcode('');
      setAlternateNames('');
      setSerialTrackingEnabled(false);
      setIsActive(true);
    }
    setError(null);
  }, [product, isOpen]);

  const handleCategoryChange = (val: string): void => {
    setCategory(val);
    if (!isEdit) {
      setSku(generateSkuFromCategory(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    const finalSku = sku.trim() ? sku.trim().toUpperCase() : generateSkuFromCategory(category);

    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!category.trim()) {
      setError('Category is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && product) {
        await onSubmitUpdate({
          id: product.id,
          name: name.trim(),
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          category: category.trim(),
          unit: unit.trim(),
          barcode: barcode.trim() || undefined,
          alternate_names: alternateNames.trim() || undefined,
          serial_tracking_enabled: serialTrackingEnabled,
        });
      } else {
        await onSubmitCreate({
          sku: finalSku,
          name: name.trim(),
          brand: brand.trim() || undefined,
          model: model.trim() || undefined,
          category: category.trim(),
          unit: unit.trim(),
          barcode: barcode.trim() || undefined,
          alternate_names: alternateNames.trim() || undefined,
          serial_tracking_enabled: serialTrackingEnabled,
          is_active: isActive,
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
      title={isEdit ? 'Edit Product' : 'Add New Product (v1.0.0)'}
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            data-testid="product-modal-cancel"
          >
            Discard
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            data-testid="product-modal-submit"
          >
            {isEdit ? 'Save Changes' : 'Create Product'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} data-testid="product-modal">
        {error && (
          <div
            className="it-toast it-toast--error"
            style={{ marginBottom: '16px' }}
            data-testid="product-modal-error"
          >
            <AlertCircle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <TextInput
            id="prod-sku"
            label="SKU / Product ID"
            required
            placeholder="e.g. ELEC-IPHONE15PRO"
            value={sku}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
            disabled={isEdit || submitting}
            data-testid="product-sku-input"
            hint={
              isEdit
                ? 'SKU is unique and immutable once created (FR-PROD-001).'
                : 'Unique master item identifier (FR-PROD-001).'
            }
          />

          <TextInput
            id="prod-name"
            label="Product Name"
            required
            placeholder="e.g. Apple iPhone 15 Pro 256GB"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            data-testid="product-name-input"
          />

          <TextInput
            id="prod-brand"
            label="Brand"
            placeholder="e.g. Apple, Samsung, Sony"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            disabled={submitting}
            data-testid="product-brand-input"
          />

          <TextInput
            id="prod-model"
            label="Model Number"
            placeholder="e.g. A3102, SM-S928B"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={submitting}
            data-testid="product-model-input"
          />

          <TextInput
            id="prod-category"
            label="Category"
            required
            placeholder="Select or type category..."
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            disabled={submitting}
            data-testid="product-category-input"
          />

          <Select
            id="prod-unit"
            label="Unit of Measure"
            required
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            disabled={submitting}
            data-testid="product-unit-input"
            options={DEFAULT_UNITS.map((u) => ({ value: u, label: u }))}
          />

          <TextInput
            id="prod-barcode"
            label="Barcode (EAN / UPC / Internal)"
            placeholder="e.g. 195949012345"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            disabled={submitting}
            data-testid="product-barcode-input"
          />

          <TextInput
            id="prod-alt-names"
            label="Alternate Search Aliases"
            placeholder="e.g. iPhone 15 Pro, Apple 15"
            value={alternateNames}
            onChange={(e) => setAlternateNames(e.target.value)}
            disabled={submitting}
            data-testid="product-alt-names-input"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            <input
              type="checkbox"
              checked={serialTrackingEnabled}
              onChange={(e) => setSerialTrackingEnabled(e.target.checked)}
              disabled={submitting}
              data-testid="product-serial-tracking-toggle"
            />
            <span>Enable Serial Number Tracking (FR-PROD-002)</span>
          </label>

          {!isEdit && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={submitting}
                data-testid="product-active-toggle"
              />
              <span>Product Active State</span>
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
};
