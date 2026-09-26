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
  const sidebarRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    const isMoreView = MORE_NAV_ITEMS.some((item) => item.id === currentView);
    setMoreOpen(isMoreView);
  }, [currentView]);

  const handleMoreClick = (view: NavView): void => {
    onNavigate(view);
    setMoreOpen(false);
  };

  /**
   * P0 keyboard navigation:
   *  - ArrowDown / ArrowUp move focus between nav items
   *  - Enter activates the focused button (native button behaviour)
   *  - Escape collapses the sidebar (when collapsible)
   * Moves are ordered by DOM position across every rendered nav button,
   * so group boundaries and the "More" section behave as one list.
   */
  const handleNavKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    const root = sidebarRef.current;
    if (!root) return;
    const navButtons = Array.from(
      root.querySelectorAll<HTMLButtonElement>('button.nav-item, button.more-toggle'),
    );
    if (navButtons.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const idx = navButtons.findIndex((b) => b === active);

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const next = idx === -1 ? navButtons[0] : navButtons[(idx + 1) % navButtons.length];
        next?.focus();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prev =
          idx === -1
            ? navButtons[navButtons.length - 1]
            : navButtons[(idx - 1 + navButtons.length) % navButtons.length];
        prev?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        navButtons[0]?.focus();
        break;
      }
      case 'End': {
        e.preventDefault();
        navButtons[navButtons.length - 1]?.focus();
        break;
      }
      case 'Escape': {
        if (onToggleCollapse && !collapsed) {
          e.preventDefault();
          onToggleCollapse();
        }
        break;
      }
      default:
        break;
    }
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
      ref={sidebarRef}
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      data-testid="app-sidebar"
      onKeyDown={handleNavKeyDown}
    >
      <div className="rail-brand" data-testid="rail-brand">
        <div className="rail-brand-mark" aria-hidden="true">
          <img src="/favicon.svg" alt="" width={17} height={17} style={{ objectFit: 'contain' }} />
        </div>
        <div className="rail-brand-text">
          <strong>inven-Tory</strong>
        </div>
        <span className="rail-brand-version">v1.3.0</span>
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
