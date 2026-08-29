import React from 'react';
import { Settings } from 'lucide-react';

export const SettingsView: React.FC = () => {
  return (
    <div className="settings-view" data-testid="settings-view">
      <div className="view-header">
        <h2 className="view-title">System Settings</h2>
        <p className="view-subtitle">Device configuration, sync rules, and store parameters</p>
      </div>

      <div className="placeholder-box">
        <Settings size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
        <h3>Settings Screen Placeholder</h3>
        <p style={{ marginTop: '8px', fontSize: '14px' }}>
          Device settings and sync parameters placeholder.
        </p>
      </div>
    </div>
  );
};
