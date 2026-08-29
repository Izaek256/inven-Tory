import React from 'react';
import { Package } from 'lucide-react';

export const ProductsView: React.FC = () => {
  return (
    <div className="products-view" data-testid="products-view">
      <div className="view-header">
        <h2 className="view-title">Products Catalogue</h2>
        <p className="view-subtitle">Product management and inventory catalog</p>
      </div>

      <div className="placeholder-box">
        <Package size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <h3>Products Screen Placeholder</h3>
        <p style={{ marginTop: '8px', fontSize: '14px' }}>
          Product management features will be implemented in subsequent issues.
        </p>
      </div>
    </div>
  );
};
