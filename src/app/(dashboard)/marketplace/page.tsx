'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, X, List, Store } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCartStore } from '@/stores/cart-store';
import { useNotificationStore } from '@/stores/notification-store';
import { getDecorators, getInventoryItems, getKits, saveRentalOrder } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import type { Decorator, InventoryItem, Kit } from '@/types';

export default function MarketplacePage() {
  const { decorator } = useAuthStore();
  const { items: cartItems, addItem, removeItem, updateQuantity, clear, totalPrice } = useCartStore();
  const { addNotification } = useNotificationStore();

  const [partners, setPartners] = useState<Decorator[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Cart Modal
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    async function loadData() {
      const [decs, inv, kts] = await Promise.all([getDecorators(), getInventoryItems(), getKits()]);
      setPartners(decs);
      setInventory(inv);
      setKits(kts);
      setIsLoading(false);
    }
    loadData();
  }, []);

  // Marketplace rules: Only public items, exclude own items
  const publicItems = inventory.filter(i => i.status === 'Público' && i.decorator_id !== decorator?.id);
  const publicKits = kits.filter(k => k.status === 'Público' && k.decorator_id !== decorator?.id);
  
  const unifiedPublicItems = [
    ...publicItems.map(i => ({ ...i, isKit: false as const })),
    ...publicKits.map(k => ({ 
      id: k.id,
      decorator_id: k.decorator_id,
      name: k.name,
      description: k.description,
      image_url: k.image_url,
      status: k.status,
      stock_quantity: 1,
      rental_price: k.value ?? 0,
      isKit: true as const,
      rawKit: k
    }))
  ];

  const displayedItems = selectedPartnerId === 'all' 
    ? unifiedPublicItems 
    : unifiedPublicItems.filter(i => i.decorator_id === selectedPartnerId);

  // Filter partners that actually have public items
  const activePartnerIds = Array.from(new Set(unifiedPublicItems.map(i => i.decorator_id)));
  const activePartners = partners.filter(p => activePartnerIds.includes(p.id));

  const handleAddToCart = (item: InventoryItem) => {
    // Check if cart has items from another decorator
    if (cartItems.length > 0 && cartItems[0].item.decorator_id !== item.decorator_id) {
      alert("Você só pode adicionar itens de um mesmo parceiro por pedido. Finalize o carrinho atual ou esvazie-o primeiro.");
      return;
    }
    addItem(item);
    addNotification('Adicionado ao Carrinho', `"${item.name}" foi adicionado.`);
  };

  const handleCheckout = async () => {
    if (!decorator || cartItems.length === 0 || !eventDate) {
      alert("Preencha a data do evento para solicitar a locação.");
      return;
    }

    const ownerId = cartItems[0].item.decorator_id;
    const orderItems = cartItems.map(c => ({
      name: c.item.name,
      quantity: c.quantity,
      price: c.item.rental_price,
      item: c.item
    }));

    await saveRentalOrder({
      renter_id: decorator.id,
      owner_id: ownerId,
      event_date: eventDate,
      observation,
      total_value: totalPrice(),
      items: orderItems
    });

    addNotification('Pedido Enviado!', 'O parceiro receberá sua solicitação em breve.');
    clear();
    setEventDate('');
    setObservation('');
    setIsCartOpen(false);
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando catálogo B2B...</div>;

  return (
    <div className="marketplace-layout">
      <aside className="market-sidebar">
        <div className="market-filter-box">
          <h3 className="filter-title">Filtrar por Parceira</h3>
          <ul className="partner-list">
            <li 
              className={`partner-item ${selectedPartnerId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedPartnerId('all')}
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">ALL</div>
              Todas as Parceiras
            </li>
            {activePartners.map(p => (
              <li 
                key={p.id}
                className={`partner-item ${selectedPartnerId === p.id ? 'active' : ''}`}
                onClick={() => setSelectedPartnerId(p.id)}
              >
                <img src={p.avatar_url} alt={p.name} className="partner-avatar" />
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="cart-summary-box">
          <h3 className="filter-title flex justify-between items-center">
            Meu Carrinho B2B
            <Badge variant="kit">{cartItems.reduce((acc, c) => acc + c.quantity, 0)}</Badge>
          </h3>
          {cartItems.length === 0 ? (
            <p className="text-xs text-slate-500">Adicione peças de parceiros para solicitar locação.</p>
          ) : (
            <div className="space-y-4">
              <div className="text-sm">
                Fornecedor: <span className="font-bold">{partners.find(p => p.id === cartItems[0].item.decorator_id)?.name}</span>
              </div>
              <div className="text-xl font-bold text-indigo-600">
                {formatCurrency(totalPrice())}
              </div>
              <Button className="w-full" onClick={() => setIsCartOpen(true)}>Visualizar Pedido</Button>
            </div>
          )}
        </div>
      </aside>

      <main>
        <div className="page-header mb-6">
          <div>
            <h1 className="page-title">Catálogo de Locação B2B</h1>
            <p className="page-subtitle">Alugue peças do acervo de outras decoradoras da sua região.</p>
          </div>
        </div>

        <div className="cards-grid">
          {displayedItems.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500">Nenhum item público encontrado.</div>
          ) : (
            displayedItems.map(item => {
              const partner = partners.find(p => p.id === item.decorator_id);
              return (
                <div key={item.id} className={`inventory-card ${item.isKit ? 'kit-border' : ''}`}>
                  <div className="card-img-wrapper" style={{ position: 'relative' }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                        {item.isKit ? <List className="w-8 h-8" /> : <Store className="w-8 h-8" />}
                      </div>
                    )}
                    {item.isKit && (
                      <span className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">Kit</span>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="flex items-center gap-2 mb-2">
                      <img src={partner?.avatar_url} alt={partner?.name} className="w-5 h-5 rounded-full object-cover" />
                      <span className="text-xs font-semibold text-slate-600 truncate">{partner?.name}</span>
                    </div>
                    <h3 className="card-title">{item.name}</h3>
                    <div className="card-stats mt-auto">
                      <div>
                        <span className="stat-label">
                          {item.isKit ? 'Itens do Kit' : 'Disponível'}
                        </span>
                        <span className="stat-val">
                          {item.isKit ? `${item.rawKit.items.length} un` : `${item.stock_quantity} un`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="stat-label">Valor (B2B)</span>
                        <span className="stat-val text-indigo-600">{formatCurrency(item.rental_price)}</span>
                      </div>
                    </div>
                    <div className="card-actions mt-4">
                      <Button className="w-full" icon={ShoppingBag} onClick={() => handleAddToCart(item as any)}>Adicionar</Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Cart Checkout Modal */}
      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Finalizar Pedido de Locação"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCartOpen(false)}>Cancelar</Button>
            <Button onClick={handleCheckout}>Enviar Solicitação</Button>
          </>
        }
      >
        {cartItems.length > 0 && (
          <div className="space-y-6">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="font-bold mb-2">Itens Solicitados</h4>
              {cartItems.map((c, idx) => (
                <div key={c.item.id} className="flex justify-between items-center py-2 border-b border-slate-200 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{c.item.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(c.item.rental_price)} / un</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number" 
                      min="1" 
                      max={c.item.stock_quantity}
                      value={c.quantity}
                      onChange={(e) => updateQuantity(idx, Number(e.target.value))}
                      className="w-16 p-1 text-center border rounded text-sm"
                    />
                    <button onClick={() => removeItem(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                <span className="font-bold">Total Estimado</span>
                <span className="text-lg font-bold text-indigo-600">{formatCurrency(totalPrice())}</span>
              </div>
            </div>

            <div className="space-y-4">
              <Input 
                type="date" 
                label="Data do Evento (Obrigatório)" 
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
              />
              <div className="form-group">
                <label className="form-label">Observações Logísticas</label>
                <textarea 
                  className="form-input" 
                  rows={3}
                  placeholder="Ex: Vou buscar o material na véspera, período da tarde."
                  value={observation}
                  onChange={e => setObservation(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
