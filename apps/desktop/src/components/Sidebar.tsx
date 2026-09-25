import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const navItemsRef = useRef<HTMLButtonElement[]>([]);

  const allItems = React.useMemo(() => {
    const primary = itemsByIds([...OVERVIEW_IDS, ...STOCK_OPS_IDS, ...RECORDS_IDS]);
    const more = MORE_NAV_ITEMS;
    const settings = itemsByIds(SETTINGS_IDS);
    return { primary, more, settings };
  }, []);

  const flatItems = React.useMemo(() => {
    const items: { id: NavView; label: string }[] = [];
    for (const item of allItems.primary) items.push(item);
    if (moreOpen) {
      for (const item of allItems.more) items.push(item);
    }
    for (const item of allItems.settings) items.push(item);
    return items;
  }, [allItems, moreOpen]);

  useEffect(() => {
    const idx = flatItems.findIndex((item) => item.id === currentView);
    setFocusedIndex(idx >= 0 ? idx : 0);
  }, [currentView, flatItems]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const itemCount = flatItems.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (focusedIndex + 1) % itemCount;
        setFocusedIndex(next);
        navItemsRef.current[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = focusedIndex <= 0 ? itemCount - 1 : focusedIndex - 1;
        setFocusedIndex(prev);
        navItemsRef.current[prev]?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const item = flatItems[focusedIndex];
        if (item) onNavigate(item.id);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusedIndex(0);
        navItemsRef.current[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = itemCount - 1;
        setFocusedIndex(last);
        navItemsRef.current[last]?.focus();
      }
    },
    [focusedIndex, flatItems, onNavigate],
  );

  const handleMoreClick = (view: NavView): void => {
    onNavigate(view);
    setMoreOpen(false);
  };

  const renderNavItem = (
    item: { id: NavView; label: string },
    globalIndex: number,
  ): React.ReactElement => {
    const isActive = currentView === item.id;
    const isInMoreSection = MORE_NAV_ITEMS.some((n) => n.id === item.id);

    return (
      <button
        key={item.id}
        ref={(el) => {
          if (el) navItemsRef.current[globalIndex] = el;
        }}
        type="button"
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={(): void => {
          if (isInMoreSection) handleMoreClick(item.id);
          else onNavigate(item.id);
        }}
        onKeyDown={handleKeyDown}
        data-testid={`nav-${item.id}`}
        title={collapsed ? item.label : undefined}
        tabIndex={focusedIndex === globalIndex ? 0 : -1}
        onMouseEnter={() => collapsed && setHoveredItem(item.id)}
        onMouseLeave={() => collapsed && setHoveredItem(null)}
        role="menuitem"
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
      >
        <span className="bar" aria-hidden="true" />
        <span className="nav-shortcut" aria-hidden="true">
          {isInMoreSection
            ? '5'
            : item.label === 'Dashboard'
              ? '1'
              : item.label === 'Create Product'
                ? '2'
                : item.label === 'Day Books'
                  ? '3'
                  : item.label === 'Sale / Issue'
                    ? '4'
                    : item.label === 'Products'
                      ? '6'
                      : item.label === 'Physical Count'
                        ? '7'
                        : item.label === 'Transactions'
                          ? '8'
                          : item.label === 'Settings'
                            ? '9'
                            : ''}
        </span>
        {!collapsed && <span className="rail-label">{item.label}</span>}
        {collapsed && hoveredItem === item.id && <span className="nav-tooltip">{item.label}</span>}
      </button>
    );
  };

  const primaryItems = allItems.primary;
  const moreItems = allItems.more;
  const settingsItems = allItems.settings;

  const primaryStart = 0;
  const moreStart = primaryItems.length;
  const settingsStart = moreStart + (moreOpen ? moreItems.length : 0);

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      data-testid="app-sidebar"
      role="navigation"
      aria-label="Main navigation"
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

      <div className="nav-group" role="menubar" aria-label="Overview">
        <div className="nav-caption">Overview</div>
        {primaryItems.map((item, i) => renderNavItem(item, primaryStart + i))}
      </div>

      <div className="nav-group">
        <div className="nav-caption">Stock operations</div>
        {primaryItems.slice(1).map((item, i) => renderNavItem(item, primaryStart + 1 + i))}
      </div>

      <div className="rail-divider" />

      {collapsed && (
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
            aria-label={moreOpen ? 'Collapse more' : 'Expand more'}
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
              {moreItems.map((item, i) => renderNavItem(item, moreStart + i))}
            </div>
          )}
        </div>
      )}

      {!collapsed && (
        <div className="nav-group" style={{ paddingTop: 8 }}>
          <button
            type="button"
            className="more-toggle"
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
            data-testid="nav-more-toggle"
            aria-label={moreOpen ? 'Collapse more items' : 'Show more items'}
          >
            <span>More</span>
            <ChevronDown
              size={12}
              style={{
                transition: 'transform .15s ease',
                transform: moreOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>

          {moreOpen && (
            <div
              className="nav-more-group"
              data-testid="nav-more-group"
              style={{ animation: 'more-group-in .16s var(--it-ease)' }}
            >
              {moreItems.map((item, i) => renderNavItem(item, moreStart + i))}
            </div>
          )}
        </div>
      )}

      <div className="nav-group" style={{ paddingTop: 8 }}>
        {settingsItems.map((item, i) => renderNavItem(item, settingsStart + i))}
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
