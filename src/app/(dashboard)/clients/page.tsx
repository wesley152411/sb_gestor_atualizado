'use client';

import { useState } from 'react';
import { Search, Download, CheckSquare } from 'lucide-react';
import { savePartyEvent } from '@/services/api';
import { usePartyEvents } from '@/hooks/swr-hooks';
import { generateLogisticsPDF } from '@/lib/pdf-generator';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table } from '@/components/ui/TableAndTabs';
import { Badge } from '@/components/ui/Badge';
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PartyEvent } from '@/types';

const STATUS_OPTIONS: PartyEvent['status'][] = ['Pendente', 'Confirmado', 'Finalizado'];

export default function ClientsPage() {
  const { events, isLoading, mutate } = usePartyEvents();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<PartyEvent['status']>>(new Set());
  const [monthFilter, setMonthFilter] = useState(''); // 'YYYY-MM', vazio = todos os períodos
  const { addNotification } = useNotificationStore();

  const handleDownloadPDF = async (eventData: PartyEvent) => {
    try {
      await generateLogisticsPDF(eventData);
      addNotification('PDF Gerado', `Logística de ${eventData.client_name} baixada.`);
    } catch (error) {
      console.error('Falha ao gerar PDF logístico:', error);
      addNotification('Erro ao Gerar PDF', 'Não foi possível gerar o PDF logístico.', true);
    }
  };

  const handleConcludeEvent = async (eventData: PartyEvent) => {
    if (confirm(`Deseja concluir o evento de "${eventData.client_name}" e devolver todas as peças ao estoque livre?`)) {
      try {
        await savePartyEvent({ ...eventData, status: 'Finalizado' });
        addNotification("Itens Devolvidos", `As peças da festa "${eventData.theme}" retornaram ao acervo.`);
        mutate();
      } catch (error) {
        console.error('Falha ao concluir evento:', error);
        addNotification('Erro ao Concluir Evento', 'Não foi possível atualizar o status no servidor.', true);
      }
    }
  };

  const toggleStatusFilter = (status: PartyEvent['status']) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const hasActiveFilters = statusFilter.size > 0 || monthFilter !== '';
  const clearFilters = () => {
    setStatusFilter(new Set());
    setMonthFilter('');
  };

  const filteredEvents = events.filter(e => {
    const matchesSearch = e.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.theme.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter.size === 0 || statusFilter.has(e.status);
    const matchesMonth = monthFilter === '' || (e.event_date?.slice(0, 7) === monthFilter);
    return matchesSearch && matchesStatus && matchesMonth;
  });

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando clientes...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Meus Clientes e Eventos</h1>
          <p className="page-subtitle">Acompanhe todos os contratos fechados e gerencie a logística de entrega.</p>
        </div>
      </div>

      <div className="clients-filter-bar mb-6">
        <SearchInput
          placeholder="Buscar cliente ou tema..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="status-chip-group">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              className={`status-chip ${statusFilter.has(status) ? 'active' : ''}`}
              onClick={() => toggleStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>

        <input
          type="month"
          className="form-input month-filter-input"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          aria-label="Filtrar por mês do evento"
        />

        {hasActiveFilters && (
          <button type="button" className="clients-clear-filters" onClick={clearFilters}>
            Limpar filtros
          </button>
        )}
      </div>

      <Table headers={['Cliente', 'Telefone', 'Data do Evento', 'Tema', 'Status', 'Valor', 'Ações']}>
        {filteredEvents.length === 0 ? (
          <tr>
            <td colSpan={7} className="text-center py-8 text-slate-500">Nenhum evento encontrado.</td>
          </tr>
        ) : (
          filteredEvents.map(event => (
            <tr key={event.id}>
              <td className="font-bold">{event.client_name}</td>
              <td>{event.phone}</td>
              <td>{formatDate(event.event_date)}</td>
              <td>
                <span className="category-pill">{event.theme}</span>
              </td>
              <td>
                <Badge variant={event.status === 'Confirmado' ? 'success' : event.status === 'Pendente' ? 'warning' : 'neutral'}>
                  {event.status}
                </Badge>
              </td>
              <td className="font-bold">{formatCurrency(event.total_value)}</td>
              <td>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    size="icon" 
                    title="Baixar PDF Logístico"
                    onClick={() => handleDownloadPDF(event)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  {event.status !== 'Finalizado' && (
                    <Button 
                      variant="primary" 
                      size="icon" 
                      title="Concluir Evento (Devolver Estoque)"
                      onClick={() => handleConcludeEvent(event)}
                    >
                      <CheckSquare className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))
        )}
      </Table>
    </div>
  );
}
