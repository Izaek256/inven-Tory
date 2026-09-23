import React from 'react';

type IconProps = { size?: number; className?: string };

// ── Artifact SVG icons — exact paths from inven-Tory___Redesign.html ──
const DashboardIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size, stroke: 'currentColor' },
    React.createElement('rect', {
      x: 3,
      y: 3,
      width: 7,
      height: 9,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    React.createElement('rect', {
      x: 14,
      y: 3,
      width: 7,
      height: 5,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    React.createElement('rect', {
      x: 14,
      y: 12,
      width: 7,
      height: 9,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    React.createElement('rect', {
      x: 3,
      y: 16,
      width: 7,
      height: 5,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
  );
const CreateProductIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size, stroke: 'currentColor' },
    React.createElement('rect', {
      x: 4,
      y: 4,
      width: 16,
      height: 16,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    React.createElement('path', {
      d: 'M12 8V16M8 12H16',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
  );
const ReceiveStockIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M5 10H19V19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V10Z',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M5 10L8 5H16L19 10',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M12 2.5V9.3M12 9.3L9.2 6.3M12 9.3L14.8 6.3',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
  );
const SaleStockIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M5 10H19V19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V10Z',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M5 10L8 5H16L19 10',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M12 9.3V2.5M12 2.5L9.2 5.5M12 2.5L14.8 5.5',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
  );
const PhysicalCountIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('rect', {
      x: 5,
      y: 3,
      width: 14,
      height: 18,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    React.createElement('path', {
      d: 'M9 8H15M9 12H15M9 16H12',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
  );
const ProductsIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('rect', {
      x: 4,
      y: 4,
      width: 10,
      height: 10,
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('rect', {
      x: 10,
      y: 10,
      width: 10,
      height: 10,
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
  );
const DayBooksIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M12 5.5L4 7.5V18.5L12 20.5L20 18.5V7.5L12 5.5Z',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', { d: 'M12 5.5V20.5', stroke: 'currentColor', strokeWidth: 1.6 }),
    React.createElement('path', {
      d: 'M6.5 10.5H9.5M6.5 13.5H9.5M14.5 10.5H17.5M14.5 13.5H17.5',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'square' as const,
    }),
  );
const TransactionsIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M17 3L21 7L17 11',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M21 7H8C5.2 7 3 9.2 3 12',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
    React.createElement('path', {
      d: 'M7 21L3 17L7 13',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M3 17H16C18.8 17 21 14.8 21 12',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
  );
const SettingsIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('circle', {
      cx: 12,
      cy: 12,
      r: 7,
      stroke: 'currentColor',
      strokeWidth: 1.6,
    }),
    React.createElement('path', {
      d: 'M12 1.8V4M12 20V22.2M22.2 12H20M4 12H1.8M19.21 4.79L17.66 6.34M6.34 17.66L4.79 19.21M19.21 19.21L17.66 17.66M6.34 6.34L4.79 4.79',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
  );
const ReturnsIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M4 12A8 8 0 0114.9 5.1L20 9M20 4V9H15M20 12A8 8 0 019.1 18.9L4 15M4 20V15H9',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
  );
const TransfersIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M17 3L21 7L17 11',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M21 7H8C5.2 7 3 9.2 3 12',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
    React.createElement('path', {
      d: 'M7 21L3 17L7 13',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M3 17H16C18.8 17 21 14.8 21 12',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'square' as const,
    }),
  );
const DamageIcon: React.FC<IconProps> = ({ size = 17 }) =>
  React.createElement(
    'svg',
    { viewBox: '0 0 24 24', fill: 'none', width: size, height: size },
    React.createElement('path', {
      d: 'M12 3L20 6.5V13C20 17.5 16.6 20.7 12 22C7.4 20.7 4 17.5 4 13V6.5L12 3Z',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinejoin: 'miter' as const,
    }),
    React.createElement('path', {
      d: 'M12 8V13M12 16.2V16.3',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round' as const,
    }),
  );

export type NavView =
  | 'dashboard'
  | 'create_product'
  | 'day_books'
  | 'sale_stock'
  | 'receive_stock'
  | 'products'
  | 'physical_count'
  | 'transactions'
  | 'settings'
  | 'return_stock'
  | 'transfer_stock'
  | 'damage_quarantine';

export type NavSection = 'primary' | 'more';

export type NavIcon = React.FC<IconProps>;

export interface NavItemConfig {
  id: NavView;
  label: string;
  icon: NavIcon;
  section: NavSection;
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon, section: 'primary' },
  { id: 'create_product', label: 'Create Product', icon: CreateProductIcon, section: 'primary' },
  { id: 'day_books', label: 'Day Books', icon: DayBooksIcon, section: 'primary' },
  { id: 'sale_stock', label: 'Sale / Issue', icon: SaleStockIcon, section: 'primary' },
  { id: 'receive_stock', label: 'Receive Stock', icon: ReceiveStockIcon, section: 'primary' },
  { id: 'products', label: 'Products', icon: ProductsIcon, section: 'primary' },
  { id: 'physical_count', label: 'Physical Count', icon: PhysicalCountIcon, section: 'primary' },
  { id: 'transactions', label: 'Transactions', icon: TransactionsIcon, section: 'primary' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, section: 'primary' },
  { id: 'return_stock', label: 'Returns', icon: ReturnsIcon, section: 'more' },
  { id: 'transfer_stock', label: 'Transfers', icon: TransfersIcon, section: 'more' },
  { id: 'damage_quarantine', label: 'Damage & Quarantine', icon: DamageIcon, section: 'more' },
] as const satisfies readonly NavItemConfig[];

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.section === 'primary');
export const MORE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.section === 'more');

export const NAV_ICONS = Object.fromEntries(NAV_ITEMS.map(({ id, icon }) => [id, icon])) as Record<
  NavView,
  NavIcon
>;
