'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ShoppingCart, CalendarCheck, ClipboardCheck, ShoppingBag, Trash2, Package } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { useAuthStore } from '@/stores/auth-store';
import { usePartyEvents, useRentalOrders } from '@/hooks/swr-hooks';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/Button';

type DerivedNotif = {
  id: string;
  kind: 'party' | 'quote' | 'order';
  title: string;
  message: string;
  sortKey: string;
  href: string;
};

function fmtDate(d?: string) {
  if (!d) return '';
  const iso = d.length === 10 ? `${d}T12:00:00` : d;
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function Header() {
  const router = useRouter();
  const { decorator } = useAuthStore();
  const { items, removeItem, totalPrice, totalItems, clear, requestCheckout } = useCartStore();
  const { events } = usePartyEvents(decorator?.id);
  const { orders } = useRentalOrders(decorator?.id);

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const cartRef = useRef<HTMLDivElement>(null);

  // Notificações derivadas dos dados reais (sem tabela dedicada):
  // festas confirmadas, links preenchidos por clientes e pedidos recebidos no Marketplace.
  const notifications: DerivedNotif[] = [
    // Festas confirmadas no Calendário
    ...events
      .filter(e => e.status === 'Confirmado')
      .map(e => ({
        id: `party-${e.id}`,
        kind: 'party' as const,
        title: 'Festa confirmada',
        message: `${e.theme || 'Evento'}${e.client_name ? ` — ${e.client_name}` : ''}${e.event_date ? ` • ${fmtDate(e.event_date)}` : ''}`,
        sortKey: e.event_date || '',
        href: '/calendar',
      })),
    // Cliente preencheu o link de orçamento (ainda pendente de confirmação)
    ...events
      .filter(e => e.public_token && e.client_name && e.status === 'Pendente')
      .map(e => ({
        id: `quote-${e.id}`,
        kind: 'quote' as const,
        title: 'Cliente preencheu o orçamento',
        message: `${e.client_name} enviou os dados para "${e.theme || 'orçamento'}".`,
        sortKey: e.event_date || '',
        href: '/clients',
      })),
    // Pedidos recebidos no Marketplace (sou o dono da peça alugada)
    ...orders
      .filter(o => o.owner_id === decorator?.id)
      .map(o => ({
        id: `order-${o.id}`,
        kind: 'order' as const,
        title: 'Novo pedido no Marketplace',
        message: `${o.renter?.name || 'Uma parceira'} solicitou uma locação${o.total_value ? ` • ${formatCurrency(o.total_value)}` : ''}.`,
        sortKey: o.created_at || '',
        href: '/marketplace',
      })),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const notifCount = notifications.length;
  const cartCount = totalItems();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
      if (cartRef.current && !cartRef.current.contains(event.target as Node)) {
        setIsCartOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const goTo = (href: string) => {
    setIsNotifOpen(false);
    router.push(href);
  };

  const notifIcon = (kind: DerivedNotif['kind']) => {
    if (kind === 'party') return <CalendarCheck className="w-4 h-4 text-emerald-500" />;
    if (kind === 'quote') return <ClipboardCheck className="w-4 h-4 text-indigo-500" />;
    return <ShoppingBag className="w-4 h-4 text-amber-500" />;
  };

  return (
    <header className="main-header">
      <div className="header-title">Bem-vindo(a) ao SB GESTOR</div>

      <div className="header-actions">
        {/* Notificações (sino) */}
        <div className="relative" ref={notifRef}>
          <button
            className="header-icon-btn"
            onClick={() => { setIsNotifOpen(v => !v); setIsCartOpen(false); }}
          >
            <Bell className="w-5 h-5" />
            {notifCount > 0 && (
              <span className="header-count-badge">{notifCount > 9 ? '9+' : notifCount}</span>
            )}
          </button>

          {isNotifOpen && (
            <div className="notifications-dropdown">
              <div className="notifications-dropdown-header">
                <span>Notificações</span>
                <span className="header-dropdown-count">{notifCount}</span>
              </div>
              <div className="dropdown-scroll">
                {notifCount === 0 ? (
                  <div className="dropdown-empty">Nenhuma notificação no momento</div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="notification-item notification-item-btn"
                      onClick={() => goTo(n.href)}
                    >
                      <span className="notification-item-icon">{notifIcon(n.kind)}</span>
                      <span className="notification-item-body">
                        <span className="notification-item-title">{n.title}</span>
                        <span className="notification-item-msg">{n.message}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Carrinho */}
        <div className="relative" ref={cartRef}>
          <button
            className="header-icon-btn"
            onClick={() => { setIsCartOpen(v => !v); setIsNotifOpen(false); }}
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="header-count-badge">{cartCount > 9 ? '9+' : cartCount}</span>
            )}
          </button>

          {isCartOpen && (
            <div className="notifications-dropdown">
              <div className="notifications-dropdown-header">
                <span>Meu Carrinho</span>
                <span className="header-dropdown-count">{cartCount}</span>
              </div>

              <div className="dropdown-scroll">
                {items.length === 0 ? (
                  <div className="dropdown-empty dropdown-empty-cart">
                    <ShoppingCart className="w-8 h-8" />
                    Seu carrinho está vazio.
                  </div>
                ) : (
                  items.map((c, index) => (
                    <div key={`${c.item.id}-${index}`} className="cart-dropdown-item">
                      <div className="cart-dropdown-thumb">
                        {c.item.image_url ? (
                          <img src={c.item.image_url} alt={c.item.name} />
                        ) : (
                          <Package className="w-4 h-4" />
                        )}
                      </div>
                      <div className="cart-dropdown-info">
                        <span className="cart-dropdown-name">{c.item.name}</span>
                        <span className="cart-dropdown-meta">
                          {c.quantity} × {formatCurrency(c.item.rental_price)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="cart-dropdown-remove"
                        onClick={() => removeItem(index)}
                        aria-label="Remover item"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {items.length > 0 && (
                <div className="cart-dropdown-footer">
                  <div className="cart-dropdown-total">
                    <span>Total</span>
                    <strong>{formatCurrency(totalPrice())}</strong>
                  </div>
                  <div className="cart-dropdown-actions">
                    <Button variant="secondary" size="sm" onClick={() => clear()}>
                      Limpar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => { setIsCartOpen(false); requestCheckout(); router.push('/marketplace'); }}
                    >
                      Finalizar Pedido
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
