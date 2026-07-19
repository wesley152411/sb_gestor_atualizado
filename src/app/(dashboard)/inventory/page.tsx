'use client';

import { useState, useEffect } from 'react';
import { 
  Plus, Search, SlidersHorizontal, Package, LayoutGrid, 
  DollarSign, TrendingUp, Pencil, Trash2, ImageIcon, Minus, X, ShoppingCart, Check, UploadCloud
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePartyFormStore } from '@/stores/party-form-store';
import { useAuthStore } from '@/stores/auth-store';
import { useInventory, useKits } from '@/hooks/swr-hooks';
import { 
  saveInventoryItem, deleteInventoryItem, deleteKit, saveKit, uploadImage 
} from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency } from '@/lib/utils';
import type { InventoryItem, Kit } from '@/types';

export default function InventoryPage() {
  const router = useRouter();
  const { items: partyFormItems, addItem: addPartyFormItem, clear: clearPartyForm } = usePartyFormStore();
  const { decorator } = useAuthStore();
  const { addNotification } = useNotificationStore();
  
  const [activeTab, setActiveTab] = useState<'items' | 'kits'>('items');
  const { items, isLoading: isItemsLoading, mutate: mutateItems } = useInventory(decorator?.id);
  const { kits, isLoading: isKitsLoading, mutate: mutateKits } = useKits(decorator?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(new Set());
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

  const getKitTotalPieces = (kit: Kit) => kit.items.reduce((sum, item) => sum + item.quantity, 0);

  const singlePieceKits = kits.filter(k => getKitTotalPieces(k) === 1);
  const multiPieceKits = kits.filter(k => getKitTotalPieces(k) > 1);

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSinglePieceKits = singlePieceKits.filter(k => k.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredMultiPieceKits = multiPieceKits.filter(k => k.name.toLowerCase().includes(searchQuery.toLowerCase()));

  useEffect(() => {
    const totalPieces = linkedItems.reduce((sum, i) => sum + i.quantity, 0);
    if (totalPieces === 1 && linkedItems.length === 1) {
      if (linkedItems[0].image_url !== coverImageUrl) {
        setLinkedItems(prev => prev.map((item, idx) => idx === 0 ? { ...item, image_url: coverImageUrl } : item));
      }
    }
  }, [coverImageUrl, linkedItems.length]);

  const handleOpenItemModal = (item?: InventoryItem) => {
    setEditingItem(item || { status: 'Privado', stock_quantity: 1, rental_price: 0, internal_cost: 0 });
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!decorator || !editingItem.name) return;
    const itemToSave = { ...editingItem, decorator_id: decorator.id } as InventoryItem;
    await saveInventoryItem(itemToSave);
    addNotification('Item Salvo', `A peça "${itemToSave.name}" foi salva com sucesso.`);
    setIsItemModalOpen(false);
    mutateItems();
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir "${name}"?`)) {
      await deleteInventoryItem(id);
      addNotification('Item Excluído', `A peça "${name}" foi removida.`, true);
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

  const handleOpenKitModal = () => {
    setKitName(''); setKitDescription(''); setKitValue(''); setCoverImageUrl('');
    setLinkedItems([]); setKitSearchQuery(''); setEditingKitId(null);
    setIsKitModalOpen(true);
  };

  const handleOpenEditKitModal = (kit: Kit) => {
    setKitName(kit.name);
    setKitDescription(kit.description || '');
    setKitValue(kit.value !== null && kit.value !== undefined ? formatCurrency(kit.value) : '');
    setCoverImageUrl(kit.image_url);
    const mappedItems = kit.items.map(ki => {
      const match = items.find(i => i.id === ki.id);
      return { id: ki.id, name: ki.name, quantity: ki.quantity, image_url: match?.image_url };
    });
    setLinkedItems(mappedItems);
    setKitSearchQuery('');
    setEditingKitId(kit.id);
    setIsKitModalOpen(true);
  };

  const processImageUpload = async (file: File): Promise<string> => {
    if (!decorator) return '';
    const path = `${decorator.id}/${Date.now()}_${file.name}`;
    try {
      const url = await uploadImage(file, 'inventory', path);
      if (url) return url;
    } catch (err) {
      console.warn('Storage upload failed, falling back to base64', err);
    }
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCoverImageUrl(await processImageUpload(file));
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) setCoverImageUrl(await processImageUpload(file));
  };

  const handleItemImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = await processImageUpload(file);
      setEditingItem(prev => ({ ...prev, image_url: imageUrl }));
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

  const handleUnlinkKitItem = (id: string) => setLinkedItems(prev => prev.filter(i => i.id !== id));
  const handleUpdateKitItemQuantity = (id: string, qty: number) => setLinkedItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, qty) } : i));

  const handleKitValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const digits = rawValue.replace(/\D/g, '');
    if (!digits) { setKitValue(''); return; }
    const centavos = Number(digits) / 100;
    setKitValue(formatCurrency(centavos));
  };

  const handleCreateKitInventoryItem = async () => {
    if (!kitSearchQuery.trim() || !decorator) return;
    const newItem: InventoryItem = {
      id: '', decorator_id: decorator.id, name: kitSearchQuery.trim(), description: 'Peça avulsa criada via kit',
      image_url: coverImageUrl || '', status: 'Privado', stock_quantity: 10, rental_price: 25.0, internal_cost: 10.0
    };
    const saved = await saveInventoryItem(newItem);
    await mutateItems();
    handleLinkKitItem({ id: saved.id, name: saved.name, quantity: 1, image_url: saved.image_url });
    setKitSearchQuery('');
    addNotification('Item Criado', `A peça "${saved.name}" foi salva e vinculada ao kit.`);
  };

  const handleSaveKit = async () => {
    if (!decorator) return;
    if (!kitName.trim()) { alert('O Nome da Decoração é obrigatório.'); return; }
    const parsedValue = kitValue.trim() !== '' ? Number(kitValue.replace(/\D/g, '')) / 100 : null;
    
    const kitData: Partial<Kit> = {
      id: editingKitId || undefined, decorator_id: decorator.id, name: kitName.trim(), description: kitDescription.trim(),
      image_url: coverImageUrl || '', value: parsedValue, items: linkedItems.map(i => ({ id: i.id, name: i.name, quantity: i.quantity }))
    };

    const totalPieces = linkedItems.reduce((sum, i) => sum + i.quantity, 0);
    if (totalPieces === 1 && linkedItems.length === 1) {
      const singleItem = linkedItems[0];
      const originalItem = items.find(i => i.id === singleItem.id);
      if (originalItem && originalItem.image_url !== coverImageUrl) {
        await saveInventoryItem({ ...originalItem, image_url: coverImageUrl });
        mutateItems();
      }
    }

    await saveKit(kitData);
    addNotification('Kit Salvo', `O kit "${kitData.name}" foi registrado.`);
    setIsKitModalOpen(false);
    setActiveTab('kits');
    mutateKits();
  };

  const handleAddKitToForm = (kit: Kit) => {
    clearPartyForm();
    kit.items.forEach(ki => {
      const match = items.find(i => i.id === ki.id);
      if (match) addPartyFormItem(match, ki.quantity);
    });
    addNotification('Kit Importado', `As peças do kit "${kit.name}" foram enviadas para o formulário.`);
    router.push('/party-form');
  };

  // Peças Avulsas: quantidade já presente no formulário em andamento para uma peça
  const getPartyFormQty = (itemId: string) => partyFormItems.find(p => p.item.id === itemId)?.quantity || 0;

  const handleAddItemToForm = (item: InventoryItem) => {
    const currentQty = getPartyFormQty(item.id);
    if (currentQty + 1 > item.stock_quantity) {
      addNotification('Estoque Insuficiente', `Não há mais unidades disponíveis de "${item.name}" (estoque: ${item.stock_quantity} un).`, true);
      return;
    }
    addPartyFormItem(item, 1);
    addNotification('Peça Adicionada', `"${item.name}" foi adicionada ao formulário em andamento.`);
    setAddedItemIds(prev => new Set(prev).add(item.id));
    setTimeout(() => {
      setAddedItemIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 2000);
  };

  const kitSearchResults = kitSearchQuery.trim() === '' ? [] : items.filter(item => item.name.toLowerCase().includes(kitSearchQuery.toLowerCase()));
  const totalItemsCount = items.reduce((sum, item) => sum + item.stock_quantity, 0);
  const totalValue = items.reduce((sum, item) => sum + (item.rental_price * item.stock_quantity), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Carregando acervo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Meu Acervo</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie suas peças e kits de decoração disponíveis para locação.</p>
        </div>
        <Button onClick={handleOpenKitModal}>
          <Plus className="w-4 h-4" />
          Nova Peça
        </Button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start justify-between hover:-translate-y-0.5 transition-all">
          <div>
            <span className="text-sm font-medium text-slate-500">Total de Peças</span>
            <div className="text-2xl font-extrabold text-slate-800 mt-1">{totalItemsCount}</div>
            <div className="flex items-center gap-1 mt-1 text-xs font-semibold text-emerald-600">
              <TrendingUp className="w-3.5 h-3.5" /> <span>+4%</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
            <Package className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start justify-between hover:-translate-y-0.5 transition-all">
          <div>
            <span className="text-sm font-medium text-slate-500">Kits Ativos</span>
            <div className="text-2xl font-extrabold text-slate-800 mt-1">{multiPieceKits.length}</div>
            <span className="text-xs font-semibold text-slate-400 mt-1">Estável</span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <LayoutGrid className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start justify-between hover:-translate-y-0.5 transition-all">
          <div>
            <span className="text-sm font-medium text-slate-500">Valor Estimado</span>
            <div className="text-2xl font-extrabold text-brand-600 mt-1">{formatCurrency(totalValue)}</div>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'items' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
            onClick={() => setActiveTab('items')}
          >
            Peças Avulsas ({items.length + singlePieceKits.length})
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'kits' ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
            onClick={() => setActiveTab('kits')}
          >
            Kits Prontos ({multiPieceKits.length})
          </button>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar no acervo..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all outline-none"
            />
          </div>
          <button className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid de Peças Avulsas */}
      {activeTab === 'items' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.length === 0 && filteredSinglePieceKits.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-base font-bold text-slate-700 mb-1">Nenhuma peça encontrada</h3>
              <p className="text-sm text-slate-500 mb-6">Adicione peças ao seu acervo para começar.</p>
              <Button onClick={handleOpenKitModal}>
                <Plus className="w-4 h-4" /> Adicionar Peça
              </Button>
            </div>
          ) : (
            <>
              {filteredItems.map(item => (
                <div key={item.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all flex flex-col">
                  <div className="relative aspect-[4/3] rounded-t-2xl overflow-hidden bg-slate-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon className="w-8 h-8" /></div>
                    )}
                    <Badge variant={item.status === 'Público' ? 'success' : 'neutral'} className="absolute top-3 left-3">
                      {item.status}
                    </Badge>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">{item.name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-4">{item.description}</p>
                    
                    <div className="mt-auto flex justify-between items-end pb-4 border-b border-slate-50 mb-4">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Estoque</span>
                        <span className="text-sm font-semibold text-slate-700">{item.stock_quantity} un</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Locação</span>
                        <span className="text-sm font-extrabold text-brand-600">{formatCurrency(item.rental_price)}</span>
                      </div>
                    </div>
                    
                    {/* Adicionar ao Formulário Button */}
                    <button
                      type="button"
                      onClick={() => handleAddItemToForm(item)}
                      disabled={getPartyFormQty(item.id) >= item.stock_quantity}
                      className="btn-primary"
                      style={{
                        width: '100%', marginTop: '14px', marginBottom: '8px', justifyContent: 'center',
                        backgroundColor: addedItemIds.has(item.id) ? '#16a34a' : '#2563eb',
                        display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px',
                        opacity: getPartyFormQty(item.id) >= item.stock_quantity ? 0.5 : 1,
                        cursor: getPartyFormQty(item.id) >= item.stock_quantity ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {addedItemIds.has(item.id) ? (
                        <>
                          <Check className="w-4 h-4" />
                          Adicionado ✓
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          Adicionar ao formulário
                        </>
                      )}
                    </button>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleOpenItemModal(item)}>
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteItem(item.id, item.name)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredSinglePieceKits.map(kit => (
                <div key={kit.id} className="group bg-white rounded-2xl border border-brand-200 shadow-sm shadow-brand-500/5 hover:shadow-lg transition-all flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-brand-500 to-transparent opacity-20 pointer-events-none rounded-bl-3xl" />
                  <div className="relative aspect-[4/3] rounded-t-2xl overflow-hidden bg-slate-100">
                    {kit.image_url ? (
                      <img src={kit.image_url} alt={kit.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300"><LayoutGrid className="w-8 h-8" /></div>
                    )}
                    <Badge variant="indigo" className="absolute top-3 left-3 shadow-sm">
                      Peça Avulsa
                    </Badge>
                  </div>
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">{kit.name}</h3>
                    <p className="text-xs text-slate-500 line-clamp-2 mb-4">{kit.description}</p>
                    
                    <div className="mt-auto flex justify-between items-end pb-4 border-b border-slate-50 mb-4">
                      <div>
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Itens</span>
                        <span className="text-sm font-semibold text-slate-700">{kit.items.reduce((sum, i) => sum + i.quantity, 0)} un</span>
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Valor Total</span>
                        <span className="text-sm font-extrabold text-brand-600">{formatCurrency(kit.value || 0)}</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <Button size="sm" className="w-full" onClick={() => handleAddKitToForm(kit)}>
                        <ShoppingCart className="w-3.5 h-3.5" /> Add Form
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleOpenEditKitModal(kit)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteKit(kit.id, kit.name)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Grid de Kits Prontos */}
      {activeTab === 'kits' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMultiPieceKits.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 border-dashed">
              <LayoutGrid className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-base font-bold text-slate-700 mb-1">Nenhum kit encontrado</h3>
              <p className="text-sm text-slate-500 mb-6">Monte kits com suas peças para facilitar a locação.</p>
            </div>
          ) : (
            filteredMultiPieceKits.map(kit => (
              <div key={kit.id} className="group bg-white rounded-2xl border border-brand-200 shadow-sm shadow-brand-500/5 hover:shadow-lg transition-all flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-brand-500 to-transparent opacity-20 pointer-events-none rounded-bl-3xl" />
                <div className="relative aspect-[4/3] rounded-t-2xl overflow-hidden bg-slate-100">
                  {kit.image_url ? (
                    <img src={kit.image_url} alt={kit.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><LayoutGrid className="w-8 h-8" /></div>
                  )}
                  <Badge variant="indigo" className="absolute top-3 left-3 shadow-sm">
                    Kit Montado
                  </Badge>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1">{kit.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4">{kit.description}</p>
                  
                  <div className="mt-auto flex justify-between items-end pb-4 border-b border-slate-50 mb-4">
                    <div>
                      <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total Peças</span>
                      <span className="text-sm font-semibold text-slate-700">{kit.items.reduce((sum, i) => sum + i.quantity, 0)} itens</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Valor do Kit</span>
                      <span className="text-sm font-extrabold text-brand-600">{formatCurrency(kit.value || 0)}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Button size="sm" className="w-full" onClick={() => handleAddKitToForm(kit)}>
                      <ShoppingCart className="w-3.5 h-3.5" /> Adicionar ao formulário
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleOpenEditKitModal(kit)}>
                        <Pencil className="w-3.5 h-3.5" /> Editar Kit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDeleteKit(kit.id, kit.name)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL: Nova Peça / Kit */}
      <Modal isOpen={isKitModalOpen} onClose={() => setIsKitModalOpen(false)} title={editingKitId ? "Editar Peça/Kit" : "Nova Peça / Montar Kit"} maxWidth="max-w-4xl">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Upload de Foto */}
          <div className="w-full md:w-1/3 flex flex-col gap-3">
            <h4 className="text-sm font-bold text-slate-700">Foto da Peça/Kit</h4>
            <label 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full aspect-[4/3] rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden bg-slate-50
                ${isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-400 hover:bg-slate-100'}
                ${coverImageUrl ? 'p-0 border-none' : 'p-6'}
              `}
            >
              {coverImageUrl ? (
                <div className="relative w-full h-full group">
                  <img src={coverImageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">Trocar Imagem</span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-slate-500">
                  <UploadCloud className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-xs font-semibold">Arraste ou clique</p>
                  <p className="text-[10px] mt-1 text-slate-400">JPG, PNG até 2MB</p>
                </div>
              )}
              <input type="file" className="hidden" accept="image/*" onChange={handleCoverImageUpload} />
            </label>
            <div className="space-y-4 mt-2">
              <Input label="Nome da Peça/Decoração *" value={kitName} onChange={e => setKitName(e.target.value)} placeholder="Ex: Cadeira Tiffany Dourada" />
              <Input label="Valor Sugerido de Locação" value={kitValue} onChange={handleKitValueChange} placeholder="R$ 0,00" />
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold text-slate-700">Descrição (Opcional)</label>
              <textarea 
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
                rows={2}
                value={kitDescription}
                onChange={e => setKitDescription(e.target.value)}
                placeholder="Detalhes, material, cor..."
              />
            </div>

            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
              <h4 className="text-sm font-bold text-slate-700 mb-3">Composição: Quais peças compõem este registro?</h4>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar peças no acervo para incluir..."
                  className="w-full pl-9 pr-24 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-brand-400 outline-none shadow-sm"
                  value={kitSearchQuery}
                  onChange={(e) => setKitSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateKitInventoryItem()}
                />
                {kitSearchQuery.trim() !== '' && kitSearchResults.length === 0 && (
                  <button 
                    className="absolute right-1.5 top-1.5 px-3 py-1 bg-brand-100 text-brand-700 text-xs font-semibold rounded-lg hover:bg-brand-200 transition-colors"
                    onClick={handleCreateKitInventoryItem}
                  >
                    Criar nova peça
                  </button>
                )}
              </div>

              {kitSearchResults.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm max-h-[160px] overflow-y-auto mb-4 p-1">
                  {kitSearchResults.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg group">
                      <div className="flex items-center gap-3">
                        <img src={item.image_url || ''} alt={item.name} className="w-8 h-8 rounded-md object-cover bg-slate-100" />
                        <div>
                          <p className="text-sm font-semibold text-slate-700 truncate max-w-[200px]">{item.name}</p>
                          <p className="text-[10px] text-slate-500">{item.stock_quantity} un disponíveis</p>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => handleLinkKitItem({ id: item.id, name: item.name, quantity: 1, image_url: item.image_url })}>
                        Adicionar
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {linkedItems.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                    Nenhuma peça vinculada. <br/>(Se deixar vazio, ele será apenas informativo)
                  </div>
                ) : (
                  linkedItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><Package className="w-5 h-5 text-slate-400" /></div>
                        )}
                        <p className="text-sm font-semibold text-slate-700 truncate max-w-[180px]">{item.name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                          <button onClick={() => handleUpdateKitItemQuantity(item.id, item.quantity - 1)} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-200 transition-colors"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="px-3 text-sm font-bold text-slate-700 w-8 text-center">{item.quantity}</span>
                          <button onClick={() => handleUpdateKitItemQuantity(item.id, item.quantity + 1)} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-200 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                        <button onClick={() => handleUnlinkKitItem(item.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-auto">
              <Button variant="secondary" onClick={() => setIsKitModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveKit}>Salvar Registro</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL: Editar Peça Base */}
      <Modal isOpen={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} title="Editar Peça Base (Atributos Fiscais)">
        <div className="space-y-4">
          <Input label="Nome Técnico da Peça" value={editingItem.name || ''} onChange={e => setEditingItem({ ...editingItem, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Quantidade Total em Estoque" type="number" min="0" value={editingItem.stock_quantity || ''} onChange={e => setEditingItem({ ...editingItem, stock_quantity: Number(e.target.value) })} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Visibilidade B2B</label>
              <select className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" value={editingItem.status || 'Privado'} onChange={e => setEditingItem({ ...editingItem, status: e.target.value as 'Público' | 'Privado' })}>
                <option value="Privado">Apenas Meu Acervo</option>
                <option value="Público">Visível no Marketplace</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Valor Base de Locação (R$)" type="number" step="0.01" value={editingItem.rental_price || ''} onChange={e => setEditingItem({ ...editingItem, rental_price: Number(e.target.value) })} />
            <Input label="Custo Interno Estimado (R$)" type="number" step="0.01" value={editingItem.internal_cost || ''} onChange={e => setEditingItem({ ...editingItem, internal_cost: Number(e.target.value) })} />
          </div>
          
          <div className="pt-2">
            <label className="text-sm font-medium text-slate-700 block mb-2">Substituir Foto da Peça Base</label>
            <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50">
              {editingItem.image_url ? (
                <img src={editingItem.image_url} alt="Preview" className="w-16 h-16 rounded-lg object-cover" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-200 flex items-center justify-center"><ImageIcon className="w-6 h-6 text-slate-400" /></div>
              )}
              <input type="file" accept="image/*" className="text-sm" onChange={handleItemImageUpload} />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
            <Button variant="secondary" onClick={() => setIsItemModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveItem}>Salvar Alterações</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
