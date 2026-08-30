import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { EmptyState } from '@inven-tory/ui';

export const TransactionsView: React.FC = () => {
  return (
    <div className="transactions-view" data-testid="transactions-view">
      <div className="view-header">
        <div>
          <h2 className="view-title">Transactions Ledger</h2>
          <p className="view-subtitle">Stock movement and audit transaction entries</p>
        </div>
      </div>

      <EmptyState
        icon={<ArrowLeftRight size={24} />}
        heading="Transactions History"
        body="Transaction entry, audit logs, and stock movement ledger."
      />
    </div>
  );
};
