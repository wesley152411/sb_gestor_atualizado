'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingCart, Users,
  Settings, LifeBuoy, ShoppingBag, Store, MessageSquare, CalendarDays, Menu
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

const menuItems = [
  { href: '/analytics', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Meu Acervo', icon: Package },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/marketplace/my-page', label: 'Minha Página', icon: Store },
  { href: '/chat', label: 'Chat B2B', icon: MessageSquare },
  { href: '/party-form', label: 'Formulário', icon: ShoppingCart },
  { href: '/calendar', label: 'Calendário', icon: CalendarDays },
  { href: '/clients', label: 'Clientes', icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { decorator } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={cn('sidebar-v2', collapsed && 'collapsed')}>
      {/* Logo + toggle */}
      <div className="sidebar-v2-logo">
        <div className="sidebar-v2-brand">
          <div className="sidebar-v2-logo-icon">
            {decorator?.avatar_url ? (
              <img src={decorator.avatar_url} alt={decorator.name || 'Avatar'} />
            ) : (
              getInitials(decorator?.name)
            )}
          </div>
          <span className="sidebar-v2-logo-text">{decorator?.name || 'SB GESTOR'}</span>
        </div>
        <button
          type="button"
          className="sidebar-v2-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="sidebar-v2-nav">
        <ul className="sidebar-v2-menu">
          {menuItems.map((item) => {
            const isActive = item.href === '/marketplace'
              ? pathname === '/marketplace'
              : (pathname === item.href || pathname.startsWith(item.href + '/'));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn('sidebar-v2-link', isActive && 'active')}
                >
                  <item.icon className="sidebar-v2-link-icon" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="sidebar-v2-bottom">
        <div className="sidebar-v2-bottom-links">
          <a href="#" className="sidebar-v2-bottom-link">
            <LifeBuoy className="w-4 h-4" />
            <span>Suporte</span>
          </a>
          <Link
            href="/settings"
            className={cn('sidebar-v2-bottom-link', pathname.startsWith('/settings') && 'active')}
          >
            <Settings className="w-4 h-4" />
            <span>Configurações</span>
          </Link>
        </div>
      </div>
    </aside>
  );
}
