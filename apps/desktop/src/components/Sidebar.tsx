import React from 'react';
import { LayoutDashboard, Package, ArrowLeftRight, Settings } from 'lucide-react';

export type NavView = 'dashboard' | 'products' | 'transactions' | 'settings';

interface SidebarProps {
  currentView: NavView;
  onNavigate: (view: NavView) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const navItems: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'products', label: 'Products', icon: <Package size={18} /> },
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
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
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
