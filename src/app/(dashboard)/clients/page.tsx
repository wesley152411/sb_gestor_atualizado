'use client';

import { useState } from 'react';
import { Download, CheckSquare, FileText } from 'lucide-react';
import { savePartyEvent } from '@/services/api';
import { usePartyEvents, useClients, useDecorators } from '@/hooks/swr-hooks';
import { generateQuotePDF } from '@/lib/quote-pdf';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table } from '@/components/ui/TableAndTabs';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { PartyEvent } from '@/types';

const STATUS_OPTIONS: PartyEvent['status'][] = ['Pendente', 'Confirmado', 'Finalizado'];

export default function ClientsPage() {
  const { events, isLoading, mutate } = usePartyEvents();
  const { clients } = useClients();
  const { decorators } = useDecorators();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<PartyEvent['status']>>(new Set());
  const [monthFilter, setMonthFilter] = useState(''); // 'YYYY-MM', vazio = todos os períodos
  const { addNotification } = useNotificationStore();

  // Evento em preview (abre o documento antes de gerar o PDF).
  const [previewEvent, setPreviewEvent] = useState<PartyEvent | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Resolve o cliente e a decoradora DONA do evento em preview,
  // para nunca misturar dados/logo entre contas diferentes.
  const previewClient = previewEvent ? clients.find(c => c.id === previewEvent.client_id) || null : null;
  const previewOwner = previewEvent ? decorators.find(d => d.id === previewEvent.decorator_id) || null : null;

  const handleDownloadFromPreview = async () => {
    if (!previewEvent) return;
    setIsDownloading(true);
    try {
      await generateQuotePDF(previewEvent, previewClient, previewOwner);
      addNotification('PDF Gerado', `Documento de ${previewEvent.client_name} baixado.`);
      setPreviewEvent(null);
    } catch (error) {
      console.error('Falha ao gerar PDF:', error);
      addNotification('Erro ao Gerar PDF', 'Não foi possível gerar o documento.', true);
    } finally {
      setIsDownloading(false);
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
    // Ignora rascunhos de link de orçamento ainda não preenchidos pela cliente.
    if (!e.client_name.trim()) return false;
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
                    title="Visualizar documento"
                    onClick={() => setPreviewEvent(event)}
                  >
                    <FileText className="w-4 h-4" />
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

      {/* Preview do documento — abre antes de gerar o PDF */}
      <Modal
        isOpen={!!previewEvent}
        onClose={() => setPreviewEvent(null)}
        title="Pré-visualização do documento"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPreviewEvent(null)}>Fechar</Button>
            <Button icon={Download} isLoading={isDownloading} onClick={handleDownloadFromPreview}>
              Baixar PDF
            </Button>
          </>
        }
      >
        {previewEvent && (
          <div className="quote-doc">
            {/* Cabeçalho: logo da decoradora */}
            <div className="quote-doc-header">
              {(previewOwner?.logo_url || previewOwner?.avatar_url) ? (
                <img
                  className="quote-doc-logo"
                  src={previewOwner?.logo_url || previewOwner?.avatar_url}
                  alt={previewOwner?.name || 'Logo'}
                />
              ) : (
                <div className="quote-doc-logo quote-doc-logo-fallback">
                  {(previewOwner?.name || 'SB').trim().slice(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="quote-doc-title">{previewOwner?.name || 'Orçamento'}</div>
                <div className="quote-doc-subtitle">Orçamento do evento</div>
              </div>
              <div className="quote-doc-date">
                Emitido em {new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>

            {/* Produto / Serviço (sem valores) */}
            <div className="quote-doc-section-title">Produto / Serviço</div>
            <div className="quote-doc-product">
              <div className="quote-doc-product-name">{previewEvent.theme || 'Evento'}</div>
              <div className="quote-doc-product-desc">Orçamento gerado a partir do link enviado à cliente.</div>
            </div>

            {/* Dados do cliente */}
            <div className="quote-doc-section-title">Dados do cliente</div>
            <QuoteField label="Nome completo" value={previewEvent.client_name || previewClient?.name} />
            <QuoteField label="Telefone" value={previewEvent.phone || previewClient?.phone} />
            <QuoteField label="E-mail" value={previewClient?.email} />
            <QuoteField label="CPF" value={previewClient?.cpf} />

            {/* Informações de entrega */}
            <div className="quote-doc-section-title">Informações de entrega</div>
            <QuoteField label="Endereço" value={previewEvent.address || previewClient?.address} />
            <QuoteField label="Data do evento" value={previewEvent.event_date ? formatDate(previewEvent.event_date) : ''} />
            <QuoteField label="Horário de chegada" value={previewEvent.setup_time} />
            <QuoteField label="Horário de início" value={previewEvent.start_time} />

            {/* Observações */}
            {previewEvent.observation?.trim() && (
              <>
                <div className="quote-doc-section-title">Observações</div>
                <div className="quote-doc-obs">{previewEvent.observation}</div>
              </>
            )}

            {/* Itens inclusos — tabela de conferência */}
            <div className="quote-doc-section-title">Itens inclusos</div>
            <table className="quote-doc-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>QTD</th>
                  <th>PEÇA / DESCRIÇÃO</th>
                  <th style={{ textAlign: 'right', width: 230 }}>STATUS DE CARREGAMENTO</th>
                </tr>
              </thead>
              <tbody>
                {(previewEvent.items || []).length === 0 ? (
                  <tr><td colSpan={3} style={{ color: 'var(--text-light)' }}>Nenhum item cadastrado.</td></tr>
                ) : (
                  (previewEvent.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{it.quantity} un</td>
                      <td>{it.name}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="quote-doc-check"><span className="quote-doc-box" /> Carregado</span>
                        <span className="quote-doc-check"><span className="quote-doc-box" /> Conferido</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Escopo logístico para a equipe (dados dinâmicos) */}
            <div className="quote-doc-section-title">Escopo logístico para a equipe</div>
            <div className="quote-doc-stage">
              <div className="quote-doc-stage-title">Etapa A — Carregamento no Almoxarifado:</div>
              <ul>
                <li>Conferir todas as quantidades antes de embarcar.</li>
                <li>Usar mantas de proteção para mobiliários.</li>
              </ul>
            </div>
            <div className="quote-doc-stage">
              <div className="quote-doc-stage-title">
                Etapa B — Montagem (Chegada às {previewEvent.setup_time || '—'}):
              </div>
              <ul>
                <li>Entrega no endereço: {previewEvent.address || previewClient?.address || '—'}.</li>
                <li>Montar tudo até às {previewEvent.start_time || '—'} (início da festa).</li>
              </ul>
            </div>
            <div className="quote-doc-stage">
              <div className="quote-doc-stage-title">Etapa C — Desmontagem e Retorno:</div>
              <ul>
                <li>Contabilizar todas as peças na presença do responsável.</li>
                <li>Registrar avarias no sistema SB GESTOR.</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function QuoteField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="quote-doc-field">
      <span className="quote-doc-field-label">{label}</span>
      <span className="quote-doc-field-value">{value || '—'}</span>
    </div>
  );
}
