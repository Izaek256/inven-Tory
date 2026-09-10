import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Plus,
  BookOpen,
  ArrowUpCircle,
  ArrowDownCircle,
  Package,
  ClipboardList,
  ArrowLeftRight,
  Settings,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';

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

export interface NavItemConfig {
  id: NavView;
  label: string;
  icon: LucideIcon;
  section: NavSection;
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'primary' },
  { id: 'create_product', label: 'Create Product', icon: Plus, section: 'primary' },
  { id: 'day_books', label: 'Day Books', icon: BookOpen, section: 'primary' },
  { id: 'sale_stock', label: 'Sale / Issue', icon: ArrowUpCircle, section: 'primary' },
  { id: 'receive_stock', label: 'Receive Stock', icon: ArrowDownCircle, section: 'primary' },
  { id: 'products', label: 'Products', icon: Package, section: 'primary' },
  { id: 'physical_count', label: 'Physical Count', icon: ClipboardList, section: 'primary' },
  { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight, section: 'primary' },
  { id: 'settings', label: 'Settings', icon: Settings, section: 'primary' },
  { id: 'return_stock', label: 'Returns', icon: RotateCcw, section: 'more' },
  { id: 'transfer_stock', label: 'Transfers', icon: ArrowLeftRight, section: 'more' },
  { id: 'damage_quarantine', label: 'Damage & Quarantine', icon: ShieldAlert, section: 'more' },
] as const satisfies readonly NavItemConfig[];

export const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.section === 'primary');
export const MORE_NAV_ITEMS = NAV_ITEMS.filter((item) => item.section === 'more');

export const NAV_ICONS = Object.fromEntries(NAV_ITEMS.map(({ id, icon }) => [id, icon])) as Record<
  NavView,
  LucideIcon
>;
