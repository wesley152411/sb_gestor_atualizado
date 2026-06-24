'use client';

import { useState, useEffect } from 'react';
import { Camera, MapPin, AtSign, Phone, Info } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { getInventoryItems, getRentalOrders } from '@/services/api';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import type { InventoryItem, RentalOrder } from '@/types';

export default function MyPage() {
  const { decorator } = useAuthStore();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<RentalOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!decorator) return;
      const [inv, ords] = await Promise.all([
        getInventoryItems(decorator.id),
        getRentalOrders(decorator.id)
      ]);
      setItems(inv);
      setOrders(ords);
      setIsLoading(false);
    }
    loadData();
  }, [decorator]);

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando perfil...</div>;

  const publicItems = items.filter(i => i.status === 'Público');
  
  // Simulated stats
  const recentOrders = orders.filter(o => new Date(o.created_at).getMonth() === new Date().getMonth());
  const reach = publicItems.length > 0 ? Math.max(50, publicItems.length * 48 + recentOrders.length * 120) : 0;
  const reachText = reach > 999 ? (reach / 1000).toFixed(1) + 'k' : reach.toString();
  const inquiryRate = publicItems.length > 0 ? ((recentOrders.length / Math.max(1, publicItems.length)) * 100).toFixed(1) : '0.0';
  const reviewCount = Math.max(0, recentOrders.length * 3 + publicItems.length * 2);

  return (
    <div>
      <div className="mypage-cover">
        <img src={decorator?.cover_url || 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=1200&q=80'} alt="Cover" />
        <div className="mypage-cover-overlay">
          <Camera className="w-8 h-8" />
          <span>Alterar foto de capa</span>
        </div>
      </div>

      <div className="mypage-profile-card">
        <img src={decorator?.avatar_url} alt={decorator?.name} className="mypage-profile-avatar" />
        <div className="mt-8">
          <h1 className="mypage-profile-name">{decorator?.name}</h1>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1 text-sm text-slate-600"><MapPin className="w-4 h-4"/> {decorator?.location || 'Não informado'}</span>
            <Badge variant="success">Membro Verificado</Badge>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mypage-stats-row">
          <div className="mypage-stat-card">
            <span className="mypage-stat-label">Itens Publicados</span>
            <span className="mypage-stat-value">{publicItems.length}</span>
          </div>
          <div className="mypage-stat-card">
            <span className="mypage-stat-label">Alcance (mês)</span>
            <span className="mypage-stat-value">{reachText}</span>
          </div>
          <div className="mypage-stat-card">
            <span className="mypage-stat-label">Taxa de Contato</span>
            <span className="mypage-stat-value">{inquiryRate}%</span>
          </div>
          <div className="mypage-stat-card">
            <span className="mypage-stat-label">Avaliações Positivas</span>
            <span className="mypage-stat-value">{reviewCount}</span>
          </div>
        </div>

        <div className="mypage-contact-row">
          <div className="mypage-contact-card">
            <div className="contact-icon bg-pink-100 text-pink-600"><AtSign className="w-6 h-6"/></div>
            <div><span className="contact-label">Instagram</span><span className="contact-value">{decorator?.instagram || 'Não informado'}</span></div>
          </div>
          <div className="mypage-contact-card">
            <div className="contact-icon bg-green-100 text-green-600"><Phone className="w-6 h-6"/></div>
            <div><span className="contact-label">WhatsApp</span><span className="contact-value">{decorator?.whatsapp || 'Não informado'}</span></div>
          </div>
          <div className="mypage-contact-card">
            <div className="contact-icon"><Info className="w-6 h-6"/></div>
            <div><span className="contact-label">Sobre</span><span className="contact-value text-xs line-clamp-2">{decorator?.about || 'Nenhuma informação.'}</span></div>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-xl font-bold mb-6">Peças no Marketplace ({publicItems.length})</h2>
          <div className="cards-grid">
            {publicItems.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed rounded-lg">
                Nenhum item publicado. Vá em Inventário e altere o status dos itens para Público.
              </div>
            ) : (
              publicItems.map(item => (
                <div key={item.id} className="inventory-card">
                  <div className="card-img-wrapper"><img src={item.image_url} alt={item.name} /></div>
                  <div className="card-body">
                    <h3 className="card-title">{item.name}</h3>
                    <div className="card-stats mt-auto">
                      <div><span className="stat-label">Estoque</span><span className="stat-val">{item.stock_quantity} un</span></div>
                      <div className="text-right"><span className="stat-label">Locação B2B</span><span className="stat-val text-indigo-600">{formatCurrency(item.rental_price)}</span></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
