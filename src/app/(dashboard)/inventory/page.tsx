'use client';

import { useState, useEffect } from 'react';
import { 
  Plus, Search, SlidersHorizontal, Package, LayoutGrid, 
  DollarSign, TrendingUp, Pencil, Trash2, ImageIcon, Minus, X, ShoppingCart
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePartyFormStore } from '@/stores/party-form-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInventory, useKits } from '@/hooks/swr-hooks';
import { 
  saveInventoryItem, deleteInventoryItem, deleteKit, saveKit 
} from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency, getPlaceholderImage } from '@/lib/utils';
import type { InventoryItem, Kit } from '@/types';

export default function InventoryPage() {
  const router = useRouter();
  const { addItem: addPartyFormItem, clear: clearPartyForm } = usePartyFormStore();
  const { decorator } = useAuthStore();
  const { addNotification } = useNotificationStore();
  
  const [activeTab, setActiveTab] = useState('items');
  const { items, isLoading: isItemsLoading, mutate: mutateItems } = useInventory(decorator?.id);
  const { kits, isLoading: isKitsLoading, mutate: mutateKits } = useKits(decorator?.id);
  
  const [searchQuery, setSearchQuery] = useState('');
  const isLoading = isItemsLoading || isKitsLoading;

  // Edit Item Modal (Standard Piece)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem>>({});

  // Create Kit Modal
  const [isKitModalOpen, setIsKitModalOpen] = useState(false);
  const [kitName, setKitName] = useState('');
  const [kitDescription, setKitDescription] = useState('');
  const [kitValue, setKitValue] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [linkedItems, setLinkedItems] = useState<{ id: string; name: string; quantity: number; image_url?: string }[]>([]);
  const [kitSearchQuery, setKitSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [editingKitId, setEditingKitId] = useState<string | null>(null);

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredKits = kits.filter(k => k.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Item Modal Handlers
  const handleOpenItemModal = (item?: InventoryItem) => {
    setEditingItem(item || { status: 'Privado', stock_quantity: 1, rental_price: 0, internal_cost: 0 });
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!decorator || !editingItem.name) return;
    
    const itemToSave = {
      ...editingItem,
      decorator_id: decorator.id,
    } as InventoryItem;

    await saveInventoryItem(itemToSave);
    addNotification('Item Salvo', `A peça "${itemToSave.name}" foi salva com sucesso.`);
    setIsItemModalOpen(false);
    mutateItems();
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir "${name}"?`)) {
      await deleteInventoryItem(id);
      addNotification('Item Excluído', `A peça "${name}" foi removida do acervo.`, true);
      mutateItems();
    }
  };

  const handleDeleteKit = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir o kit "${name}"?`)) {
      await deleteKit(id);
      addNotification('Kit Excluído', `O kit "${name}" foi removido.`, true);
      mutateKits();
    }
  };

  // Kit Modal Actions
  const handleOpenKitModal = () => {
    setKitName('');
    setKitDescription('');
    setKitValue('');
    setCoverImageUrl('');
    setLinkedItems([]);
    setKitSearchQuery('');
    setEditingKitId(null);
    setIsKitModalOpen(true);
  };

  const handleOpenEditKitModal = (kit: Kit) => {
    setKitName(kit.name);
    setKitDescription(kit.description || '');
    setKitValue(kit.value !== null && kit.value !== undefined ? kit.value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }) : '');
    setCoverImageUrl(kit.image_url);
    
    const mappedItems = kit.items.map(ki => {
      const match = items.find(i => i.id === ki.id);
      return {
        id: ki.id,
        name: ki.name,
        quantity: ki.quantity,
        image_url: match?.image_url
      };
    });
    setLinkedItems(mappedItems);
    
    setKitSearchQuery('');
    setEditingKitId(kit.id);
    setIsKitModalOpen(true);
  };

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLinkKitItem = (item: { id: string; name: string; quantity: number; image_url?: string }) => {
    const exists = linkedItems.find(i => i.id === item.id);
    if (exists) {
      setLinkedItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setLinkedItems(prev => [...prev, { id: item.id, name: item.name, quantity: item.quantity, image_url: item.image_url }]);
    }
  };

  const handleUnlinkKitItem = (id: string) => {
    setLinkedItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateKitItemQuantity = (id: string, qty: number) => {
    setLinkedItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty) } : i));
  };

  const handleKitValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const digits = rawValue.replace(/\D/g, '');
    if (!digits) {
      setKitValue('');
      return;
    }
    const centavos = Number(digits) / 100;
    const formatted = centavos.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    setKitValue(formatted);
  };

  const handleCreateKitInventoryItem = async () => {
    if (!kitSearchQuery.trim() || !decorator) return;
    const name = kitSearchQuery.trim();
    const newItem: InventoryItem = {
      id: '',
      decorator_id: decorator.id,
      name: name,
      description: 'Peça avulsa criada via kit',
      image_url: getPlaceholderImage(name),
      status: 'Privado',
      stock_quantity: 10,
      rental_price: 25.0,
      internal_cost: 10.0
    };
    const saved = await saveInventoryItem(newItem);
    await mutateItems();
    handleLinkKitItem({ id: saved.id, name: saved.name, quantity: 1, image_url: saved.image_url });
    setKitSearchQuery('');
    addNotification('Item Criado', `A peça "${saved.name}" foi salva e vinculada ao kit.`);
  };

  const handleSaveKit = async () => {
    if (!decorator) return;
    if (!kitName.trim()) {
      alert('O Nome da Decoração é obrigatório.');
      return;
    }

    const parsedValue = kitValue.trim() !== '' 
      ? Number(kitValue.replace(/\D/g, '')) / 100 
      : null;

    const kitData: Partial<Kit> = {
      id: editingKitId || undefined,
      decorator_id: decorator.id,
      name: kitName.trim(),
      description: kitDescription.trim(),
      image_url: coverImageUrl || 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400',
      value: parsedValue,
      items: linkedItems.map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity
      }))
    };

    await saveKit(kitData);
    addNotification('Kit Salvo', `O kit "${kitData.name}" foi registrado com sucesso.`);
    
    setIsKitModalOpen(false);
    setActiveTab('kits');
    mutateKits();
  };

  const handleAddKitToForm = (kit: Kit) => {
    clearPartyForm();
    kit.items.forEach(ki => {
      const match = items.find(i => i.id === ki.id);
      if (match) {
        addPartyFormItem(match, ki.quantity);
      }
    });
    addNotification('Kit Importado', `As peças do kit "${kit.name}" foram enviadas para o formulário.`);
    router.push('/party-form');
  };

  const kitSearchResults = kitSearchQuery.trim() === ''
    ? []
    : items.filter(item => item.name.toLowerCase().includes(kitSearchQuery.toLowerCase()));

  // Calculate stats
  const totalItems = items.reduce((sum, item) => sum + item.stock_quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + (item.rental_price * item.stock_quantity), 0);

  if (isLoading) {
    return (
      <div className="acervo-loading">
        <div className="acervo-loading-spinner" />
        <p>Carregando acervo...</p>
      </div>
    );
  }

  return (
    <div className="acervo-page">
      {/* ===== HEADER ===== */}
      <div className="acervo-header">
        <div>
          <h1 className="acervo-title">Meu Acervo</h1>
          <p className="acervo-subtitle">
            Gerencie suas peças e kits de decoração disponíveis para locação.
          </p>
        </div>
        <Button icon={Plus} onClick={handleOpenKitModal}>
          Nova Peça
        </Button>
      </div>

      {/* ===== STATS CARDS ===== */}
      <div className="acervo-stats-grid">
        <div className="acervo-stat-card">
          <div className="acervo-stat-header">
            <span className="acervo-stat-label">Total de Peças</span>
            <div className="acervo-stat-icon indigo">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="acervo-stat-body">
            <span className="acervo-stat-value">{totalItems}</span>
            <span className="acervo-stat-trend up">
              <TrendingUp className="w-3.5 h-3.5" />
              +4%
            </span>
          </div>
        </div>

        <div className="acervo-stat-card">
          <div className="acervo-stat-header">
            <span className="acervo-stat-label">Kits Ativos</span>
            <div className="acervo-stat-icon violet">
              <LayoutGrid className="w-4 h-4" />
            </div>
          </div>
          <div className="acervo-stat-body">
            <span className="acervo-stat-value">{kits.length}</span>
            <span className="acervo-stat-trend neutral">Estável</span>
          </div>
        </div>

        <div className="acervo-stat-card">
          <div className="acervo-stat-header">
            <span className="acervo-stat-label">Valor Estimado</span>
            <div className="acervo-stat-icon emerald">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="acervo-stat-body">
            <span className="acervo-stat-value">{formatCurrency(totalValue)}</span>
          </div>
        </div>
      </div>

      {/* ===== CONTROLS (Tabs + Search) ===== */}
      <div className="acervo-controls">
        <div className="acervo-segmented-control">
          <button 
            className={`acervo-segment ${activeTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            Peças Avulsas ({items.length})
          </button>
          <button 
            className={`acervo-segment ${activeTab === 'kits' ? 'active' : ''}`}
            onClick={() => setActiveTab('kits')}
          >
            Kits Prontos ({kits.length})
          </button>
        </div>

        <div className="acervo-search-area">
          <div className="acervo-search-input">
            <Search className="w-4 h-4" />
            <input 
              type="search"
              placeholder="Buscar no acervo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="acervo-filter-btn" title="Filtros">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ===== PRODUCT GRID ===== */}
      {activeTab === 'items' && (
        <div className="acervo-product-grid">
          {filteredItems.length === 0 ? (
            <div className="acervo-empty-state">
              <Package className="w-12 h-12" />
              <h3>Nenhuma peça encontrada</h3>
              <p>Adicione peças ao seu acervo para começar.</p>
              <Button icon={Plus} onClick={handleOpenKitModal}>
                Adicionar Peça
              </Button>
            </div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id} className="acervo-product-card">
                {/* Image area */}
                <div className="acervo-card-image">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} />
                  ) : (
                    <div className="acervo-card-placeholder">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  {/* Status tag */}
                  <div className={`acervo-card-tag ${item.status === 'Público' ? 'public' : 'private'}`}>
                    <span className={`acervo-tag-dot ${item.status === 'Público' ? 'public' : 'private'}`} />
                    {item.status}
                  </div>
                </div>
                
                {/* Content */}
                <div className="acervo-card-content">
                  <h3 className="acervo-card-title">{item.name}</h3>
                  <p className="acervo-card-desc">{item.description}</p>

                  {/* Metrics */}
                  <div className="acervo-card-metrics">
                    <div>
                      <span className="acervo-metric-label">ESTOQUE</span>
                      <span className="acervo-metric-value">{item.stock_quantity} un</span>
                    </div>
                    <div className="acervo-metric-right">
                      <span className="acervo-metric-label">LOCAÇÃO B2B</span>
                      <span className="acervo-metric-value acervo-price">{formatCurrency(item.rental_price)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="acervo-card-actions">
                    <button 
                      className="acervo-action-btn" 
                      onClick={() => handleOpenItemModal(item)}
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </button>
                    <button 
                      className="acervo-action-btn danger" 
                      onClick={() => handleDeleteItem(item.id, item.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'kits' && (
        <div className="acervo-product-grid">
          {filteredKits.length === 0 ? (
            <div className="acervo-empty-state">
              <LayoutGrid className="w-12 h-12" />
              <h3>Nenhum kit encontrado</h3>
              <p>Monte kits com suas peças para facilitar a locação.</p>
            </div>
          ) : (
            filteredKits.map(kit => (
              <div key={kit.id} className="acervo-product-card kit-border">
                <div className="acervo-card-image">
                  {kit.image_url ? (
                    <img src={kit.image_url} alt={kit.name} />
                  ) : (
                    <div className="acervo-card-placeholder">
                      <LayoutGrid className="w-8 h-8" />
                    </div>
                  )}
                  <div className="acervo-card-tag kit">
                    <span className="acervo-tag-dot kit" />
                    Kit Montado
                  </div>
                </div>
                <div className="acervo-card-content">
                  <h3 className="acervo-card-title">{kit.name}</h3>
                  <p className="acervo-card-desc">{kit.description}</p>
                  <div className="acervo-card-metrics">
                    <div>
                      <span className="acervo-metric-label">TOTAL DE PEÇAS</span>
                      <span className="acervo-metric-value">
                        {kit.items.reduce((sum, i) => sum + i.quantity, 0)} itens
                      </span>
                    </div>
                    {kit.value !== null && kit.value !== undefined && (
                      <div className="acervo-metric-right">
                        <span className="acervo-metric-label">VALOR DO KIT</span>
                        <span className="acervo-metric-value acervo-price">{formatCurrency(kit.value)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Adicionar ao Formulário Button */}
                  <button 
                    type="button"
                    onClick={() => handleAddKitToForm(kit)}
                    className="btn-primary"
                    style={{ width: '100%', marginTop: '14px', marginBottom: '8px', justifyContent: 'center', backgroundColor: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px' }}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Adicionar ao formulário
                  </button>

                  <div className="acervo-card-actions">
                    <button 
                      className="acervo-action-btn" 
                      onClick={() => handleOpenEditKitModal(kit)}
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </button>
                    <button 
                      className="acervo-action-btn danger" 
                      onClick={() => handleDeleteKit(kit.id, kit.name)}
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

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

      {/* Create Piece/Kit Modal */}
      <Modal
        isOpen={isKitModalOpen}
        onClose={() => setIsKitModalOpen(false)}
        title={editingKitId ? "Editar Kit" : "Criar Nova Peça/Kit"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsKitModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveKit}>Salvar Kit</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input 
            label="Nome da Decoração" 
            placeholder="Digite o nome..."
            value={kitName} 
            onChange={e => setKitName(e.target.value)} 
            required 
          />
          
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea 
              className="form-input" 
              placeholder="Descreva este kit..."
              rows={3}
              value={kitDescription} 
              onChange={e => setKitDescription(e.target.value)} 
            />
          </div>
          
          <Input 
            type="text" 
            label="Valor (opcional)" 
            placeholder="R$ 0,00"
            value={kitValue} 
            onChange={handleKitValueChange} 
          />

          {/* Cover Photo Drag and Drop area */}
          <div className="form-group">
            <label className="form-label">Foto de Capa</label>
            {coverImageUrl === '' ? (
              <div 
                className={`cover-upload-area ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  const fileInput = document.getElementById('kit-cover-file-input');
                  fileInput?.click();
                }}
              >
                <ImageIcon className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-semibold text-slate-500">Arraste uma foto ou clique para fazer upload</span>
                <input 
                  id="kit-cover-file-input"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleCoverImageUpload}
                />
              </div>
            ) : (
              <div className="cover-upload-preview">
                <img src={coverImageUrl} alt="Capa da Decoração" />
                <button 
                  type="button" 
                  className="cover-upload-change-btn"
                  onClick={() => {
                    const fileInput = document.getElementById('kit-cover-file-input');
                    fileInput?.click();
                  }}
                >
                  Alterar Foto
                </button>
                <input 
                  id="kit-cover-file-input"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleCoverImageUpload}
                />
              </div>
            )}
          </div>

          {/* Seção Itens do Kit */}
          <div className="border-t border-slate-100 pt-4">
            <label className="form-label font-bold text-slate-800" style={{ fontSize: '15px' }}>Itens do Kit</label>
            
            <div className="relative mb-3">
              <Search 
                style={{ width: '16px', height: '16px' }} 
                className="absolute-center-y left-3.5 text-slate-400" 
              />
              <input 
                placeholder="Buscar peça por nome..." 
                value={kitSearchQuery}
                onChange={e => setKitSearchQuery(e.target.value)}
                className="form-input pl-10"
              />
            </div>

            {/* Dynamic Green Create Button */}
            {kitSearchQuery.trim() !== '' && (
              <div>
                <button 
                  type="button" 
                  onClick={handleCreateKitInventoryItem}
                  className="btn-create-item"
                >
                  <Plus style={{ width: '14px', height: '14px', strokeWidth: 3 }} />
                  <span>Criar novo item: "{kitSearchQuery}"</span>
                </button>
              </div>
            )}

            {/* Search Results */}
            {kitSearchQuery.trim() !== '' && kitSearchResults.length > 0 && (
              <div className="border border-slate-100 rounded-xl max-h-[180px] overflow-y-auto mb-4 p-1 bg-white shadow-xs">
                {kitSearchResults.map(item => (
                  <div key={item.id} className="linked-item-row hover:bg-slate-50 transition-colors">
                    <div className="flex-row-center">
                      <img src={item.image_url} alt={item.name} className="search-result-thumbnail" />
                      <div>
                        <span className="text-sm font-bold text-slate-800 block leading-tight">{item.name}</span>
                        <span className="text-[11px] font-medium text-slate-400 block mt-1">
                          Estoque: {item.stock_quantity} un
                        </span>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleLinkKitItem({ id: item.id, name: item.name, quantity: 1, image_url: item.image_url })}
                      className="btn-kit-add"
                    >
                      + Adicionar
                    </button>
                  </div>
                ))}
              </div>
            )}

            {kitSearchQuery.trim() !== '' && kitSearchResults.length === 0 && (
              <div className="text-center py-2 text-slate-400 text-xs mb-4">
                Nenhum item encontrado. Use o BOTÃO acima para criar.
              </div>
            )}

            {/* Linked Items List */}
            <div className="mt-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50 min-h-[110px] flex flex-col">
              {linkedItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center py-6 text-center text-slate-400 text-sm font-medium">
                  Nenhum item adicionado ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedItems.map((item) => (
                    <div key={item.id} className="flex-row-between bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
                      <div className="flex-row-center">
                        <img 
                          src={item.image_url || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=150'} 
                          alt={item.name} 
                          className="checklist-item-thumbnail" 
                        />
                        <span className="text-sm font-bold text-slate-800 leading-tight">{item.name}</span>
                      </div>
                      <div className="flex-row-center">
                        <div className="stepper-container">
                          <button 
                            type="button"
                            onClick={() => handleUpdateKitItemQuantity(item.id, item.quantity - 1)}
                            className="stepper-btn"
                          >
                            -
                          </button>
                          <span className="stepper-val">{item.quantity}</span>
                          <button 
                            type="button"
                            onClick={() => handleUpdateKitItemQuantity(item.id, item.quantity + 1)}
                            className="stepper-btn"
                          >
                            +
                          </button>
                        </div>
                        <button 
                          type="button"
                          onClick={() => handleUnlinkKitItem(item.id)}
                          className="btn-remove-item"
                        >
                          <Trash2 style={{ width: '16px', height: '16px' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </Modal>
    </div>
  );
}
