import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { PRIMARY_NAV_ITEMS, MORE_NAV_ITEMS, type NavView } from '../config/navigation';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  useEffect(() => {
    const isMoreView = MORE_NAV_ITEMS.some((item) => item.id === currentView);
    setMoreOpen(isMoreView);
  }, [currentView]);

  const handleMoreClick = (view: NavView): void => {
    onNavigate(view);
    setMoreOpen(false);
  };

  const renderNavItem = (item: {
    id: NavView;
    label: string;
    icon: React.ElementType;
  }): React.ReactElement => {
    const isActive = currentView === item.id;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={(): void => onNavigate(item.id)}
        data-testid={`nav-${item.id}`}
        title={collapsed ? item.label : undefined}
        onMouseEnter={() => collapsed && setHoveredItem(item.id)}
        onMouseLeave={() => collapsed && setHoveredItem(null)}
      >
        <Icon size={18} />
        {!collapsed && <span>{item.label}</span>}
        {collapsed && hoveredItem === item.id && <span className="nav-tooltip">{item.label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      data-testid="app-sidebar"
    >
      {PRIMARY_NAV_ITEMS.map(renderNavItem)}

      <button
        type="button"
        className="nav-item nav-more-toggle"
        onClick={() => setMoreOpen(!moreOpen)}
        aria-expanded={moreOpen}
        data-testid="nav-more-toggle"
        title={collapsed ? 'More' : undefined}
        onMouseEnter={() => collapsed && setHoveredItem('more')}
        onMouseLeave={() => collapsed && setHoveredItem(null)}
      >
        {!collapsed && <span>More</span>}
        {moreOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        {collapsed && hoveredItem === 'more' && <span className="nav-tooltip">More</span>}
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
                title={collapsed ? item.label : undefined}
                onMouseEnter={() => collapsed && setHoveredItem(item.id)}
                onMouseLeave={() => collapsed && setHoveredItem(null)}
              >
                <Icon size={18} />
                {!collapsed && <span>{item.label}</span>}
                {collapsed && hoveredItem === item.id && (
                  <span className="nav-tooltip">{item.label}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {onToggleCollapse && (
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-collapse-toggle"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      )}
    </aside>
  );
};
