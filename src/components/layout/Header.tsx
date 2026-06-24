'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, ShoppingCart, UserCircle } from 'lucide-react';
import { useNotificationStore } from '@/stores/notification-store';
import { useCartStore } from '@/stores/cart-store';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export function Header() {
  const { notifications, markAsRead } = useNotificationStore();
  const { totalItems } = useCartStore();
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
    <header className="main-header">
      <div className="header-title">Bem-vindo(a) ao SB GESTOR</div>
      
      <div className="header-actions">
        {/* Notificações */}
        <div className="relative" ref={notifRef}>
          <button 
            className="header-icon-btn"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="header-icon-badge">{unreadCount}</span>
            )}
          </button>

          {isNotifOpen && (
            <div className="notifications-dropdown">
              <div className="notifications-dropdown-header">
                <span>Notificações</span>
                <Badge variant="neutral">{unreadCount} novas</Badge>
              </div>
              <div className="overflow-y-auto max-h-[300px]">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500">Nenhuma notificação</div>
                ) : (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={cn("notification-item", notif.unread && "unread")}
                      onClick={() => {
                        markAsRead(notif.id);
                        setIsNotifOpen(false);
                      }}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold">{notif.title}</span>
                        <span className="text-[10px] text-slate-500">{notif.time}</span>
                      </div>
                      <p className="text-xs text-slate-600">{notif.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Carrinho */}
        <button className="header-icon-btn">
          <ShoppingCart className="w-5 h-5" />
          {totalItems() > 0 && (
            <span className="header-icon-badge">{totalItems()}</span>
          )}
        </button>

        {/* Perfil */}
        <button className="header-avatar-btn">
          <UserCircle className="w-7 h-7" />
        </button>
      </div>
    </header>
  );
}
