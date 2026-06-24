'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, Package, ShoppingCart, Users, 
  Settings, Plus, LifeBuoy, LogOut 
} from 'lucide-react';
import { cn } from '@/lib/utils';

const menuItems = [
  { href: '/analytics', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Meu Acervo', icon: Package },
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
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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
        <Link href="/party-form" className="sidebar-v2-cta">
          <Plus className="w-4 h-4" />
          Novo Aluguel
        </Link>

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
