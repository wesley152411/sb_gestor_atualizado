'use client';

import { useState, useEffect } from 'react';
import { Search, Download, CheckSquare } from 'lucide-react';
import { getPartyEvents, savePartyEvent } from '@/services/api';
import { generateLogisticsPDF } from '@/lib/pdf-generator';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table } from '@/components/ui/TableAndTabs';
import { Badge } from '@/components/ui/Badge';
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PartyEvent } from '@/types';

export default function ClientsPage() {
  const [events, setEvents] = useState<PartyEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const data = await getPartyEvents();
    setEvents(data);
    setIsLoading(false);
  }

  const handleDownloadPDF = (eventData: PartyEvent) => {
    generateLogisticsPDF(eventData);
    addNotification('PDF Gerado', `Logística de ${eventData.client_name} baixada.`);
  };

  const handleConcludeEvent = async (eventData: PartyEvent) => {
    if (confirm(`Deseja concluir o evento de "${eventData.client_name}" e devolver todas as peças ao estoque livre?`)) {
      await savePartyEvent({ ...eventData, status: 'Finalizado' });
      addNotification("Itens Devolvidos", `As peças da festa "${eventData.theme}" retornaram ao acervo.`);
      loadData();
    }
  };

  const filteredEvents = events.filter(e => 
    e.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.theme.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando clientes...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Meus Clientes e Eventos</h1>
          <p className="page-subtitle">Acompanhe todos os contratos fechados e gerencie a logística de entrega.</p>
        </div>
      </div>

      <div className="mb-6">
        <SearchInput 
          placeholder="Buscar cliente ou tema..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
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
