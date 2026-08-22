'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ShoppingBag, List, Store, ArrowLeft, MapPin, MessageCircle, AtSign } from 'lucide-react';
import { useCartStore } from '@/stores/cart-store';
import { useNotificationStore } from '@/stores/notification-store';
import { fetchPartnerPublicPage } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatPriceLabel, whatsappUrl, instagramUrl, sanitizeInstagramHandle } from '@/lib/utils';
import type { InventoryItem, PartnerDecorator, PublicMarketplaceItem } from '@/types';

export default function PartnerPublicPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params.id;
  const router = useRouter();
  const { items: cartItems, addItem } = useCartStore();
  const { addNotification } = useNotificationStore();

  const [partner, setPartner] = useState<PartnerDecorator | null>(null);
  const [publicItems, setPublicItems] = useState<PublicMarketplaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const data = await fetchPartnerPublicPage(partnerId);
      if (!data) {
        setNotFound(true);
      } else {
        setPartner(data.partner);
        setPublicItems(data.items);
      }
      setIsLoading(false);
    }
    load();
  }, [partnerId]);

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

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando página da parceira...</div>;

  if (notFound || !partner) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-4">Página da parceira não encontrada.</p>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => router.push('/marketplace')}>
          Voltar ao Marketplace
        </Button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="partner-back-link" onClick={() => router.push('/marketplace')}>
        <ArrowLeft className="w-4 h-4" /> Voltar ao Marketplace
      </button>

      {/* Cabeçalho da parceira */}
      <div className="partner-public-header">
        {partner.logoUrl ? (
          <img src={partner.logoUrl} alt={partner.name} className="partner-public-avatar" />
        ) : (
          <div className="partner-public-avatar partner-public-avatar-fallback">
            {partner.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="page-title">{partner.name}</h1>
          {partner.location && (
            <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin className="w-4 h-4" /> {partner.location}
            </p>
          )}
          <span className="partner-public-count">{publicItems.length} itens públicos disponíveis</span>
        </div>
      </div>

      {/* Apresentação + contato. Campos vazios são OMITIDOS (sem linha em branco
          nem link quebrado). Links externos abrem em nova aba com rel seguro. */}
      {(partner.about || partner.whatsapp || partner.instagram) && (
        <div style={{ marginTop: 16 }}>
          {partner.about && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 14, maxWidth: 680, whiteSpace: 'pre-line' }}>
              {partner.about}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {partner.whatsapp && (
              <a
                href={whatsappUrl(partner.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#059669', background: 'rgba(5,150,105,0.10)', padding: '8px 14px', borderRadius: 8, textDecoration: 'none' }}
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
            {partner.instagram && (
              <a
                href={instagramUrl(partner.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#c026d3', background: 'rgba(192,38,211,0.10)', padding: '8px 14px', borderRadius: 8, textDecoration: 'none' }}
              >
                <AtSign className="w-4 h-4" /> {sanitizeInstagramHandle(partner.instagram)}
              </a>
            )}
          </div>
        </div>
      )}

      <div className="cards-grid" style={{ marginTop: 24 }}>
        {publicItems.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500">
            Esta parceira ainda não tem itens públicos no Marketplace.
          </div>
        ) : (
          publicItems.map(item => (
            <div key={item.id} className={`inventory-card ${item.isKit ? 'kit-border' : ''}`}>
              <div className="card-img-wrapper" style={{ position: 'relative' }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                    {item.isKit ? <List className="w-8 h-8" /> : <Store className="w-8 h-8" />}
                  </div>
                )}
                <span className={`absolute top-2 left-2 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase ${item.isKit ? 'bg-indigo-600' : 'bg-slate-500'}`}>
                  {item.isKit ? 'Kit' : 'Peça'}
                </span>
              </div>
              <div className="card-body">
                <h3 className="card-title">{item.name}</h3>
                <div className="card-stats mt-auto">
                  <div>
                    <span className="stat-label">{item.isKit ? 'Itens do Kit' : 'Disponível'}</span>
                    <span className="stat-val">{item.isKit ? `${item.kitItemCount ?? 0} un` : `${item.availableQuantity} un`}</span>
                  </div>
                  <div className="text-right">
                    <span className="stat-label">Valor (B2B)</span>
                    <span className="stat-val text-indigo-600">{formatPriceLabel(item.rentalPrice)}</span>
                  </div>
                </div>
                <div className="card-actions mt-4">
                  <Button className="w-full" icon={ShoppingBag} onClick={() => handleAddToCart(item)}>Alugar</Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
