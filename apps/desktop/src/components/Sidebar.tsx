import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { NAV_ITEMS, MORE_NAV_ITEMS, type NavView } from '../config/navigation';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const OVERVIEW_IDS: NavView[] = ['dashboard'];
const STOCK_OPS_IDS: NavView[] = [
  'create_product',
  'receive_stock',
  'sale_stock',
  'physical_count',
];
const RECORDS_IDS: NavView[] = ['products', 'day_books', 'transactions'];
const SETTINGS_IDS: NavView[] = ['settings'];

function itemsByIds(ids: NavView[]): typeof NAV_ITEMS {
  return ids.map((id) => NAV_ITEMS.find((n) => n.id === id)!).filter(Boolean) as typeof NAV_ITEMS;
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
        <span className="bar" aria-hidden="true" />
        <Icon size={17} />
        {!collapsed && <span className="rail-label">{item.label}</span>}
        {collapsed && hoveredItem === item.id && <span className="nav-tooltip">{item.label}</span>}
      </button>
    );
  };

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      data-testid="app-sidebar"
    >
      <div className="rail-brand" data-testid="rail-brand">
        <div className="rail-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" width="17" height="17">
            <path
              d="M4 7L12 3L20 7M4 7V17L12 21M4 7L12 11M20 7V17L12 21M20 7L12 11M12 11V21"
              stroke="#201200"
              strokeWidth="1.8"
              strokeLinejoin="miter"
              strokeLinecap="square"
            />
          </svg>
        </div>
        <div className="rail-brand-text">
          <strong>inven-Tory</strong>
        </div>
        <span className="rail-brand-version">v1.2.0</span>
      </div>

      <div className="nav-group">
        <div className="nav-caption">Overview</div>
        {itemsByIds(OVERVIEW_IDS).map(renderNavItem)}
      </div>

      <div className="nav-group">
        <div className="nav-caption">Stock operations</div>
        {itemsByIds(STOCK_OPS_IDS).map(renderNavItem)}
      </div>

      <div className="nav-group">
        <div className="nav-caption">Records</div>
        {itemsByIds(RECORDS_IDS).map(renderNavItem)}
      </div>

      <div className="rail-divider" />

      <div className="nav-group" style={{ paddingTop: 0 }}>
        <button
          type="button"
          className="more-toggle"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          data-testid="nav-more-toggle"
          title={collapsed ? 'More' : undefined}
          onMouseEnter={() => collapsed && setHoveredItem('more')}
          onMouseLeave={() => collapsed && setHoveredItem(null)}
        >
          {!collapsed && <span>More</span>}
          <ChevronDown
            size={12}
            style={{
              transition: 'transform .15s ease',
              transform: moreOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
          {collapsed && hoveredItem === 'more' && <span className="nav-tooltip">More</span>}
        </button>

        {moreOpen && (
          <div
            className="nav-more-group"
            data-testid="nav-more-group"
            style={{ animation: 'more-group-in .16s var(--it-ease)' }}
          >
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
                  <span className="bar" aria-hidden="true" />
                  <Icon size={17} />
                  {!collapsed && <span className="rail-label">{item.label}</span>}
                  {collapsed && hoveredItem === item.id && (
                    <span className="nav-tooltip">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="nav-group" style={{ paddingTop: 8 }}>
        {itemsByIds(SETTINGS_IDS).map(renderNavItem)}
      </div>

      <div className="rail-foot">
        <span className="dot" aria-hidden="true" />
        <span className="rail-foot-text">Global admin</span>
      </div>

      {onToggleCollapse && (
        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-collapse-toggle"
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          {!collapsed && <span className="rail-label">Collapse sidebar</span>}
        </button>
      )}
    </aside>
  );
};
