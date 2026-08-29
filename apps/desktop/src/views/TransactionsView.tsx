import React from 'react';
import { ArrowLeftRight } from 'lucide-react';

export const TransactionsView: React.FC = () => {
  return (
    <div className="transactions-view" data-testid="transactions-view">
      <div className="view-header">
        <h2 className="view-title">Transactions Ledger</h2>
        <p className="view-subtitle">Stock movement and audit transaction entries</p>
      </div>

      <div className="placeholder-box">
        <ArrowLeftRight size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <h3>Transactions Screen Placeholder</h3>
        <p style={{ marginTop: '8px', fontSize: '14px' }}>
          Transaction entry and stock adjustment screens (Issues 06–11).
        </p>
      </div>
    </div>
  );
};
