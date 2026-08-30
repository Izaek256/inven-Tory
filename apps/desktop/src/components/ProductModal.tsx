import React, { useState, useEffect } from 'react';
import { Product, CreateProductInput, UpdateProductInput } from '../types/product';
import { X, Package, AlertCircle } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  product: Product | null; // null for Create, Product object for Edit
  onClose: () => void;
  onSubmitCreate: (input: CreateProductInput) => Promise<void>;
  onSubmitUpdate: (input: UpdateProductInput) => Promise<void>;
}

const DEFAULT_CATEGORIES = ['Smartphones', 'Laptops', 'Audio', 'Accessories', 'Components', 'General'];
const DEFAULT_UNITS = ['pcs', 'ctn', 'set', 'box', 'kg', 'm'];

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
      setSku('');
      setName('');
      setBrand('');
      setModel('');
      setCategory(DEFAULT_CATEGORIES[0]);
      setUnit('pcs');
      setBarcode('');
      setAlternateNames('');
      setSerialTrackingEnabled(false);
      setIsActive(true);
    }
    setError(null);
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);

    if (!isEdit && !sku.trim()) {
      setError('Product SKU is required.');
      return;
    }
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
          sku: sku.trim().toUpperCase(),
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
    <div className="modal-backdrop" data-testid="product-modal-backdrop">
      <div className="modal-card modal-lg" data-testid="product-modal">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Package size={20} color="var(--accent-primary)" />
            <h3 className="modal-title">{isEdit ? 'Edit Product' : 'Add New Product (v1.0.0)'}</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} data-testid="product-modal-close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-danger" data-testid="product-modal-error">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-grid">
              {/* SKU */}
              <div className="form-group">
                <label htmlFor="prod-sku" className="form-label">
                  SKU / Product ID <span className="required">*</span>
                </label>
                <input
                  id="prod-sku"
                  type="text"
                  className="form-input"
                  placeholder="e.g. ELEC-IPHONE15PRO"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  disabled={isEdit || submitting}
                  data-testid="product-sku-input"
                  autoFocus={!isEdit}
                />
                <span className="form-hint">
                  {isEdit
                    ? 'SKU is unique and immutable once created (FR-PROD-001).'
                    : 'Unique master item identifier (FR-PROD-001).'}
                </span>
              </div>

              {/* Name */}
              <div className="form-group">
                <label htmlFor="prod-name" className="form-label">
                  Product Name <span className="required">*</span>
                </label>
                <input
                  id="prod-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Apple iPhone 15 Pro 256GB"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  data-testid="product-name-input"
                  autoFocus={isEdit}
                />
              </div>

              {/* Brand */}
              <div className="form-group">
                <label htmlFor="prod-brand" className="form-label">
                  Brand
                </label>
                <input
                  id="prod-brand"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Apple, Samsung, Sony"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  disabled={submitting}
                  data-testid="product-brand-input"
                />
              </div>

              {/* Model */}
              <div className="form-group">
                <label htmlFor="prod-model" className="form-label">
                  Model Number
                </label>
                <input
                  id="prod-model"
                  type="text"
                  className="form-input"
                  placeholder="e.g. A3102, SM-S928B"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={submitting}
                  data-testid="product-model-input"
                />
              </div>

              {/* Category */}
              <div className="form-group">
                <label htmlFor="prod-category" className="form-label">
                  Category <span className="required">*</span>
                </label>
                <input
                  id="prod-category"
                  type="text"
                  list="categories-list"
                  className="form-input"
                  placeholder="Select or type category..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={submitting}
                  data-testid="product-category-input"
                />
                <datalist id="categories-list">
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              {/* Unit */}
              <div className="form-group">
                <label htmlFor="prod-unit" className="form-label">
                  Unit of Measure <span className="required">*</span>
                </label>
                <select
                  id="prod-unit"
                  className="form-select"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  disabled={submitting}
                  data-testid="product-unit-input"
                >
                  {DEFAULT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              {/* Barcode */}
              <div className="form-group">
                <label htmlFor="prod-barcode" className="form-label">
                  Barcode (EAN / UPC / Internal)
                </label>
                <input
                  id="prod-barcode"
                  type="text"
                  className="form-input"
                  placeholder="e.g. 195949012345"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  disabled={submitting}
                  data-testid="product-barcode-input"
                />
              </div>

              {/* Alternate Names */}
              <div className="form-group">
                <label htmlFor="prod-alt-names" className="form-label">
                  Alternate Search Aliases
                </label>
                <input
                  id="prod-alt-names"
                  type="text"
                  className="form-input"
                  placeholder="e.g. iPhone 15 Pro, Apple 15"
                  value={alternateNames}
                  onChange={(e) => setAlternateNames(e.target.value)}
                  disabled={submitting}
                  data-testid="product-alt-names-input"
                />
              </div>
            </div>

            {/* Checkbox Toggles */}
            <div className="form-checkbox-group" style={{ marginTop: '16px' }}>
              <label className="checkbox-label">
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
                <label className="checkbox-label">
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
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
              data-testid="product-modal-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              data-testid="product-modal-submit"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
