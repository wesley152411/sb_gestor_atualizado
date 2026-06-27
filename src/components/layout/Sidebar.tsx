'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, Package, ShoppingCart, Users, 
  Settings, LifeBuoy, LogOut, ShoppingBag, Store, MessageSquare 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const menuItems = [
  { href: '/analytics', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Meu Acervo', icon: Package },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/marketplace/my-page', label: 'Minha Página', icon: Store },
  { href: '/chat', label: 'Chat B2B', icon: MessageSquare },
  { href: '/party-form', label: 'Formulário', icon: ShoppingCart },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();


  return (
    <aside className="sidebar-v2">
      {/* Logo */}
      <div className="sidebar-v2-logo">
        <div className="sidebar-v2-logo-icon">SB</div>
        <span className="sidebar-v2-logo-text">Premium Rental Mgmt</span>
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
          <a href="/login" className="sidebar-v2-bottom-link">
            <LogOut className="w-4 h-4" />
            <span>Sair</span>
          </a>
        </div>
      </div>
    </aside>
  );
}
