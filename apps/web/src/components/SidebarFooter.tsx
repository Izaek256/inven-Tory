import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@invenTory/ui';

interface SidebarFooterProps {
  isOnline: boolean;
  pendingCount: number;
  onSync: (() => void) | null;
}

export function SidebarFooter({
  isOnline,
  pendingCount,
  onSync,
}: SidebarFooterProps): React.ReactElement {
  return (
    <div className="web-sidebar-footer" data-testid="web-sidebar-footer">
      <div className="web-sidebar-footer__status">
        <span
          className={`web-sidebar-footer__dot ${isOnline ? 'web-sidebar-footer__dot--online' : 'web-sidebar-footer__dot--offline'}`}
          aria-hidden="true"
        />
        <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
      </div>
      <div>Local data is up to date</div>
      {pendingCount > 0 && (
        <div className="web-sidebar-footer__pending" data-testid="pending-sync-count">
          {pendingCount} pending operation{pendingCount === 1 ? '' : 's'}
        </div>
      )}
      {onSync ? (
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          title="Sync Now"
          onClick={onSync}
          data-testid="sync-now-btn"
        >
          <RefreshCw size={14} />
          Sync Now
        </Button>
      ) : (
        <div data-testid="sync-now-btn" title="Sync mechanism not yet available">
          <Button variant="ghost" size="sm" disabled>
            <RefreshCw size={14} />
            Sync Now
          </Button>
        </div>
      )}
    </div>
  );
}
