import React from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  ShieldAlert,
  Settings,
} from 'lucide-react';

export type NavView =
  | 'dashboard'
  | 'products'
  | 'transactions'
  | 'receive_stock'
  | 'sale_stock'
  | 'return_stock'
  | 'transfer_stock'
  | 'damage_quarantine'
  | 'settings';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const navItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'products', label: 'Products', icon: <Package size={18} /> },
    { id: 'receive_stock', label: 'Receive Stock', icon: <ArrowDownCircle size={18} /> },
    { id: 'sale_stock', label: 'Sale / Issue', icon: <ArrowUpCircle size={18} /> },
    { id: 'return_stock', label: 'Returns', icon: <RotateCcw size={18} /> },
    { id: 'transfer_stock', label: 'Transfers', icon: <ArrowLeftRight size={18} /> },
    { id: 'damage_quarantine', label: 'Damage & Quarantine', icon: <ShieldAlert size={18} /> },
    { id: 'transactions', label: 'Transactions', icon: <ArrowLeftRight size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <aside className="app-sidebar" data-testid="app-sidebar">
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={(): void => onNavigate(item.id)}
            data-testid={`nav-${item.id}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </aside>
  );
};
