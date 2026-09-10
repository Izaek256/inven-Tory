import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PRIMARY_NAV_ITEMS, MORE_NAV_ITEMS, type NavView } from '../config/navigation';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const isMoreView = MORE_NAV_ITEMS.some((item) => item.id === currentView);
    setMoreOpen(isMoreView);
  }, [currentView]);

  const handleMoreClick = (view: NavView) => {
    onNavigate(view);
    setMoreOpen(false);
  };

  return (
    <aside className="app-sidebar" data-testid="app-sidebar">
      {PRIMARY_NAV_ITEMS.map((item) => {
        const isActive = currentView === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={(): void => onNavigate(item.id)}
            data-testid={`nav-${item.id}`}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        className="nav-item nav-more-toggle"
        onClick={() => setMoreOpen(!moreOpen)}
        aria-expanded={moreOpen}
        data-testid="nav-more-toggle"
      >
        <span>More</span>
        {moreOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {moreOpen && (
        <div className="nav-more-group" data-testid="nav-more-group">
          {MORE_NAV_ITEMS.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleMoreClick(item.id)}
                data-testid={`nav-${item.id}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
};
