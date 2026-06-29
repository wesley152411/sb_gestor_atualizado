'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Camera, MapPin, AtSign, Phone, Info, Plus, Pencil, 
  Eye, EyeOff, Search, Smartphone, Download, Store, ToggleLeft, List
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useInventory, useKits, useRentalOrders, useDecoratorChats } from '@/hooks/swr-hooks';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import type { InventoryItem, Kit, RentalOrder, ChatMessage } from '@/types';
import { 
  saveDecoratorProfile, saveInventoryItem, saveKit 
} from '@/services/api';

export default function MyPage() {
  const { decorator, updateDecorator } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const { items, isLoading: isItemsLoading, mutate: mutateItems } = useInventory(decorator?.id);
  const { kits, isLoading: isKitsLoading, mutate: mutateKits } = useKits(decorator?.id);
  const { orders, isLoading: isOrdersLoading, mutate: mutateOrders } = useRentalOrders(decorator?.id);
  const { chats, isLoading: isChatsLoading, mutate: mutateChats } = useDecoratorChats(decorator?.id);

  const isLoading = isItemsLoading || isKitsLoading || isOrdersLoading || isChatsLoading;

  // Search in import modal
  const [importSearch, setImportSearch] = useState('');

  // Modals visibility state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isKitEditModalOpen, setIsKitEditModalOpen] = useState(false);

  // Edit Profile Form State
  const [editProfileForm, setEditProfileForm] = useState({
    instagram: '',
    whatsapp: '',
    phone: '',
    location: '',
    about: ''
  });

  // Edit Item Form State
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem>>({});
  const [editingKit, setEditingKit] = useState<Partial<Kit>>({});

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [isAboutExpanded, setIsAboutExpanded] = useState(false);



  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando perfil...</div>;

  const isAboutLong = (decorator?.about || '').length > 200 || (decorator?.about || '').includes('\n');

  const publicItems = items ? items.filter(i => i.status === 'Público') : [];
  const publicKits = kits ? kits.filter(k => k.status === 'Público') : [];

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
  
  // Real stats consumed directly from the database (decorator object):
  const reach = decorator?.reach ?? 0;
  const reachText = reach > 999 ? (reach / 1000).toFixed(1) + 'k' : reach.toString();
  const inquiryRate = (decorator?.contact_rate ?? 0).toFixed(1);
  const reviewCount = decorator?.positive_reviews ?? 0;

  // Image Upload Handlers
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !decorator) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;
      const updated = { ...decorator, avatar_url: base64 };
      try {
        await saveDecoratorProfile(updated);
        updateDecorator({ avatar_url: base64 });
        addNotification('Foto de Perfil Atualizada', 'A foto de perfil foi salva com sucesso!');
      } catch (err) {
        addNotification('Erro', 'Falha ao atualizar foto de perfil.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !decorator) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;
      const updated = { ...decorator, cover_url: base64 };
      try {
        await saveDecoratorProfile(updated);
        updateDecorator({ cover_url: base64 });
        addNotification('Capa Atualizada', 'A foto de capa foi salva com sucesso!');
      } catch (err) {
        addNotification('Erro', 'Falha ao atualizar foto de capa.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Edit Profile Handlers
  const handleOpenEditProfile = () => {
    if (!decorator) return;
    setEditProfileForm({
      instagram: decorator.instagram || '',
      whatsapp: decorator.whatsapp || '',
      phone: decorator.phone || '',
      location: decorator.location || '',
      about: decorator.about || ''
    });
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!decorator) return;
    const updated = {
      ...decorator,
      ...editProfileForm
    };
    try {
      await saveDecoratorProfile(updated);
      updateDecorator(editProfileForm);
      setIsEditProfileOpen(false);
      addNotification('Perfil Atualizado', 'Suas informações públicas foram salvas no banco de dados!');
    } catch (err) {
      addNotification('Erro', 'Falha ao atualizar perfil.');
    }
  };

  // Import Items Toggle Handler
  const handleTogglePublish = async (item: any) => {
    const isPublic = item.status === 'Público';
    const nextStatus = isPublic ? 'Privado' : 'Público';
    
    if (item.isKit) {
      let rentalPrice = item.rental_price;
      if (nextStatus === 'Público' && (!rentalPrice || rentalPrice === 0)) {
        const priceStr = window.prompt(`Defina o preço de locação B2B para o kit "${item.name}" (R$):`, '150.00');
        if (priceStr === null) return;
        rentalPrice = parseFloat(priceStr) || 150.00;
      }

      const updatedKit = {
        ...item.rawKit,
        status: nextStatus,
        value: rentalPrice
      };

      try {
        await saveKit(updatedKit);
        mutateKits();
        addNotification(
          nextStatus === 'Público' ? 'Kit Publicado' : 'Kit Removido',
          `"${item.name}" foi ${nextStatus === 'Público' ? 'publicado no' : 'removido do'} Marketplace.`
        );
      } catch (err) {
        addNotification('Erro', 'Falha ao alterar status do kit.');
      }
    } else {
      let rentalPrice = item.rental_price;
      if (nextStatus === 'Público' && (!rentalPrice || rentalPrice === 0)) {
        const priceStr = window.prompt(`Defina o preço de locação B2B para "${item.name}" (R$):`, '50.00');
        if (priceStr === null) return;
        rentalPrice = parseFloat(priceStr) || 50.00;
      }

      const updatedItem = {
        id: item.id,
        decorator_id: item.decorator_id,
        name: item.name,
        description: item.description,
        image_url: item.image_url,
        status: nextStatus as 'Público' | 'Privado',
        stock_quantity: item.stock_quantity,
        rental_price: rentalPrice,
        internal_cost: item.internal_cost
      } as InventoryItem;

      try {
        await saveInventoryItem(updatedItem);
        mutateItems();
        addNotification(
          nextStatus === 'Público' ? 'Item Publicado' : 'Item Removido',
          `"${item.name}" foi ${nextStatus === 'Público' ? 'publicado no' : 'removido do'} Marketplace.`
        );
      } catch (err) {
        addNotification('Erro', 'Falha ao alterar status do item.');
      }
    }
  };

  // Remove Item from Marketplace (tornar privado)
  const handleRemoveItem = async (item: any) => {
    if (window.confirm(`Deseja remover "${item.name}" do Marketplace? O item continuará no seu inventário como Privado.`)) {
      if (item.isKit) {
        const updatedKit = {
          ...item.rawKit,
          status: 'Privado' as const
        };
        try {
          await saveKit(updatedKit);
          mutateKits();
          addNotification('Kit Removido do Marketplace', `"${item.name}" agora está como Privado.`);
        } catch (err) {
          addNotification('Erro', 'Falha ao remover kit do Marketplace.');
        }
      } else {
        const updatedItem = {
          id: item.id,
          decorator_id: item.decorator_id,
          name: item.name,
          description: item.description,
          image_url: item.image_url,
          status: 'Privado' as const,
          stock_quantity: item.stock_quantity,
          rental_price: item.rental_price,
          internal_cost: item.internal_cost
        } as InventoryItem;
        try {
          await saveInventoryItem(updatedItem);
          mutateItems();
          addNotification('Item Removido do Marketplace', `"${item.name}" agora está como Privado no seu inventário.`);
        } catch (err) {
          addNotification('Erro', 'Falha ao remover item do Marketplace.');
        }
      }
    }
  };

  // Edit Item Details Modal Handlers
  const handleOpenItemModal = (item: any) => {
    if (item.isKit) {
      setEditingKit(item.rawKit);
      setIsKitEditModalOpen(true);
    } else {
      setEditingItem(item);
      setIsItemModalOpen(true);
    }
  };

  const handleSaveItem = async () => {
    if (!decorator || !editingItem.name) return;
    
    const itemToSave = {
      ...editingItem,
      decorator_id: decorator.id,
    } as InventoryItem;

    try {
      await saveInventoryItem(itemToSave);
      mutateItems();
      setIsItemModalOpen(false);
      addNotification('Item Salvo', `O item "${editingItem.name}" foi salvo com sucesso.`);
    } catch (err) {
      addNotification('Erro', 'Falha ao salvar item.');
    }
  };

  const handleSaveEditedKit = async () => {
    if (!decorator || !editingKit.name) return;
    try {
      await saveKit(editingKit);
      mutateKits();
      setIsKitEditModalOpen(false);
      addNotification('Kit Salvo', `O kit "${editingKit.name}" foi salvo com sucesso.`);
    } catch (err) {
      addNotification('Erro', 'Falha ao salvar kit.');
    }
  };

  // Filter items for import list
  const unifiedImportItems = [
    ...(items || []).map(i => ({ ...i, isKit: false as const })),
    ...(kits || []).map(k => ({
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

  const filteredImportItems = unifiedImportItems.filter(item => 
    item.name.toLowerCase().includes(importSearch.toLowerCase()) ||
    (item.description || '').toLowerCase().includes(importSearch.toLowerCase())
  );

  return (
    <div>
      {/* Hidden File Inputs */}
      <input 
        type="file" 
        ref={coverInputRef} 
        style={{ display: 'none' }} 
        accept="image/*" 
        onChange={handleCoverChange} 
      />
      <input 
        type="file" 
        ref={avatarInputRef} 
        style={{ display: 'none' }} 
        accept="image/*" 
        onChange={handleAvatarChange} 
      />

      <div className="mypage-cover" onClick={() => coverInputRef.current?.click()}>
        {decorator?.cover_url ? (
          <img src={decorator.cover_url} alt="Cover" />
        ) : (
          <div className="w-full h-full bg-slate-800" style={{ minHeight: '240px' }} />
        )}
        <div className="mypage-cover-overlay">
          <Camera className="w-8 h-8" />
          <span>Alterar foto de capa</span>
        </div>
      </div>

      <div className="mypage-profile-card">
        <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
          <img 
            src={decorator?.avatar_url || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&q=80'} 
            alt={decorator?.name} 
            className="mypage-profile-avatar" 
          />
          <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity border-4 border-transparent">
            <Camera className="w-6 h-6 text-white" />
          </div>
        </div>
        <div className="flex-1 mt-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="mypage-profile-name">{decorator?.name}</h1>
            <div className="flex items-center mt-2" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span className="flex items-center gap-1 text-sm text-slate-600" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <MapPin className="w-4 h-4"/> {decorator?.location || 'Não informado'}
              </span>
              <Badge variant="success">{decorator?.membership_level || 'Membro'}</Badge>
            </div>
          </div>
          <div className="flex gap-2" style={{ marginTop: '8px' }}>
            <Button variant="secondary" icon={Pencil} onClick={handleOpenEditProfile}>
              Editar Perfil
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="mypage-stats-row">
          <div className="mypage-stat-card">
            <span className="mypage-stat-label">Itens Publicados</span>
            <span className="mypage-stat-value">{unifiedPublicItems.length}</span>
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

        <div className="mypage-contact-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div className="mypage-contact-card">
            <div className="contact-icon bg-pink-100 text-pink-600"><AtSign className="w-6 h-6"/></div>
            <div>
              <span className="contact-label">Instagram</span>
              <span className="contact-value">{decorator?.instagram || 'Não informado'}</span>
            </div>
          </div>
          <div className="mypage-contact-card">
            <div className="contact-icon bg-green-100 text-green-600"><Phone className="w-6 h-6"/></div>
            <div>
              <span className="contact-label">WhatsApp</span>
              <span className="contact-value">{decorator?.whatsapp || 'Não informado'}</span>
            </div>
          </div>
        </div>

        <div className="mypage-contact-card" style={{ display: 'flex', width: '100%', marginBottom: '24px', gap: '16px', alignItems: 'flex-start' }}>
          <div className="contact-icon" style={{ flexShrink: 0 }}><Info className="w-6 h-6"/></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="contact-label" style={{ display: 'block', marginBottom: '4px' }}>Sobre</span>
            <p 
              className="contact-value" 
              style={{ 
                margin: 0, 
                fontSize: '13.5px', 
                color: 'var(--text-secondary)', 
                lineHeight: '1.6', 
                wordBreak: 'break-word', 
                whiteSpace: 'pre-wrap',
                display: isAboutExpanded ? 'block' : '-webkit-box',
                WebkitLineClamp: isAboutExpanded ? 'none' : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                transition: 'all 0.3s ease'
              }}
            >
              {decorator?.about || 'Nenhuma informação.'}
            </p>
            {isAboutLong && (
              <button
                type="button"
                onClick={() => setIsAboutExpanded(!isAboutExpanded)}
                className="text-indigo-600 hover:text-indigo-800 font-bold text-xs mt-2 focus:outline-none transition-colors"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {isAboutExpanded ? 'Mostrar menos' : 'Ler mais'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-12">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
            {/* Lado Esquerdo (Título e Badge) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Store className="w-6 h-6" style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>Meus Itens no Marketplace</h2>
              <span style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                {unifiedPublicItems.length} {unifiedPublicItems.length === 1 ? 'visível' : 'visíveis'}
              </span>
            </div>

            {/* Lado Direito (Botões de Ação) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Botão com formato de toggle/switch vazio */}
              <button 
                type="button"
                className="btn-icon"
                style={{ width: '38px', height: '38px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Alternar Visualização"
              >
                <ToggleLeft className="w-5 h-5" style={{ color: 'var(--text-light)' }} />
              </button>

              {/* Botão com ícone de lista */}
              <button 
                type="button"
                className="btn-icon"
                style={{ width: '38px', height: '38px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Visualizar como Lista"
              >
                <List className="w-5 h-5" style={{ color: 'var(--text-light)' }} />
              </button>

              {/* Botão Principal */}
              <Button 
                icon={Plus} 
                onClick={() => setIsImportModalOpen(true)}
              >
                Adicionar Item
              </Button>
            </div>
          </div>
          <div className="cards-grid">
            {unifiedPublicItems.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed rounded-lg">
                Nenhum item publicado. Clique em "Adicionar Item" para publicar seus itens no Marketplace.
              </div>
            ) : (
              unifiedPublicItems.map(item => (
                <div key={item.id} className={`inventory-card ${item.isKit ? 'kit-border' : ''}`}>
                  <div className="card-img-wrapper" style={{ position: 'relative' }}>
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                        {item.isKit ? <List className="w-8 h-8" /> : <Store className="w-8 h-8" />}
                      </div>
                    )}
                    <span className="mypage-card-status confirmed absolute top-2 right-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">Publicado</span>
                    {item.isKit && (
                      <span className="absolute top-2 left-2 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">Kit</span>
                    )}
                  </div>
                  <div className="card-body flex flex-col justify-between h-[180px]">
                    <div>
                      <h3 className="card-title text-base font-bold line-clamp-1">{item.name}</h3>
                      <p className="card-desc text-xs text-slate-500 line-clamp-2 mt-1">{item.description || 'Sem descrição.'}</p>
                    </div>
                    <div>
                      <div className="card-stats flex justify-between mt-4">
                        <div>
                          <span className="stat-label block text-[10px] text-slate-400 font-semibold uppercase">
                            {item.isKit ? 'Itens do Kit' : 'Estoque'}
                          </span>
                          <span className="stat-val font-bold text-sm">
                            {item.isKit ? `${item.rawKit.items.length} un` : `${item.stock_quantity} un`}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="stat-label block text-[10px] text-slate-400 font-semibold uppercase">Locação B2B</span>
                          <span className="stat-val text-indigo-600 font-bold text-sm">{formatCurrency(item.rental_price)}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="flex-1" 
                          icon={Pencil}
                          onClick={() => handleOpenItemModal(item)}
                        >
                          Editar
                        </Button>
                        <Button 
                          variant="danger" 
                          size="sm" 
                          icon={EyeOff}
                          onClick={() => handleRemoveItem(item)}
                          title="Remover do Marketplace"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <Modal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        title="Editar Perfil da Decoradora"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditProfileOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProfile}>
              Salvar Alterações
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Instagram"
            value={editProfileForm.instagram}
            onChange={(e) => setEditProfileForm({ ...editProfileForm, instagram: e.target.value })}
            placeholder="@seu.perfil"
            icon={AtSign}
          />
          <Input
            label="WhatsApp"
            value={editProfileForm.whatsapp}
            onChange={(e) => setEditProfileForm({ ...editProfileForm, whatsapp: e.target.value })}
            placeholder="(11) 99999-9999"
            icon={Smartphone}
          />
          <Input
            label="Telefone Secundário"
            value={editProfileForm.phone}
            onChange={(e) => setEditProfileForm({ ...editProfileForm, phone: e.target.value })}
            placeholder="(11) 5555-5555"
            icon={Phone}
          />
          <Input
            label="Localização"
            value={editProfileForm.location}
            onChange={(e) => setEditProfileForm({ ...editProfileForm, location: e.target.value })}
            placeholder="Cidade - Estado"
            icon={MapPin}
          />
          <div className="form-group">
            <label className="form-label">Sobre a Empresa / Descrição</label>
            <textarea
              className="form-input"
              rows={4}
              value={editProfileForm.about}
              onChange={(e) => setEditProfileForm({ ...editProfileForm, about: e.target.value })}
              placeholder="Fale um pouco sobre a sua empresa de decoração..."
            />
          </div>
        </div>
      </Modal>

      {/* Import Inventory Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title={
          <div className="flex items-center gap-2.5">
            <Download className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-lg text-slate-900">Importar do Inventário</span>
          </div>
        }
        className="max-w-3xl w-full"
        footer={
          <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>
            Fechar
          </Button>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-500 font-normal leading-relaxed -mt-2">
            Selecione os itens do seu inventário que deseja publicar no Marketplace. Ao importar, o item ficará visível para outras decoradoras alugarem.
          </p>

          <Input
            icon={Search}
            placeholder="Buscar item no inventário..."
            value={importSearch}
            onChange={(e) => setImportSearch(e.target.value)}
            className="w-full focus:border-indigo-600 focus:ring-indigo-600/20"
          />

          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
            {filteredImportItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                Nenhum item encontrado no seu acervo.
              </div>
            ) : (
              filteredImportItems.map(item => {
                const isPublic = item.status === 'Público';
                return (
                  <div key={item.id} className="import-inv-item bg-white border border-slate-100 rounded-lg hover:border-slate-200 transition">
                    {item.image_url ? (
                      <img 
                        className="import-inv-img" 
                        src={item.image_url} 
                        alt={item.name} 
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                        {item.isKit ? <List className="w-5 h-5" /> : <Store className="w-5 h-5" />}
                      </div>
                    )}
                    <div className="import-inv-info">
                      <div className="flex items-center gap-2">
                        <span className="import-inv-name">{item.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${item.isKit ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                          {item.isKit ? 'Kit' : 'Peça'}
                        </span>
                      </div>
                      <span className="import-inv-meta block mt-0.5">
                        {item.isKit ? 'Itens do kit' : `Estoque: ${item.stock_quantity} un`} • {formatCurrency(item.rental_price)}/locação
                      </span>
                      <div className="mt-1">
                        <span className={`import-inv-status ${isPublic ? 'public' : 'private'}`}>
                          {isPublic ? (
                            <>
                              <Eye className="w-3.5 h-3.5 inline mr-1" />
                              Publicado
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 inline mr-1" />
                              Privado
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                    
                    {/* Database Update Action Button */}
                    <button
                      className={`import-inv-btn ${isPublic ? 'unpublish' : 'publish'}`}
                      style={isPublic ? { border: '1px solid var(--danger)', backgroundColor: 'transparent' } : undefined}
                      onClick={() => handleTogglePublish(item)}
                    >
                      {isPublic ? (
                        <span className="flex items-center gap-1">
                          <EyeOff className="w-3.5 h-3.5" />
                          Despublicar
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          Publicar
                        </span>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* Edit Piece Modal */}
      <Modal 
        isOpen={isItemModalOpen} 
        onClose={() => setIsItemModalOpen(false)} 
        title={editingItem.id ? 'Editar Peça' : 'Nova Peça'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsItemModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveItem}>Salvar Peça</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input 
            label="Nome da Peça" 
            value={editingItem.name || ''} 
            onChange={e => setEditingItem({...editingItem, name: e.target.value})} 
          />
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea 
              className="form-input" 
              rows={3}
              value={editingItem.description || ''} 
              onChange={e => setEditingItem({...editingItem, description: e.target.value})} 
            />
          </div>
          <Input 
            label="URL da Imagem" 
            value={editingItem.image_url || ''} 
            onChange={e => setEditingItem({...editingItem, image_url: e.target.value})} 
            placeholder="https://..."
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Status no Marketplace</label>
              <select 
                className="form-input"
                value={editingItem.status || 'Privado'}
                onChange={e => setEditingItem({...editingItem, status: e.target.value as 'Público' | 'Privado'})}
              >
                <option value="Privado">Privado (Apenas eu)</option>
                <option value="Público">Público (Visível B2B)</option>
              </select>
            </div>
            <Input 
              type="number"
              label="Qtd em Estoque" 
              value={editingItem.stock_quantity || ''} 
              onChange={e => setEditingItem({...editingItem, stock_quantity: Number(e.target.value)})} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              type="number"
              step="0.01"
              label="Preço Locação B2B (R$)" 
              value={editingItem.rental_price || ''} 
              onChange={e => setEditingItem({...editingItem, rental_price: Number(e.target.value)})} 
            />
            <Input 
              type="number"
              step="0.01"
              label="Custo Interno (R$)" 
              value={editingItem.internal_cost || ''} 
              onChange={e => setEditingItem({...editingItem, internal_cost: Number(e.target.value)})} 
            />
          </div>
        </div>
      </Modal>

      {/* Edit Kit Modal */}
      <Modal 
        isOpen={isKitEditModalOpen} 
        onClose={() => setIsKitEditModalOpen(false)} 
        title="Editar Kit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsKitEditModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEditedKit}>Salvar Kit</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input 
            label="Nome do Kit" 
            value={editingKit.name || ''} 
            onChange={e => setEditingKit({...editingKit, name: e.target.value})} 
          />
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea 
              className="form-input" 
              rows={3}
              value={editingKit.description || ''} 
              onChange={e => setEditingKit({...editingKit, description: e.target.value})} 
            />
          </div>
          <Input 
            label="URL da Imagem" 
            value={editingKit.image_url || ''} 
            onChange={e => setEditingKit({...editingKit, image_url: e.target.value})} 
            placeholder="https://..."
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Status no Marketplace</label>
              <select 
                className="form-input"
                value={editingKit.status || 'Privado'}
                onChange={e => setEditingKit({...editingKit, status: e.target.value as 'Público' | 'Privado'})}
              >
                <option value="Privado">Privado (Apenas eu)</option>
                <option value="Público">Público (Visível B2B)</option>
              </select>
            </div>
            <Input 
              type="number"
              step="0.01"
              label="Preço Locação B2B (R$)" 
              value={editingKit.value || ''} 
              onChange={e => setEditingKit({...editingKit, value: Number(e.target.value)})} 
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
