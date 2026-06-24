'use client';

import { useState, useEffect } from 'react';
import { 
  Plus, CheckCircle2, AlertTriangle, X, Trash2, 
  UploadCloud, Search, PackageOpen, Minus, ShoppingBag
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { usePartyFormStore } from '@/stores/party-form-store';
import { useNotificationStore } from '@/stores/notification-store';
import { 
  getInventoryItems, getPartyEvents, savePartyEvent, 
  getKits, saveInventoryItem 
} from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import type { InventoryItem, PartyEvent, Kit } from '@/types';

export default function PartyFormPage() {
  const { decorator } = useAuthStore();
  const { items: formItems, addItem, removeItem, updateQuantity, clear } = usePartyFormStore();
  const { addNotification } = useNotificationStore();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [events, setEvents] = useState<PartyEvent[]>([]);
  
  // Form State
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [setupTime, setSetupTime] = useState('');
  const [startTime, setStartTime] = useState('');
  const [theme, setTheme] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [contractStatus, setContractStatus] = useState<'Confirmado' | 'Pendente' | 'Finalizado'>('Confirmado');

  // Unified Modal
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'items' | 'kits'>('items');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadData() {
      if (!decorator) return;
      const [inv, evts, kt] = await Promise.all([
        getInventoryItems(decorator.id),
        getPartyEvents(),
        getKits(decorator.id)
      ]);
      setInventory(inv);
      setEvents(evts);
      setKits(kt);
    }
    loadData();
  }, [decorator]);

  const searchResults = searchQuery.trim() === '' 
    ? [] 
    : inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSaveEvent = async () => {
    if (!clientName || !eventDate || formItems.length === 0) {
      alert("Preencha o nome do cliente, data do evento e adicione pelo menos uma peça.");
      return;
    }

    // Logic: Check Stock Conflicts
    const conflicts = checkStockConflicts(eventDate, formItems.map(f => ({ id: f.item.id, quantity: f.quantity, name: f.item.name })));
    
    if (conflicts.blocked.length > 0) {
      alert(`Conflito BLOQUEANTE! Peças já confirmadas noutros eventos:\n${conflicts.blocked.join('\n')}`);
      return;
    }

    if (conflicts.warnings.length > 0) {
      if (!confirm(`Alerta de Conflito com orçamentos PENDENTES:\n${conflicts.warnings.join('\n')}\nDeseja forçar a criação mesmo assim?`)) {
        return;
      }
    }

    await savePartyEvent({
      client_name: clientName,
      phone,
      address,
      setup_time: setupTime,
      start_time: startTime,
      theme,
      event_date: eventDate,
      total_value: Number(totalValue) || 0,
      status: contractStatus,
      items: formItems.map(f => ({
        id: f.item.id,
        name: f.item.name,
        quantity: f.quantity,
        price: f.item.rental_price
      }))
    });

    addNotification('Evento Criado', `A festa para ${clientName} foi registrada.`);
    
    // Clear form
    handleClearForm();
  };

  const handleClearForm = () => {
    setClientName('');
    setPhone('');
    setAddress('');
    setSetupTime('');
    setStartTime('');
    setTheme('');
    setEventDate('');
    setTotalValue('');
    setContractStatus('Confirmado');
    clear();
  };

  const checkStockConflicts = (date: string, newItems: { id: string; quantity: number; name: string }[]) => {
    const blocked: string[] = [];
    const warnings: string[] = [];

    const eventsOnDate = events.filter(e => e.event_date === date && e.status !== 'Finalizado');

    newItems.forEach(newItem => {
      const invItem = inventory.find(i => i.id === newItem.id);
      if (!invItem) return;

      const totalStock = invItem.stock_quantity;
      let sumConfirmed = 0;
      let sumPending = 0;

      eventsOnDate.forEach(evt => {
        const found = evt.items.find(i => i.id === newItem.id);
        if (found) {
          if (evt.status === 'Confirmado') sumConfirmed += found.quantity;
          if (evt.status === 'Pendente') sumPending += found.quantity;
        }
      });

      const requiredForNew = newItem.quantity;

      if (requiredForNew + sumConfirmed > totalStock) {
        blocked.push(`- ${newItem.name} (Requer: ${requiredForNew}, Confirmed: ${sumConfirmed}, Disp: ${totalStock})`);
      } else if (requiredForNew + sumConfirmed + sumPending > totalStock) {
        warnings.push(`- ${newItem.name} (Requer: ${requiredForNew}, Confirm: ${sumConfirmed}, Pendentes: ${sumPending}, Disp: ${totalStock})`);
      }
    });

    return { blocked, warnings };
  };

  const addKitItems = (kit: Kit) => {
    kit.items.forEach(kitItem => {
      const invItem = inventory.find(i => i.id === kitItem.id);
      if (invItem) addItem(invItem, kitItem.quantity);
    });
    setIsSearchOpen(false);
    addNotification('Kit Adicionado', `O kit "${kit.name}" foi importado para a lista.`);
  };

  const handleCreateAndAddItem = async () => {
    if (!searchQuery.trim()) return;
    const name = searchQuery.trim();
    const newItem: InventoryItem = {
      id: '',
      decorator_id: decorator?.id || '',
      name: name,
      description: 'Item criado via formulário rápido',
      image_url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=150',
      status: 'Privado',
      stock_quantity: 10,
      rental_price: 35.0,
      internal_cost: 15.0
    };
    const savedItem = await saveInventoryItem(newItem);
    setInventory(prev => [...prev, savedItem]);
    addItem(savedItem);
    setIsSearchOpen(false);
    setSearchQuery('');
    addNotification('Item Criado', `O item "${savedItem.name}" foi criado com sucesso.`);
  };

  // Header element inside search modal
  const modalTitleNode = (
    <div className="flex-row-center">
      <div 
        style={{
          width: '28px',
          height: '28px',
          backgroundColor: '#4f46e5',
          color: 'white',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Plus style={{ width: '14px', height: '14px', strokeWidth: 3 }} />
      </div>
      <span className="font-extrabold text-slate-800 text-lg">Adicionar Mais Itens</span>
    </div>
  );

  return (
    <div className="party-form-container">
      {/* Header */}
      <div className="flex-row-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Checklist de Festas</h1>
          <p className="text-slate-500 text-sm mt-1">Preencha os dados do cliente e selecione as peças de acervo privado para alocação.</p>
        </div>
        <Button 
          variant="secondary" 
          size="sm" 
          icon={Trash2} 
          onClick={handleClearForm}
        >
          Limpar Formulário
        </Button>
      </div>

      {/* Grid Layout */}
      <div className="party-form-layout">
        {/* Left Column: Client & Logistics Form */}
        <div className="panel flex flex-col gap-5 h-full">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-50 pb-2 mb-2">1. Dados Logísticos e do Cliente</h2>
          
          <div className="grid-2">
            <Input 
              label="Nome do Cliente" 
              placeholder="Ex: Mariana Silva"
              value={clientName} 
              onChange={e => setClientName(e.target.value)} 
              required 
            />
            <Input 
              label="Telefone" 
              placeholder="Ex: 11988887777"
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
            />
          </div>
          
          <Input 
            label="Endereço Completo da Entrega/Montagem" 
            placeholder="Ex: Av. Paulista, 1000 - Bela Vista, SP"
            value={address} 
            onChange={e => setAddress(e.target.value)} 
          />
          
          <div className="grid-3">
            <Input 
              type="date" 
              label="Data do Evento" 
              value={eventDate} 
              onChange={e => setEventDate(e.target.value)} 
              required 
            />
            <Input 
              type="time" 
              label="Horário de Chegada (Montagem)" 
              value={setupTime} 
              onChange={e => setSetupTime(e.target.value)} 
            />
            <Input 
              type="time" 
              label="Horário de Início da Festa" 
              value={startTime} 
              onChange={e => setStartTime(e.target.value)} 
            />
          </div>

          <div className="grid-2">
            <Input 
              label="Tema da Festa" 
              placeholder="Ex: Casamento Boho Chic"
              value={theme} 
              onChange={e => setTheme(e.target.value)} 
            />
            <Input 
              type="number" 
              label="Valor Cobrado do Evento (R$)" 
              placeholder="Ex: 4500.00"
              value={totalValue} 
              onChange={e => setTotalValue(e.target.value)} 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Status do Contrato</label>
            <select 
              value={contractStatus}
              onChange={e => setContractStatus(e.target.value as any)}
              className="form-select"
            >
              <option value="Confirmado">Confirmado / Assinado (Bloqueia Estoque Físico)</option>
              <option value="Pendente">Pendente / Orçamento (Reserva Temporária)</option>
              <option value="Finalizado">Finalizado / Entregue</option>
            </select>
          </div>

          <Button 
            className="w-full mt-4" 
            size="lg" 
            icon={UploadCloud} 
            onClick={handleSaveEvent}
          >
            Confirmar Contrato e Gerar PDF Logístico
          </Button>
        </div>

        {/* Right Column: Allocated Pieces */}
        <div className="panel flex flex-col h-full min-h-[480px]">
          <h2 className="text-lg font-bold text-slate-800 border-b border-slate-50 pb-2 mb-4">2. Peças Alocadas no Evento</h2>

          {/* Add Item Trigger (Dashed Box) */}
          <button 
            type="button" 
            onClick={() => { setModalTab('items'); setIsSearchOpen(true); }}
            className="btn-add-items"
          >
            <Plus className="w-5 h-5" />
            <span>Adicionar Mais Itens</span>
          </button>

          {/* Items Checklist Table */}
          <div className="flex-1 flex flex-col">
            {formItems.length === 0 ? (
              <div className="empty-state-v2">
                <p className="empty-state-text">
                  Nenhuma peça selecionada. Vá até o Inventário e adicione itens.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-left">
                      <th className="text-xs font-bold uppercase tracking-wider py-3 pl-3 rounded-l-lg">Peça</th>
                      <th className="text-xs font-bold uppercase tracking-wider py-3 text-center">Qtd Desejada</th>
                      <th className="text-xs font-bold uppercase tracking-wider py-3 text-right pr-3 rounded-r-lg">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {formItems.map((f, idx) => {
                      const itemSubtotal = f.item.rental_price * f.quantity;
                      return (
                        <tr key={`${f.item.id}-${idx}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="py-4 pl-1">
                            <div className="flex-row-center">
                              <img 
                                src={f.item.image_url} 
                                alt={f.item.name} 
                                className="checklist-item-thumbnail" 
                              />
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 leading-snug">{f.item.name}</h4>
                                <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                                  Estoque Total: {f.item.stock_quantity} un
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-center">
                            <div className="stepper-container">
                              <button 
                                type="button"
                                onClick={() => updateQuantity(idx, Math.max(1, f.quantity - 1))}
                                className="stepper-btn"
                              >
                                -
                              </button>
                              <span className="stepper-val">{f.quantity}</span>
                              <button 
                                type="button"
                                onClick={() => updateQuantity(idx, f.quantity + 1)}
                                className="stepper-btn"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-4 text-right pr-2">
                            <div className="flex-row-end">
                              <span className="text-sm font-bold text-slate-800">{formatCurrency(itemSubtotal)}</span>
                              <button 
                                type="button"
                                onClick={() => removeItem(idx)} 
                                className="btn-remove-item"
                              >
                                <Trash2 style={{ width: '16px', height: '16px' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Items Unified Modal */}
      <Modal 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        title={modalTitleNode}
        className="max-w-xl"
      >
        {/* Tab Selection */}
        <div className="modal-tabs">
          <button 
            type="button"
            onClick={() => setModalTab('items')}
            className={`modal-tab-btn ${modalTab === 'items' ? 'active' : ''}`}
          >
            Peças Avulsas
          </button>
          <button 
            type="button"
            onClick={() => setModalTab('kits')}
            className={`modal-tab-btn ${modalTab === 'kits' ? 'active' : ''}`}
          >
            Kits Prontos
          </button>
        </div>

        {/* Tab Content: Pieces List */}
        {modalTab === 'items' && (
          <div>
            <div className="relative mb-4">
              <Search 
                style={{ width: '16px', height: '16px' }} 
                className="absolute-center-y left-3.5 text-slate-400" 
              />
              <input 
                placeholder="Buscar peça por nome..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
                className="form-input pl-10"
              />
            </div>
            
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {/* Initial State */}
              {searchQuery.trim() === '' && (
                <div className="text-center py-10 text-slate-400 text-sm">
                  Digite o nome de uma peça para buscar no acervo.
                </div>
              )}

              {/* Search Results */}
              {searchQuery.trim() !== '' && searchResults.map(item => (
                <div 
                  key={item.id} 
                  className="search-result-item-v2" 
                  onClick={() => { addItem(item); setIsSearchOpen(false); setSearchQuery(''); }}
                >
                  <div className="flex-row-center">
                    <img src={item.image_url} alt={item.name} className="search-result-thumbnail" />
                    <div>
                      <span className="text-sm font-bold text-slate-800 block leading-tight">{item.name}</span>
                      <span className="text-[11px] font-medium text-slate-400 block mt-1">
                        Estoque disp.: {item.stock_quantity} un • {formatCurrency(item.rental_price)}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" className="pointer-events-none text-indigo-600 border-indigo-100 bg-indigo-50/30">
                    + Add
                  </Button>
                </div>
              ))}

              {/* Empty Search Results: Create Item Option */}
              {searchQuery.trim() !== '' && searchResults.length === 0 && (
                <div className="py-6 px-2">
                  <button 
                    type="button" 
                    onClick={handleCreateAndAddItem}
                    className="btn-create-item animate-pulse-subtle"
                  >
                    <Plus style={{ width: '16px', height: '16px', strokeWidth: 3 }} />
                    <span>Criar novo item: '{searchQuery}'</span>
                  </button>
                  <div className="text-center mt-3 text-slate-400 text-sm">
                    Nenhum item encontrado. Use o BOTÃO acima para criar.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Content: Kits List */}
        {modalTab === 'kits' && (
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {kits.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                Você não possui kits cadastrados. Vá em Inventário para criar.
              </div>
            ) : (
              kits.map(kit => (
                <div 
                  key={kit.id} 
                  className="search-result-item-v2" 
                  onClick={() => addKitItems(kit)}
                >
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{kit.name}</h4>
                    <p className="text-xs font-medium text-slate-400 mt-1">
                      {kit.items.reduce((s, i) => s + i.quantity, 0)} peças neste kit
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" className="text-indigo-600 border-indigo-100 bg-indigo-50/30">
                    Importar
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
