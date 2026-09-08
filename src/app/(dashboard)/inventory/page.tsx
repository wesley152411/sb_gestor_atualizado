'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Search, SlidersHorizontal, Package, LayoutGrid,
  DollarSign, TrendingUp, Pencil, Trash2, ImageIcon, ShoppingCart, Check
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
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency, formatPriceLabel, hasPrice, getPlaceholderImage } from '@/lib/utils';
import type { InventoryItem, Kit } from '@/types';

// Peça ainda NÃO gravada: existe só na lista do modal até o Salvar. O prefixo
// torna impossível confundir com id de verdade — e é o que permite ao Salvar
// saber quem precisa ser criado e quem já está no acervo.
const PREFIXO_PENDENTE = 'pendente:';
const ehPendente = (id: string) => id.startsWith(PREFIXO_PENDENTE);

export default function InventoryPage() {
  const router = useRouter();
  const { items: partyFormItems, addItem: addPartyFormItem, clear: clearPartyForm } = usePartyFormStore();
  const { decorator } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const [activeTab, setActiveTab] = useState('items');
  const { items, isLoading: isItemsLoading, mutate: mutateItems } = useInventory(decorator?.id);
  const { kits, isLoading: isKitsLoading, mutate: mutateKits } = useKits(decorator?.id);

  // Peças BLOQUEADAS por locação B2B ativa (como locadora): peça -> locações que a
  // reservam, com datas. Expande kits usando os kits carregados. Um clique leva ao
  // DIA certo no calendário (ou à lista, se houver mais de uma).
  type BlockRow = { orderId: string; pickup: string; ret: string; renter: string };
  const [rentalsByItem, setRentalsByItem] = useState<Record<string, BlockRow[]>>({});
  const [blockedModal, setBlockedModal] = useState<{ itemName: string; rentals: BlockRow[] } | null>(null);
  const toDay = (d?: string | null) => (d ? String(d).slice(0, 10) : '');
  const fmtBr = (d: string) => (d ? d.split('-').reverse().join('/') : '');

  useEffect(() => {
    if (!decorator?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/orders');
        if (!res.ok) return;
        const orders = await res.json();
        const map: Record<string, BlockRow[]> = {};
        const add = (itemId: string, o: any) => {
          (map[itemId] ||= []).push({ orderId: o.id, pickup: toDay(o.pickup_date), ret: toDay(o.return_date), renter: o.renter?.name || 'parceira' });
        };
        for (const o of orders) {
          if (o.status !== 'ativo' || o.owner_id !== decorator.id) continue;
          for (const it of (o.items || [])) {
            if (it.item_id) add(it.item_id, o);
            else if (it.kit_id) (kits.find((k) => k.id === it.kit_id)?.items || []).forEach((c) => add(c.id, o));
          }
        }
        if (!cancelled) setRentalsByItem(map);
      } catch { /* silencioso — o acervo funciona sem o indicador */ }
    })();
    return () => { cancelled = true; };
  }, [decorator?.id, kits, items]);

  const openBlocked = (item: InventoryItem) => {
    const rentals = rentalsByItem[item.id] || [];
    if (rentals.length === 1) router.push(`/calendar?date=${rentals[0].pickup || rentals[0].ret}`);
    else if (rentals.length > 1) setBlockedModal({ itemName: item.name, rentals });
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(new Set());
  const isLoading = isItemsLoading || isKitsLoading;

  // Peça em edição (usada pelo modal unificado quando editando uma Peça Avulsa),
  // preserva campos não editáveis no modal (estoque/custo/etc) ao salvar.
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem>>({});

  // Create Kit Modal
  const [isKitModalOpen, setIsKitModalOpen] = useState(false);
  const [kitName, setKitName] = useState('');
  const [kitDescription, setKitDescription] = useState('');
  const [kitValue, setKitValue] = useState('');
  // Erro do valor do kit é ON SUBMIT: só vira true quando a decoradora tenta
  // salvar sem valor válido. Ao abrir o modal começa limpo (sem erro herdado).
  const [kitValueError, setKitValueError] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  // isNew = peça CRIADA dentro deste modal (vs. peça já existente só vinculada).
  // Só as novas têm o estoque inicial semeado pela quantidade do modal ao salvar.
  const [linkedItems, setLinkedItems] = useState<{ id: string; name: string; quantity: number; image_url?: string; isNew?: boolean }[]>([]);
  const [kitSearchQuery, setKitSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  // Quando setado, o modal unificado está editando uma Peça Avulsa (InventoryItem)
  // em vez de um Kit — o salvar faz UPDATE da peça, não INSERT de kit.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Helper to count total pieces in a kit
  const getKitTotalPieces = (kit: Kit) => {
    return kit.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  const singlePieceKits = kits.filter(k => getKitTotalPieces(k) === 1);
  const multiPieceKits = kits.filter(k => getKitTotalPieces(k) > 1);

  const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredSinglePieceKits = singlePieceKits.filter(k => k.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredMultiPieceKits = multiPieceKits.filter(k => k.name.toLowerCase().includes(searchQuery.toLowerCase()));

  // Abre o modal UNIFICADO (mesmo de "Criar Nova Peça/Kit") em modo edição de
  // Peça Avulsa: pré-preenche os campos compartilhados e guarda a peça original
  // (editingItem) para preservar os campos numéricos/status ao salvar.
  const handleOpenEditPieceModal = (item: InventoryItem) => {
    setKitName(item.name);
    setKitDescription(item.description || '');
    setKitValue(item.rental_price ? item.rental_price.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }) : '');
    setCoverImageUrl(item.image_url || '');
    setLinkedItems([]);
    setKitSearchQuery('');
    setEditingKitId(null);
    setEditingItem(item);
    setEditingItemId(item.id);
    setKitValueError(false);
    setIsKitModalOpen(true);
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
    setEditingItemId(null);
    setKitValueError(false);
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
    setKitValueError(false);
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
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = await processImageUpload(file);
      setCoverImageUrl(imageUrl);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const imageUrl = await processImageUpload(file);
      setCoverImageUrl(imageUrl);
    }
  };

  const handleLinkKitItem = (item: { id: string; name: string; quantity: number; image_url?: string; isNew?: boolean }) => {
    const exists = linkedItems.find(i => i.id === item.id);
    if (exists) {
      setLinkedItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setLinkedItems(prev => [...prev, { id: item.id, name: item.name, quantity: item.quantity, image_url: item.image_url, isNew: item.isNew }]);
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

  // "Criar novo item" NÃO grava nada. Só põe a peça na lista como PENDENTE.
  //
  // Antes, gravava na hora: a peça nascia com preço zero, e o valor digitado
  // depois ia para o KIT. A decoradora salvava, o card aparecia sem valor e
  // parecia defeito. Pior, desistir no meio deixava a peça no acervo.
  //
  // Agora nada existe até o Salvar, e é lá que se decide o que criar — pela
  // composição da lista, não por um botão apertado antes.
  const handleCreateKitInventoryItem = () => {
    if (!kitSearchQuery.trim() || !decorator) return;
    const nome = kitSearchQuery.trim();
    // Digitar o mesmo nome duas vezes não deve virar duas peças. Comparação sem
    // caixa e sem espaços das pontas, que é como a pessoa lê "é o mesmo".
    const jaNaLista = linkedItems.some(
      (i) => ehPendente(i.id) && i.name.trim().toLowerCase() === nome.toLowerCase(),
    );
    if (jaNaLista) {
      setKitSearchQuery('');
      return;
    }
    handleLinkKitItem({ id: `${PREFIXO_PENDENTE}${crypto.randomUUID()}`, name: nome, quantity: 1, isNew: true });
    setKitSearchQuery('');
  };

  const handleSaveKit = async () => {
    if (!decorator) return;
    if (!kitName.trim()) {
      alert('O Nome da Decoração é obrigatório.');
      return;
    }

    // Modo edição de Peça Avulsa: faz UPDATE do InventoryItem existente
    // (preservando campos não expostos no modal), em vez de criar um Kit.
    if (editingItemId) {
      try {
        // "Valor (opcional)" mapeia para o preço de locação da peça.
        const parsedPrice = kitValue.trim() !== ''
          ? Number(kitValue.replace(/\D/g, '')) / 100
          : (editingItem.rental_price ?? 0);
        const updatedItem = {
          ...editingItem,
          id: editingItemId,
          decorator_id: decorator.id,
          name: kitName.trim(),
          description: kitDescription.trim(),
          image_url: coverImageUrl || '',
          rental_price: parsedPrice,
        } as InventoryItem;
        await saveInventoryItem(updatedItem);
        addNotification('Peça Salva', `A peça "${updatedItem.name}" foi atualizada com sucesso.`);
        setIsKitModalOpen(false);
        mutateItems();
      } catch (err) {
        console.error('Falha ao atualizar peça:', err);
        addNotification('Erro ao Salvar', 'Não foi possível atualizar a peça.', true);
      }
      return;
    }

    const parsedValue = kitValue.trim() !== ''
      ? Number(kitValue.replace(/\D/g, '')) / 100
      : null;

    // Valor OBRIGATÓRIO (> 0), seja peça ou kit. Validação ON SUBMIT: marca o
    // erro e não salva. O vermelho some sozinho quando um valor > 0 é digitado.
    if (!parsedValue || parsedValue <= 0) {
      setKitValueError(true);
      return;
    }

    if (!linkedItems.length) {
      alert('Adicione pelo menos um item.');
      return;
    }

    // O TIPO É DECIDIDO AQUI, PELA COMPOSIÇÃO — não por um botão apertado antes.
    //
    //   1 item  -> peça avulsa, com o valor NA PEÇA
    //   2+      -> kit, com o valor NO KIT e as peças como composição
    //
    // Editar um kit existente NÃO muda de tipo: reduzir a lista para um item
    // dentro da edição continua sendo o mesmo kit. Converter em silêncio apagaria
    // um registro que já pode estar referenciado numa locação ou num orçamento.
    if (linkedItems.length === 1 && !editingKitId) {
      const unico = linkedItems[0];

      if (ehPendente(unico.id)) {
        // PEÇA NOVA. O nome vem do campo do modal (obrigatório), não do texto da
        // busca: é ele que a decoradora entende como o nome do que está criando.
        // E a capa vai PARA A PEÇA — sem kit, não há outro lugar para ela.
        try {
          await saveInventoryItem({
            id: '',
            decorator_id: decorator.id,
            name: kitName.trim(),
            description: kitDescription.trim(),
            image_url: coverImageUrl || '',
            status: 'Privado',
            stock_quantity: unico.quantity,
            rental_price: parsedValue,
            internal_cost: 0,
          } as InventoryItem);
          addNotification('Peça Criada', `A peça "${kitName.trim()}" foi criada com valor.`);
        } catch (err) {
          console.error('Falha ao criar peça avulsa:', err);
          addNotification('Erro ao Salvar', 'Não foi possível criar a peça.', true);
          return;
        }
      } else {
        // PEÇA QUE JÁ EXISTE. O gesto é "quero ajustar o valor desta peça", mas
        // mudar preço em silêncio é o tipo de coisa que se descobre errado
        // depois — então avisa antes, com os dois valores na tela.
        const existente = items.find((i) => i.id === unico.id);
        if (!existente) {
          addNotification('Peça não encontrada', 'Atualize a página e tente de novo.', true);
          return;
        }
        const de = Number(existente.rental_price ?? 0);
        if (de !== parsedValue) {
          const confirmou = window.confirm(
            [
              'Esta peça já existe no seu acervo.',
              '',
              `O valor de "${existente.name}" será atualizado de ${formatPriceLabel(de)} para ${formatCurrency(parsedValue)}.`,
            ].join(String.fromCharCode(10)),
          );
          if (!confirmou) return;
        }
        try {
          // SÓ o preço. O aviso prometeu isso e mais nada — renomear ou trocar a
          // foto por tabela seria pior que a mudança de valor.
          await saveInventoryItem({ ...existente, rental_price: parsedValue });
          addNotification('Valor Atualizado', `"${existente.name}" agora vale ${formatCurrency(parsedValue)}.`);
        } catch (err) {
          console.error('Falha ao atualizar peça:', err);
          addNotification('Erro ao Salvar', 'Não foi possível atualizar a peça.', true);
          return;
        }
      }

      setIsKitModalOpen(false);
      setActiveTab('items');
      mutateItems();
      return;
    }

    // KIT. As peças pendentes precisam virar linhas de verdade ANTES do kit,
    // porque o kit as REFERENCIA por id — é assim que a locação B2B expande o
    // kit em demanda por peça e não aluga a mesma peça física duas vezes.
    // Nascem com preço ZERO de propósito: num kit, o valor é do conjunto.
    const idsFinais = new Map<string, string>();
    try {
      for (const li of linkedItems.filter((i) => ehPendente(i.id))) {
        const criada = await saveInventoryItem({
          id: '',
          decorator_id: decorator.id,
          name: li.name,
          description: 'Peça criada junto com um kit',
          image_url: '',
          status: 'Privado',
          stock_quantity: li.quantity,
          rental_price: 0,
          internal_cost: 0,
        } as InventoryItem);
        idsFinais.set(li.id, criada.id);
      }
    } catch (err) {
      console.error('Falha ao criar as peças do kit:', err);
      addNotification('Erro ao Salvar', 'Não foi possível criar as peças do kit.', true);
      return;
    }

    const kitData: Partial<Kit> = {
      id: editingKitId || undefined,
      decorator_id: decorator.id,
      name: kitName.trim(),
      description: kitDescription.trim(),
      image_url: coverImageUrl || '',
      value: parsedValue,
      items: linkedItems.map((i) => ({
        id: idsFinais.get(i.id) ?? i.id,
        name: i.name,
        quantity: i.quantity,
      })),
    };

    // A capa NÃO é sincronizada para as peças: ela é do kit. Trocar a capa nunca
    // altera peça nenhuma, e peça com foto própria fica intacta.
    try {
      await saveKit(kitData);
    } catch (err) {
      console.error('Falha ao salvar o kit:', err);
      addNotification('Erro ao Salvar', 'As peças foram criadas, mas o kit não. Tente salvar de novo.', true);
      return;
    }
    addNotification('Kit Salvo', `O kit "${kitData.name}" foi registrado com sucesso.`);

    setIsKitModalOpen(false);
    setActiveTab('kits');
    mutateKits();
    if (idsFinais.size) mutateItems();
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

  // Peças Avulsas: quantidade já presente no formulário em andamento para uma peça
  const getPartyFormQty = (itemId: string) => partyFormItems.find(p => p.item.id === itemId)?.quantity || 0;

  // "Adicionar ao formulário" fica desabilitado sem estoque disponível OU enquanto
  // o preço de locação não estiver definido (peça nova nasce com "A definir").
  const isAddToFormDisabled = (item: InventoryItem) =>
    getPartyFormQty(item.id) >= item.stock_quantity || !hasPrice(item.rental_price);

  // Valor digitado no modal (em reais). O campo guarda a string formatada.
  const parsedModalValue = kitValue.trim() !== '' ? Number(kitValue.replace(/\D/g, '')) / 100 : 0;
  // Valor é OBRIGATÓRIO para KIT (criar/editar kit). Ao editar uma PEÇA
  // (editingItemId), o mesmo campo é o preço da peça e segue OPCIONAL: peça sem
  // valor é rascunho — existe no acervo, mas não circula (nem forma, nem público).
  const kitValueRequired = !editingItemId;
  const kitValueInvalid = kitValueRequired && !(parsedModalValue > 0);
  // Só exibe o vermelho DEPOIS de tentar salvar (kitValueError) e enquanto o
  // valor seguir inválido — some sozinho quando um valor > 0 é digitado.
  const showKitValueError = kitValueError && kitValueInvalid;

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
        <Button icon={Plus} bloqueiaEmLeitura onClick={handleOpenKitModal}>
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
            <span className="acervo-stat-value">{multiPieceKits.length}</span>
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
            Peças Avulsas ({items.length + singlePieceKits.length})
          </button>
          <button 
            className={`acervo-segment ${activeTab === 'kits' ? 'active' : ''}`}
            onClick={() => setActiveTab('kits')}
          >
            Kits Prontos ({multiPieceKits.length})
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
          {filteredItems.length === 0 && filteredSinglePieceKits.length === 0 ? (
            <div className="acervo-empty-state">
              <Package className="w-12 h-12" />
              <h3>Nenhuma peça encontrada</h3>
              <p>Adicione peças ao seu acervo para começar.</p>
              <Button icon={Plus} bloqueiaEmLeitura onClick={handleOpenKitModal}>
                Adicionar Peça
              </Button>
            </div>
          ) : (
            <>
              {filteredItems.map(item => (
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
                        <span className="acervo-metric-value acervo-price">{formatPriceLabel(item.rental_price)}</span>
                      </div>
                    </div>

                    {/* Peça bloqueada por locação B2B ativa → um clique para o calendário */}
                    {(rentalsByItem[item.id]?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => openBlocked(item)}
                        title="Ver a(s) locação(ões) no calendário"
                        style={{
                          width: '100%', marginTop: 10, display: 'inline-flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#b45309',
                          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px', cursor: 'pointer',
                        }}
                      >
                        🔒 {rentalsByItem[item.id].length} emprestada{rentalsByItem[item.id].length > 1 ? 's' : ''} · ver no calendário
                      </button>
                    )}

                    {/* Adicionar ao Formulário Button */}
                    <button
                      type="button"
                      onClick={() => handleAddItemToForm(item)}
                      disabled={isAddToFormDisabled(item)}
                      className="btn-primary"
                      style={{
                        width: '100%', marginTop: '14px', marginBottom: '8px', justifyContent: 'center',
                        backgroundColor: addedItemIds.has(item.id) ? '#16a34a' : '#2563eb',
                        display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 12px',
                        opacity: isAddToFormDisabled(item) ? 0.5 : 1,
                        cursor: isAddToFormDisabled(item) ? 'not-allowed' : 'pointer',
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
                    <div className="acervo-card-actions">
                      <button
                        className="acervo-action-btn"
                        onClick={() => handleOpenEditPieceModal(item)}
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
              ))}

              {filteredSinglePieceKits.map(kit => (
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
                      Peça Avulsa
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
                          <span className="acervo-metric-label">VALOR DA PEÇA</span>
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
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'kits' && (
        <div className="acervo-product-grid">
          {filteredMultiPieceKits.length === 0 ? (
            <div className="acervo-empty-state">
              <LayoutGrid className="w-12 h-12" />
              <h3>Nenhum kit encontrado</h3>
              <p>Monte kits com suas peças para facilitar a locação.</p>
            </div>
          ) : (
            filteredMultiPieceKits.map(kit => (
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

      {/* Create/Edit Piece/Kit Modal (unificado) */}
      <Modal
        isOpen={isKitModalOpen}
        onClose={() => setIsKitModalOpen(false)}
        title={editingItemId ? "Editar Peça" : editingKitId ? "Editar Kit" : "Criar Nova Peça/Kit"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsKitModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveKit} bloqueiaEmLeitura>
              {editingItemId || editingKitId ? "Salvar Alterações" : "Salvar Kit"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={editingItemId ? "Nome da Peça" : "Nome da Decoração"}
            placeholder="Digite o nome..."
            value={kitName}
            onChange={e => setKitName(e.target.value)}
            required
          />

          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea
              className="form-input"
              placeholder={editingItemId ? "Descreva esta peça..." : "Descreva este kit..."}
              rows={3}
              value={kitDescription}
              onChange={e => setKitDescription(e.target.value)}
            />
          </div>

          {/* Valor: obrigatório para KIT; opcional ao editar uma PEÇA (rascunho).
              Erro só aparece ON SUBMIT (showKitValueError). */}
          <Input
            type="text"
            label={editingItemId ? 'Valor de Locação (opcional)' : 'Valor do Kit *'}
            placeholder="R$ 0,00"
            value={kitValue}
            onChange={handleKitValueChange}
            error={showKitValueError ? 'Informe o valor do kit' : undefined}
          />

          {/* Cover Photo Drag and Drop area */}
          <div className="form-group">
            <label className="form-label">{editingItemId ? "Foto da Peça" : "Foto de Capa"}</label>
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

          {/* Seção Itens do Kit — apenas no fluxo de Kit (peças avulsas não têm sub-itens) */}
          {/* Itens do Kit — mesma seção do modal "Nova Peça", exibida também na edição */}
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
                  <span>{`Criar novo item: "${kitSearchQuery}"`}</span>
                </button>
              </div>
            )}

            {/* Search Results */}
            {kitSearchQuery.trim() !== '' && kitSearchResults.length > 0 && (
              <div className="border border-slate-100 rounded-xl max-h-[180px] overflow-y-auto mb-4 p-1 bg-white shadow-xs">
                {kitSearchResults.map(item => (
                  <div key={item.id} className="linked-item-row hover:bg-slate-50 transition-colors">
                    <div className="flex-row-center">
                      {/* Miniatura = foto PRÓPRIA da peça; placeholder neutro quando não há.
                          Nunca a foto de capa do kit. */}
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="search-result-thumbnail" />
                      ) : (
                        <div className="search-result-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)' }}>
                          <ImageIcon style={{ width: 18, height: 18 }} />
                        </div>
                      )}
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
                        {/* Miniatura = foto PRÓPRIA da peça; placeholder neutro quando
                            não há. Sem fallback de foto genérica nem a capa do kit. */}
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="checklist-item-thumbnail" />
                        ) : (
                          <div className="checklist-item-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)' }}>
                            <ImageIcon style={{ width: 18, height: 18 }} />
                          </div>
                        )}
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

      {/* Lista de locações sobre a MESMA peça (>1) — não escolhemos o dia por ela;
          cada linha leva ao dia certo no calendário. */}
      <Modal
        isOpen={!!blockedModal}
        onClose={() => setBlockedModal(null)}
        title={blockedModal ? `"${blockedModal.itemName}" — locações ativas` : ''}
        footer={<Button variant="secondary" onClick={() => setBlockedModal(null)}>Fechar</Button>}
      >
        <div className="detail-list">
          {blockedModal?.rentals.map((r) => (
            <button
              key={r.orderId}
              type="button"
              onClick={() => { setBlockedModal(null); router.push(`/calendar?date=${r.pickup || r.ret}`); }}
              style={{
                display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                padding: '12px 14px', marginBottom: 8, borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg-input)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {fmtBr(r.pickup)} → {fmtBr(r.ret)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Alugada por {r.renter}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
