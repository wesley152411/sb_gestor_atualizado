'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, X, List, Store, ExternalLink, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCartStore } from '@/stores/cart-store';
import { useNotificationStore } from '@/stores/notification-store';
import { fetchPartnerPublicAcervo, fetchPartnerDecoratorsList, saveRentalOrder } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import type { InventoryItem, PartnerDecorator, PublicMarketplaceItem } from '@/types';

// Chips de filtro exibidos na barra lateral (visual, alinhado ao layout aprovado).
const REGION_CHIPS = ['Curitiba', 'Região Metro', 'Favoritas'];

export default function MarketplacePage() {
  const router = useRouter();
  const { decorator } = useAuthStore();
  const {
    items: cartItems, addItem, removeItem, updateQuantity, clear, totalPrice,
    checkoutRequested, clearCheckoutRequest,
  } = useCartStore();
  const { addNotification } = useNotificationStore();

  // Regra de negócio: o feed mostra SOMENTE o acervo público de parceiras
  // (nunca o da decoradora logada). Os nomes abaixo deixam isso explícito.
  const [publicMarketplaceItems, setPublicMarketplaceItems] = useState<PublicMarketplaceItem[]>([]);
  const [partnerDecoratorsList, setPartnerDecoratorsList] = useState<PartnerDecorator[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('all');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [activeChip, setActiveChip] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cart Modal
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    async function loadMarketplace() {
      setIsLoading(true);
      // A id da decoradora logada é passada EXPLICITAMENTE para excluir o próprio acervo.
      const [acervo, partners] = await Promise.all([
        fetchPartnerPublicAcervo(decorator?.id),
        fetchPartnerDecoratorsList(decorator?.id),
      ]);
      setPublicMarketplaceItems(acervo);
      setPartnerDecoratorsList(partners);
      setIsLoading(false);
    }
    loadMarketplace();
  }, [decorator?.id]);

  // Checkout acionado pelo botão de carrinho do topo (Header).
  useEffect(() => {
    if (checkoutRequested && cartItems.length > 0) {
      setIsCartOpen(true);
      clearCheckoutRequest();
    } else if (checkoutRequested) {
      clearCheckoutRequest();
    }
  }, [checkoutRequested, cartItems.length, clearCheckoutRequest]);

  const filteredPartners = partnerDecoratorsList.filter(p =>
    p.name.toLowerCase().includes(partnerSearch.toLowerCase())
  );

  const displayedItems = selectedPartnerId === 'all'
    ? publicMarketplaceItems
    : publicMarketplaceItems.filter(i => i.owner.id === selectedPartnerId);

  // Converte um item público do Marketplace para o formato aceito pelo carrinho.
  const toCartItem = (mi: PublicMarketplaceItem): InventoryItem & { isKit: boolean } => ({
    id: mi.id,
    decorator_id: mi.owner.id,
    name: mi.name,
    description: mi.description || '',
    image_url: mi.imageUrl || '',
    status: 'Público',
    stock_quantity: mi.availableQuantity,
    rental_price: mi.rentalPrice,
    internal_cost: 0,
    isKit: mi.isKit,
  });

  const handleAddToCart = (mi: PublicMarketplaceItem) => {
    if (cartItems.length > 0 && cartItems[0].item.decorator_id !== mi.owner.id) {
      alert('Você só pode adicionar itens de uma mesma parceira por pedido. Finalize o carrinho atual ou esvazie-o primeiro.');
      return;
    }
    addItem(toCartItem(mi));
    addNotification('Adicionado ao Carrinho', `"${mi.name}" foi adicionado.`);
  };

  // "Ver página": redireciona para o perfil público da parceira dona da peça.
  const handleViewPartnerPage = (owner: PartnerDecorator) => {
    router.push(`/marketplace/partner/${owner.publicPageId}`);
  };

  const handleCheckout = async () => {
    if (!decorator || cartItems.length === 0 || !eventDate) {
      alert('Preencha a data do evento para solicitar a locação.');
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
    });

    addNotification('Pedido Enviado!', 'A parceira receberá sua solicitação em breve.');
    clear();
    setEventDate('');
    setObservation('');
    setIsCartOpen(false);
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando catálogo B2B...</div>;

  return (
    <div className="marketplace-layout">
      <aside className="market-sidebar">
        <div className="mkt-sidebar-box">
          <h3 className="mkt-sidebar-title">Parceiras</h3>
          <p className="mkt-sidebar-subtitle">Pesquise e navegue pelas páginas de outras decoradoras.</p>

          <div className="mkt-search">
            <Search />
            <input
              type="search"
              placeholder="Buscar parceira"
              value={partnerSearch}
              onChange={(e) => setPartnerSearch(e.target.value)}
            />
          </div>

          <div className="mkt-chips">
            {REGION_CHIPS.map(chip => (
              <button
                key={chip}
                type="button"
                className={`mkt-chip ${activeChip === chip ? 'active' : ''}`}
                onClick={() => setActiveChip(activeChip === chip ? null : chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <ul className="mkt-partner-list">
            <li
              className={`mkt-partner-item ${selectedPartnerId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedPartnerId('all')}
            >
              <div className="mkt-partner-avatar mkt-partner-avatar-fallback all">ALL</div>
              <span className="mkt-partner-name">Todas as Parceiras</span>
            </li>
            {filteredPartners.map(partner => (
              <li
                key={partner.id}
                className={`mkt-partner-item ${selectedPartnerId === partner.id ? 'active' : ''}`}
                onClick={() => setSelectedPartnerId(partner.id)}
              >
                {partner.logoUrl ? (
                  <img src={partner.logoUrl} alt={partner.name} className="mkt-partner-avatar" />
                ) : (
                  <div className="mkt-partner-avatar mkt-partner-avatar-fallback">
                    {partner.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="mkt-partner-name">{partner.name}</div>
                  <div className="mkt-partner-meta">
                    {partner.location ? `${partner.location} · ` : ''}{partner.publicItemCount ?? 0} peças
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main>
        <div className="page-header mb-6">
          <div>
            <h1 className="page-title">Catálogo de Locação B2B</h1>
            <p className="page-subtitle">Alugue peças do acervo público de outras decoradoras da sua região.</p>
          </div>
        </div>

        <div className="mkt-grid">
          {displayedItems.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500">Nenhum item público encontrado.</div>
          ) : (
            displayedItems.map(item => (
              <div key={item.id} className="mkt-card">
                <div className="mkt-card-photo">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} />
                  ) : (
                    <div className="mkt-card-photo-placeholder">foto da peça</div>
                  )}
                  <span className={`mkt-card-badge ${item.isKit ? 'kit' : ''}`}>
                    {item.isKit ? 'Kit' : 'Peça'}
                  </span>
                </div>

                <div className="mkt-card-body">
                  <div className="mkt-card-partner">
                    {item.owner.logoUrl ? (
                      <img src={item.owner.logoUrl} alt={item.owner.name} className="mkt-card-partner-avatar" />
                    ) : (
                      <div className="mkt-card-partner-avatar mkt-card-partner-avatar-fallback">
                        {item.owner.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="mkt-card-partner-name">{item.owner.name}</span>
                  </div>

                  <div className="mkt-card-name">{item.name}</div>

                  <div className="mkt-card-stats">
                    <div>
                      <span className="mkt-stat-label">{item.isKit ? 'Itens do Kit' : 'Disponível'}</span>
                      <span className="mkt-stat-val">{item.isKit ? `${item.kitItemCount ?? 0} un` : `${item.availableQuantity} un`}</span>
                    </div>
                    <div className="text-right">
                      <span className="mkt-stat-label">Valor (B2B)</span>
                      <span className="mkt-stat-val accent">{formatCurrency(item.rentalPrice)}</span>
                    </div>
                  </div>

                  <div className="mkt-card-actions">
                    <Button className="w-full" icon={ShoppingBag} onClick={() => handleAddToCart(item)}>Alugar</Button>
                    <Button variant="secondary" className="w-full" icon={ExternalLink} onClick={() => handleViewPartnerPage(item.owner)}>
                      Ver página
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Cart Checkout Modal (aberto pelo botão de carrinho do topo) */}
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
        {cartItems.length > 0 ? (
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
        ) : (
          <p className="text-center text-slate-500 py-6">Seu carrinho está vazio.</p>
        )}
      </Modal>
    </div>
  );
}
