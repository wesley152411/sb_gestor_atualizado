'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingBag, Store, MessageSquare,
  ShoppingCart, CalendarDays, Users, Settings, LifeBuoy, LogOut,
} from 'lucide-react';

const menuItems = [
  { href: '/analytics', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Meu Acervo', icon: Package },
  { href: '/marketplace', label: 'Marketplace', icon: ShoppingBag },
  { href: '/marketplace/my-page', label: 'Minha Página', icon: Store },
  { href: '/chat', label: 'Chat B2B', icon: MessageSquare },
  { href: '/party-form', label: 'Novo Evento', icon: ShoppingCart },
  { href: '/calendar', label: 'Calendário', icon: CalendarDays },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-surface-dark flex flex-col z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center text-white font-extrabold text-sm shadow-lg shadow-brand-500/25">
          SB
        </div>
        <span className="text-white/90 font-bold text-sm tracking-tight">SB GESTOR</span>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const isActive = item.href === '/marketplace'
              ? pathname === '/marketplace'
              : (pathname === item.href || pathname.startsWith(item.href + '/'));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-500/15 text-brand-300 shadow-sm'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 hover:translate-x-0.5'
                  }`}
                >
                  <div className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                    isActive ? 'bg-brand-500/20 text-brand-300' : 'text-slate-500 group-hover:text-slate-300'
                  }`}>
                    {isActive && (
                      <span className="absolute -left-[22px] w-1 h-5 rounded-r-full bg-brand-400" />
                    )}
                    <item.icon className="w-[18px] h-[18px]" />
                  </div>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Rodapé da sidebar */}
      <div className="px-3 py-4 border-t border-white/5 flex flex-col gap-1">
        <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
          <LifeBuoy className="w-4 h-4" />
          <span>Suporte</span>
        </a>
        <a href="/login" className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/5 transition-all">
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </a>
      </div>
    </aside>
  );
}
