'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ShoppingBag, List, Store, ExternalLink, Search, Trash2, Package, Minus, Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCartStore } from '@/stores/cart-store';
import { useNotificationStore } from '@/stores/notification-store';
import { fetchPartnerPublicAcervo, fetchPartnerDecoratorsList, createRentalOrder } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatCurrency, formatPriceLabel } from '@/lib/utils';
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

  // Cart Modal — locação B2B com retirada/devolução.
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [observation, setObservation] = useState('');
  const [dateError, setDateError] = useState('');
  const [submitError, setSubmitError] = useState('');
  // Disponível por peça NO PERÍODO (null = desconhecido/erro). Preenchido só quando
  // as duas datas estão completas — "X de Y" sem intervalo não significa nada.
  const [availByCartId, setAvailByCartId] = useState<Record<string, number | null>>({});
  const [adjustedIds, setAdjustedIds] = useState<Set<string>>(new Set());
  const [isCheckingAvail, setIsCheckingAvail] = useState(false);
  const pickupRef = useRef<HTMLInputElement>(null);
  const returnRef = useRef<HTMLInputElement>(null);
  const todayStr = new Date().toISOString().slice(0, 10); // bloqueia datas passadas

  const fmtBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
  function validateDates(pu: string, rt: string): string {
    if (!pu || !rt) return ''; // incompleto ainda → sem erro
    if (pu < todayStr) return 'A data de retirada não pode ser no passado.';
    if (rt < pu) return 'A data de devolução não pode ser anterior à retirada.';
    return '';
  }
  const datesComplete = !!pickupDate && !!returnDate && !validateDates(pickupDate, returnDate);
  // Máx do stepper: com datas = disponível no período; sem datas = capacidade (acervo).
  const maxFor = (itemId: string, stock: number) =>
    datesComplete ? (availByCartId[itemId] ?? stock) : stock;
  const anyUnavailable = datesComplete && cartItems.some((c) => availByCartId[c.item.id] === 0);
  const canSubmit = cartItems.length > 0 && datesComplete && !anyUnavailable && !isCheckingAvail;

  // Stepper: mínimo 1 (para remover usa-se a lixeira); máximo = disponível no período.
  const decQty = (idx: number, qty: number) => updateQuantity(idx, Math.max(1, qty - 1));
  const incQty = (idx: number, qty: number, max: number) => updateQuantity(idx, Math.min(max || qty + 1, qty + 1));

  // Ao completar/alterar as datas: busca disponibilidade por peça e AJUSTA o stepper
  // se a quantidade escolhida passou do disponível no novo período — com sinal visível
  // (adjustedIds), nunca mostrando um número que seria recusado no envio nem caindo
  // em silêncio.
  useEffect(() => {
    setSubmitError('');
    if (!datesComplete || cartItems.length === 0) { setAvailByCartId({}); setAdjustedIds(new Set()); return; }
    let cancelled = false;
    setIsCheckingAvail(true);
    (async () => {
      const entries = await Promise.all(cartItems.map(async (c) => {
        const raw = c.item as InventoryItem & { isKit?: boolean };
        const qs = new URLSearchParams({ pickup: pickupDate, return: returnDate });
        if (raw.isKit) qs.set('kitId', raw.id); else qs.set('itemId', raw.id);
        try {
          const res = await fetch(`/api/orders/availability?${qs.toString()}`);
          const data = res.ok ? await res.json() : {};
          return [raw.id, typeof data.available === 'number' ? data.available : null] as const;
        } catch { return [raw.id, null] as const; }
      }));
      if (cancelled) return;
      const map: Record<string, number | null> = {};
      entries.forEach(([id, a]) => { map[id] = a; });
      setAvailByCartId(map);
      const adjusted = new Set<string>();
      cartItems.forEach((c, idx) => {
        const a = map[c.item.id];
        if (typeof a === 'number' && a >= 1 && c.quantity > a) { updateQuantity(idx, a); adjusted.add(c.item.id); }
      });
      setAdjustedIds(adjusted);
      setIsCheckingAvail(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupDate, returnDate, cartItems.length]);

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
    setSubmitError('');
    if (cartItems.length === 0) return;
    // Validação das datas: mensagem específica + foco no campo (bloqueia o envio).
    if (!pickupDate) { setDateError('Informe a data de retirada.'); pickupRef.current?.focus(); return; }
    if (!returnDate) { setDateError('Informe a data de devolução.'); returnRef.current?.focus(); return; }
    const de = validateDates(pickupDate, returnDate);
    if (de) { setDateError(de); (de.includes('devolução') ? returnRef : pickupRef).current?.focus(); return; }
    setDateError('');
    if (anyUnavailable) { setSubmitError('Há item indisponível nessas datas. Ajuste as datas ou remova o item do carrinho.'); return; }
    if (!decorator) return;

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

    try {
      await createRentalOrder({
        renter_id: decorator.id,
        owner_id: ownerId,
        pickup_date: pickupDate,
        return_date: returnDate,
        observation,
        total_value: totalPrice(),
        items: orderItems,
      });
      addNotification('Locação confirmada!', 'A parceira já vê o pedido no calendário dela.');
      clear();
      setPickupDate(''); setReturnDate(''); setObservation('');
      setAvailByCartId({}); setAdjustedIds(new Set());
      setIsCartOpen(false);
    } catch (e: any) {
      // 409 da corrida (peça levada enquanto preenchia) ou 400 de data → mensagem
      // ESPECÍFICA do servidor. E refaz a checagem para o "X de Y" refletir o novo cenário.
      setSubmitError(e?.message || 'Não foi possível enviar a solicitação. Tente novamente.');
      // Refaz a checagem de disponibilidade para o "X de Y" refletir o novo cenário.
      if (datesComplete) {
        const refetch = new URLSearchParams({ pickup: pickupDate, return: returnDate });
        const map: Record<string, number | null> = {};
        await Promise.all(cartItems.map(async (c) => {
          const raw = c.item as InventoryItem & { isKit?: boolean };
          const qs = new URLSearchParams(refetch);
          if (raw.isKit) qs.set('kitId', raw.id); else qs.set('itemId', raw.id);
          try { const r = await fetch(`/api/orders/availability?${qs.toString()}`); const dj = r.ok ? await r.json() : {}; map[raw.id] = typeof dj.available === 'number' ? dj.available : null; }
          catch { map[raw.id] = null; }
        }));
        setAvailByCartId(map);
      }
    }
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
            {filteredPartners.length === 0 && (
              <li className="mkt-partner-empty">Nenhum parceiro cadastrado ainda</li>
            )}
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
                      <span className="mkt-stat-label">{item.isKit ? 'Itens do Kit' : 'No acervo'}</span>
                      <span className="mkt-stat-val">{item.isKit ? `${item.kitItemCount ?? 0} un` : `${item.availableQuantity} un`}</span>
                    </div>
                    <div className="text-right">
                      <span className="mkt-stat-label">Valor (B2B)</span>
                      <span className="mkt-stat-val accent">{formatPriceLabel(item.rentalPrice)}</span>
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
            <Button icon={ShoppingBag} onClick={handleCheckout} disabled={!canSubmit}>Enviar Solicitação</Button>
          </>
        }
      >
        {cartItems.length > 0 ? (
          <div className="checkout">
            <div className="checkout-section-title">
              {cartItems.length === 1 ? 'Item solicitado (1)' : `Itens solicitados (${cartItems.length})`}
            </div>

            <div className="checkout-list">
              {cartItems.map((c, idx) => {
                const stock = c.item.stock_quantity || 0;
                const max = maxFor(c.item.id, stock);
                const avail = availByCartId[c.item.id];
                const subtotal = c.item.rental_price * c.quantity;
                return (
                  <div key={c.item.id} className="checkout-item">
                    <div className="checkout-item-thumb">
                      {c.item.image_url ? (
                        <img src={c.item.image_url} alt={c.item.name} />
                      ) : (
                        <Package className="w-5 h-5" />
                      )}
                    </div>

                    <div className="checkout-item-info">
                      <span className="checkout-item-name">{c.item.name}</span>
                      <span className="checkout-item-unit">{formatCurrency(c.item.rental_price)} / unidade</span>
                      {datesComplete && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, marginTop: 2,
                          color: avail === 0 ? 'var(--danger)' : adjustedIds.has(c.item.id) ? 'var(--warning)' : 'var(--text-secondary)',
                        }}>
                          {isCheckingAvail ? 'verificando disponibilidade…'
                            : avail == null ? '—'
                            : avail === 0 ? 'Indisponível nessas datas'
                            : `${avail} de ${stock} disponíveis`}
                          {adjustedIds.has(c.item.id) && avail !== 0 ? ` · ajustado para ${c.quantity}` : ''}
                        </span>
                      )}
                    </div>

                    <div className="checkout-stepper">
                      <button
                        type="button"
                        onClick={() => decQty(idx, c.quantity)}
                        disabled={c.quantity <= 1}
                        aria-label="Diminuir quantidade"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="checkout-stepper-val">{c.quantity}</span>
                      <button
                        type="button"
                        onClick={() => incQty(idx, c.quantity, max)}
                        disabled={max > 0 && c.quantity >= max}
                        aria-label="Aumentar quantidade"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <span className="checkout-item-subtotal">{formatCurrency(subtotal)}</span>

                    <button
                      type="button"
                      className="checkout-item-remove"
                      onClick={() => removeItem(idx)}
                      aria-label="Remover item"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="checkout-total">
              <span className="checkout-total-label">Total Estimado</span>
              <span className="checkout-total-value">{formatCurrency(totalPrice())}</span>
            </div>

            <div className="checkout-fields">
              <div className="quote-grid-2">
                <Input
                  ref={pickupRef}
                  type="date"
                  label="Data de retirada (obrigatório)"
                  min={todayStr}
                  value={pickupDate}
                  onChange={e => { setPickupDate(e.target.value); setDateError(''); }}
                />
                <Input
                  ref={returnRef}
                  type="date"
                  label="Data de devolução (obrigatório)"
                  min={pickupDate || todayStr}
                  value={returnDate}
                  onChange={e => { setReturnDate(e.target.value); setDateError(''); }}
                />
              </div>
              {dateError && <span className="checkout-error">{dateError}</span>}
              {datesComplete && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  Disponibilidade para <strong>{fmtBr(pickupDate)} → {fmtBr(returnDate)}</strong>
                  {isCheckingAvail ? ' · verificando…' : ''}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">
                  Observações Logísticas <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>(opcional)</span>
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Ex: Vou buscar o material na véspera, período da tarde."
                  value={observation}
                  onChange={e => setObservation(e.target.value)}
                />
              </div>
              {submitError && <span className="checkout-error">{submitError}</span>}
            </div>
          </div>
        ) : (
          <div className="checkout-empty">
            <ShoppingBag className="checkout-empty-icon" />
            <span>Seu carrinho está vazio.</span>
          </div>
        )}
      </Modal>
    </div>
  );
}
