'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, X, List, Store, Filter, MapPin } from 'lucide-react';
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
    const orderItems = cartItems.map(c => {
      const raw = c.item as InventoryItem & { isKit?: boolean };
      return {
        name: raw.name,
        quantity: c.quantity,
        price: raw.rental_price,
        item_id: raw.isKit ? undefined : raw.id,
        kit_id: raw.isKit ? raw.id : undefined,
      };
    });

    await saveRentalOrder({
      renter_id: decorator.id,
      owner_id: ownerId,
      event_date: eventDate,
      observation,
      total_value: totalPrice(),
      items: orderItems,
      status: 'Pendente'
    });

    addNotification('Pedido Enviado!', 'O parceiro receberá sua solicitação em breve.');
    clear();
    setEventDate('');
    setObservation('');
    setIsCartOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Carregando catálogo B2B...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Catálogo de Locação B2B</h1>
        <p className="text-sm text-slate-400 mt-1">Alugue peças do acervo de outras decoradoras da sua região.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar B2B */}
        <aside className="w-full lg:w-[280px] shrink-0 flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-700">Filtrar por Parceira</h3>
            </div>
            <ul className="py-2">
              <li>
                <button
                  className={`w-full flex items-center gap-3 px-5 py-2.5 transition-colors ${
                    selectedPartnerId === 'all'
                      ? 'bg-brand-50 border-r-2 border-brand-500'
                      : 'hover:bg-slate-50 border-r-2 border-transparent'
                  }`}
                  onClick={() => setSelectedPartnerId('all')}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                    ALL
                  </div>
                  <span className={`text-sm font-medium ${selectedPartnerId === 'all' ? 'text-brand-700' : 'text-slate-600'}`}>
                    Todas as Parceiras
                  </span>
                </button>
              </li>
              {activePartners.map(p => (
                <li key={p.id}>
                  <button
                    className={`w-full flex items-center gap-3 px-5 py-2.5 transition-colors ${
                      selectedPartnerId === p.id
                        ? 'bg-brand-50 border-r-2 border-brand-500'
                        : 'hover:bg-slate-50 border-r-2 border-transparent'
                    }`}
                    onClick={() => setSelectedPartnerId(p.id)}
                  >
                    <img src={p.avatar_url} alt={p.name} className="w-8 h-8 rounded-full object-cover ring-2 ring-white shadow-sm" />
                    <div className="flex flex-col items-start min-w-0">
                      <span className={`text-sm font-medium truncate w-full text-left ${selectedPartnerId === p.id ? 'text-brand-700' : 'text-slate-600'}`}>
                        {p.name}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-2xl border border-brand-100 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-400 to-brand-600" />
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Meu Carrinho B2B</h3>
              <Badge variant="indigo">{cartItems.reduce((acc, c) => acc + c.quantity, 0)}</Badge>
            </div>
            <div className="p-5">
              {cartItems.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Adicione peças de parceiros para solicitar locação.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Store className="w-3.5 h-3.5" />
                    <span>Fornecedor:</span>
                    <span className="font-bold text-slate-700 truncate">{partners.find(p => p.id === cartItems[0].item.decorator_id)?.name}</span>
                  </div>
                  <div className="py-2 border-y border-slate-100">
                    <span className="text-xs text-slate-400 block mb-1">Total Estimado</span>
                    <div className="text-2xl font-bold text-brand-600">
                      {formatCurrency(totalPrice())}
                    </div>
                  </div>
                  <Button className="w-full" onClick={() => setIsCartOpen(true)}>Visualizar Pedido</Button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Grade de Produtos */}
        <main className="flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {displayedItems.length === 0 ? (
              <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-slate-100 border-dashed">
                <p className="text-sm text-slate-500">Nenhum item público encontrado.</p>
              </div>
            ) : (
              displayedItems.map(item => {
                const partner = partners.find(p => p.id === item.decorator_id);
                return (
                  <div key={item.id} className={`group bg-white rounded-2xl border transition-all duration-300 hover:shadow-lg flex flex-col ${item.isKit ? 'border-brand-200 shadow-brand-500/5' : 'border-slate-100 shadow-sm'}`}>
                    <div className="relative aspect-[4/3] rounded-t-2xl overflow-hidden bg-slate-100">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                          {item.isKit ? <List className="w-10 h-10" /> : <Store className="w-10 h-10" />}
                        </div>
                      )}
                      {item.isKit && (
                        <div className="absolute top-3 left-3">
                          <span className="bg-brand-500 text-white text-[10px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wider shadow-sm">Kit</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-3">
                        <img src={partner?.avatar_url} alt={partner?.name} className="w-5 h-5 rounded-full object-cover ring-1 ring-slate-200" />
                        <span className="text-xs font-semibold text-slate-600 truncate">{partner?.name}</span>
                        {partner?.location && (
                          <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                            <MapPin className="w-3 h-3" />
                            <span className="truncate max-w-[80px]">{partner.location.split('-')[0]}</span>
                          </div>
                        )}
                      </div>
                      
                      <h3 className="text-sm font-bold text-slate-800 leading-tight mb-4">{item.name}</h3>
                      
                      <div className="mt-auto flex items-end justify-between pt-4 border-t border-slate-50">
                        <div>
                          <span className="block text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">
                            {item.isKit ? 'Itens no Kit' : 'Disponível'}
                          </span>
                          <span className="text-sm font-bold text-slate-700">
                            {item.isKit ? `${item.rawKit.items.length} un` : `${item.stock_quantity} un`}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1">Valor B2B</span>
                          <span className="text-base font-extrabold text-brand-600">{formatCurrency(item.rental_price)}</span>
                        </div>
                      </div>
                      
                      <div className="mt-5">
                        <Button className="w-full" onClick={() => handleAddToCart(item as any)}>
                          <ShoppingBag className="w-4 h-4 mr-2" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>

      {/* Cart Checkout Modal */}
      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Finalizar Pedido de Locação"
        maxWidth="max-w-2xl"
      >
        {cartItems.length > 0 && (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-100">
              <h4 className="text-sm font-bold text-slate-700 mb-4">Itens Solicitados</h4>
              <div className="space-y-1">
                {cartItems.map((c, idx) => (
                  <div key={c.item.id} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-0">
                    <div className="flex-1 min-w-0 pr-4">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.item.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(c.item.rental_price)} / un</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <input 
                        type="number" 
                        min="1" 
                        max={c.item.stock_quantity}
                        value={c.quantity}
                        onChange={(e) => updateQuantity(idx, Number(e.target.value))}
                        className="w-16 px-2 py-1.5 text-center border border-slate-200 rounded-lg text-sm bg-white outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400"
                      />
                      <button onClick={() => removeItem(idx)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                <span className="text-sm font-bold text-slate-700">Total Estimado</span>
                <span className="text-xl font-extrabold text-brand-600">{formatCurrency(totalPrice())}</span>
              </div>
            </div>

            <div className="space-y-5">
              <Input 
                type="date" 
                label="Data do Evento (Obrigatório)" 
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Observações Logísticas</label>
                <textarea 
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-brand-400 focus:ring-2 focus:ring-brand-100" 
                  rows={3}
                  placeholder="Ex: Vou buscar o material na véspera, período da tarde."
                  value={observation}
                  onChange={e => setObservation(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={() => setIsCartOpen(false)}>Cancelar</Button>
              <Button onClick={handleCheckout}>Enviar Solicitação</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
