'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, ShoppingCart, UserCircle } from 'lucide-react';
import { useNotificationStore } from '@/stores/notification-store';
import { useCartStore } from '@/stores/cart-store';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '../ui/Badge';

export function Header() {
  const { notifications, markAsRead } = useNotificationStore();
  const { totalItems } = useCartStore();
  const { decorator } = useAuthStore();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => n.unread).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-8 py-4 bg-white/70 backdrop-blur-xl border-b border-slate-100">
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          Olá, {decorator?.name || 'Decoradora'} 👋
        </h2>
        <p className="text-sm text-slate-400">Bem-vindo(a) de volta ao SB GESTOR</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Notificações */}
        <div className="relative" ref={notifRef}>
          <button
            className="relative p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md shadow-brand-500/30 animate-pulse-dot">
                {unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div className="absolute right-0 top-12 w-[360px] bg-white rounded-2xl shadow-xl border border-slate-100 animate-scale-in overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-700">Notificações</span>
                <Badge variant="indigo">{unreadCount} novas</Badge>
              </div>
              <div className="overflow-y-auto max-h-[300px]">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">Nenhuma notificação</div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-5 py-3 border-b border-slate-50 cursor-pointer transition-colors hover:bg-slate-50 ${
                        notif.unread ? 'bg-brand-50/30' : ''
                      }`}
                      onClick={() => { markAsRead(notif.id); setIsNotifOpen(false); }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-semibold text-slate-700">{notif.title}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">{notif.time}</span>
                      </div>
                      <p className="text-xs text-slate-500">{notif.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Carrinho */}
        <button className="relative p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer">
          <ShoppingCart className="w-5 h-5" />
          {totalItems() > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
              {totalItems()}
            </span>
          )}
        </button>

        {/* Avatar */}
        <div className="ml-2 w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center ring-2 ring-brand-200 ring-offset-2 shadow-md">
          {decorator?.avatar_url ? (
            <img src={decorator.avatar_url} alt={decorator.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            <UserCircle className="w-5 h-5 text-white" />
          )}
        </div>
      </div>
    </header>
  );
}
