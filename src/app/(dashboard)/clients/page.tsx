'use client';

import { useState, useEffect } from 'react';
import { Download, CheckSquare, FileText, ChevronDown, XCircle, Trash2, MessageCircle } from 'lucide-react';
import { confirmPartyEvent, cancelPartyEvent, discardPartyEvent, getPromoMessages, sendPromoMessage, saveClient } from '@/services/api';
import { usePartyEvents, useClients, useDecorators } from '@/hooks/swr-hooks';
import { generateQuotePDF } from '@/lib/quote-pdf';
import { generateLogisticsPDF } from '@/lib/pdf-generator';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Table } from '@/components/ui/TableAndTabs';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useNotificationStore } from '@/stores/notification-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate, isValidPromoPhone, promoWhatsappUrl, fillPromoTemplate, defaultPromoTemplate } from '@/lib/utils';
import { EVENT_STATUS, ALL_EVENT_STATUSES, effectiveStatus, statusBadge, isDraftLink } from '@/lib/event-status';
import type { EventStatus, PartyEvent, Client, ClientPromoMessage } from '@/types';

const STATUS_OPTIONS: EventStatus[] = ALL_EVENT_STATUSES;

// Elegível para reativação promocional: evento passou há mais de 1 mês. A partir
// daí o botão fica visível permanentemente (sem janela de expiração).
function isPromoEligible(event_date?: string): boolean {
  if (!event_date) return false;
  const end = new Date(`${String(event_date).slice(0, 10)}T23:59:59-03:00`);
  if (Number.isNaN(end.getTime())) return false;
  const plus1m = new Date(end);
  plus1m.setMonth(plus1m.getMonth() + 1);
  return Date.now() > plus1m.getTime();
}

// Chave de ordenação: envio mais recente primeiro; rascunhos usam a criação.
function sortKey(e: PartyEvent): number {
  const d = e.submitted_at || e.created_at || '';
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export default function ClientsPage() {
  // ISOLAMENTO MULTI-CONTA: só os dados da decoradora logada. Nunca chamar
  // esses hooks sem o id — sem filtro, a API devolve dados de TODAS as contas.
  const { decorator } = useAuthStore();
  const { events, isLoading, mutate } = usePartyEvents(decorator?.id);
  const { clients } = useClients(decorator?.id);
  const { decorators } = useDecorators();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<PartyEvent['status']>>(new Set());
  const [monthFilter, setMonthFilter] = useState(''); // 'YYYY-MM', vazio = todos os períodos
  const { addNotification } = useNotificationStore();

  // Evento em preview (abre o documento antes de gerar o PDF).
  const [previewEvent, setPreviewEvent] = useState<PartyEvent | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Histórico de mensagens promocionais (para o selinho de "já enviado" e a
  // linha "última mensagem aberta em" no modal). Recarrega após cada envio.
  const [promoMsgs, setPromoMsgs] = useState<ClientPromoMessage[]>([]);
  const loadPromo = () => { getPromoMessages().then(setPromoMsgs).catch(() => {}); };
  useEffect(() => { if (decorator?.id) loadPromo(); }, [decorator?.id]);
  // client_id -> data do ÚLTIMO envio (a lista vem ordenada desc).
  const lastPromoByClient = new Map<string, string>();
  for (const m of promoMsgs) if (!lastPromoByClient.has(m.client_id)) lastPromoByClient.set(m.client_id, m.sent_at);

  // Estado do modal de reativação promocional.
  const [promoModal, setPromoModal] = useState<{ event: PartyEvent; client: Client | null } | null>(null);
  const [promoPhone, setPromoPhone] = useState('');
  const [promoText, setPromoText] = useState('');
  const [promoSending, setPromoSending] = useState(false);

  const openPromoModal = (event: PartyEvent) => {
    const client = clients.find(c => c.id === event.client_id) || null;
    const nome = client?.name || event.client_name || '';
    const template = (decorator?.promo_message_template || '').trim() || defaultPromoTemplate(decorator?.name || '');
    setPromoModal({ event, client });
    setPromoPhone(client?.phone || event.phone || '');
    setPromoText(fillPromoTemplate(template, nome));
    setOpenMenuId(null);
  };

  const handleSendPromo = async () => {
    if (!promoModal) return;
    const { event, client } = promoModal;
    const clientId = client?.id || event.client_id;
    if (!clientId) { addNotification('Sem cliente', 'Este evento não tem cliente vinculado.', true); return; }
    if (!isValidPromoPhone(promoPhone)) { addNotification('Telefone inválido', 'Informe um telefone válido (com DDD).', true); return; }
    setPromoSending(true);
    try {
      // Correção do número salva NO CADASTRO do cliente (não vale só p/ este envio).
      if (client && promoPhone.trim() !== (client.phone || '').trim()) {
        await saveClient({ ...client, phone: promoPhone.trim() });
      }
      // Abre o WhatsApp em nova aba e REGISTRA o envio (link aberto, não entregue).
      window.open(promoWhatsappUrl(promoPhone, promoText), '_blank', 'noopener,noreferrer');
      await sendPromoMessage(clientId, promoPhone.trim(), promoText);
      loadPromo();
      setPromoModal(null);
    } catch (err: any) {
      addNotification('Erro ao registrar', err.message || 'Não foi possível registrar o envio.', true);
    } finally {
      setPromoSending(false);
    }
  };

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

  // Confirmar: um clique, sem modal. IRREVERSÍVEL (não há caminho de volta).
  const handleConfirm = async (e: PartyEvent) => {
    setBusyId(e.id);
    try {
      await confirmPartyEvent(e.id);
      addNotification('Evento confirmado', `"${e.client_name}" está confirmado — preparando a montagem.`);
      // PDF logístico é gerado AO CONFIRMAR (não no envio): é aqui que o
      // orçamento vira evento de verdade e a montagem começa a ser preparada.
      try {
        await generateLogisticsPDF({ ...e, status: EVENT_STATUS.CONFIRMADO });
      } catch (pdfErr) {
        console.error('Falha ao gerar PDF logístico na confirmação:', pdfErr);
        addNotification('PDF não gerado', 'O evento foi confirmado, mas o PDF logístico falhou. Baixe pelo Calendário.', true);
      }
      mutate();
    } catch (err: any) {
      addNotification('Erro ao confirmar', err.message || 'Não foi possível confirmar.', true);
    } finally {
      setBusyId(null);
    }
  };

  // Cancelar: destrutivo → passo de confirmação. Sai das contagens/Calendário.
  const handleCancel = async (e: PartyEvent) => {
    setOpenMenuId(null);
    if (!confirm(`Cancelar o evento de "${e.client_name || e.theme}"? Ele sai das contagens do Dashboard e do Calendário. Esta ação não pode ser desfeita.`)) return;
    setBusyId(e.id);
    try {
      await cancelPartyEvent(e.id);
      addNotification('Evento cancelado', `"${e.client_name || e.theme}" foi cancelado.`);
      mutate();
    } catch (err: any) {
      addNotification('Erro ao cancelar', err.message || 'Não foi possível cancelar.', true);
    } finally {
      setBusyId(null);
    }
  };

  // Descartar: apaga um link ainda NÃO preenchido (some da lista).
  const handleDiscard = async (e: PartyEvent) => {
    setOpenMenuId(null);
    if (!confirm(`Descartar este link não preenchido de "${e.theme}"? Ele será removido da lista.`)) return;
    setBusyId(e.id);
    try {
      await discardPartyEvent(e.id);
      addNotification('Link descartado', 'O link não preenchido foi removido.');
      mutate();
    } catch (err: any) {
      addNotification('Erro ao descartar', err.message || 'Não foi possível descartar.', true);
    } finally {
      setBusyId(null);
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

  // Rascunhos de link (Aguardando preenchimento) ficam OCULTOS na visão padrão —
  // só aparecem quando a decoradora ativa o chip de filtro correspondente. Evita
  // que cliques de "Copiar link" não preenchidos poluam a lista de eventos reais.
  const showingDrafts = statusFilter.has(EVENT_STATUS.AGUARDANDO_PREENCHIMENTO);
  const filteredEvents = events
    .filter(e => {
      const es = effectiveStatus(e); // aplica a finalização automática por data
      if (es === EVENT_STATUS.AGUARDANDO_PREENCHIMENTO && !showingDrafts) return false;
      const matchesSearch = `${e.client_name} ${e.theme}`.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter.size === 0 || statusFilter.has(es);
      const matchesMonth = monthFilter === '' || (e.event_date?.slice(0, 7) === monthFilter);
      return matchesSearch && matchesStatus && matchesMonth;
    })
    // Do envio mais recente para o mais antigo (rascunhos pela data de criação).
    .sort((a, b) => sortKey(b) - sortKey(a));

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
          filteredEvents.map(event => {
            const es = effectiveStatus(event);
            const draft = isDraftLink(event);
            const badge = statusBadge(es);
            const canConfirm = es === EVENT_STATUS.AGUARDANDO_CONFIRMACAO;
            const canCancel = es === EVENT_STATUS.AGUARDANDO_CONFIRMACAO || es === EVENT_STATUS.CONFIRMADO;
            // Reativação: só para eventos passados (>1 mês). A seta é só para
            // eventos NÃO passados — os dois nunca convivem na mesma linha.
            const promo = isPromoEligible(event.event_date);
            const hasMenu = (canCancel || draft) && !promo;
            const promoClient = clients.find(c => c.id === event.client_id) || null;
            const promoPhoneVal = promoClient?.phone || event.phone || '';
            const promoPhoneOk = isValidPromoPhone(promoPhoneVal);
            const lastSent = event.client_id ? lastPromoByClient.get(event.client_id) : undefined;
            return (
            <tr key={event.id}>
              <td className="font-bold">{event.client_name || <span className="text-slate-400">(link não preenchido)</span>}</td>
              <td>{event.phone || '—'}</td>
              <td>{event.event_date ? formatDate(event.event_date) : '—'}</td>
              <td>
                <span className="category-pill">{event.theme}</span>
              </td>
              <td>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </td>
              <td className="font-bold">{formatCurrency(event.total_value)}</td>
              <td>
                <div className="flex gap-2" style={{ position: 'relative' }}>
                  {!draft && (
                    <Button variant="secondary" size="icon" title="Visualizar documento" onClick={() => setPreviewEvent(event)}>
                      <FileText className="w-4 h-4" />
                    </Button>
                  )}
                  {promo && (
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <Button
                        variant="secondary"
                        size="icon"
                        title={promoPhoneOk ? 'Enviar mensagem de reativação (WhatsApp)' : 'Cliente sem telefone cadastrado'}
                        disabled={!promoPhoneOk}
                        onClick={() => openPromoModal(event)}
                        style={lastSent ? { borderColor: '#059669', color: '#059669' } : undefined}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      {lastSent && (
                        <span
                          title={`Última mensagem aberta em ${formatDate(lastSent)}`}
                          style={{ position: 'absolute', top: -7, right: -7, background: '#059669', color: '#fff', fontSize: 9, fontWeight: 700, lineHeight: 1.4, borderRadius: 8, padding: '0 5px', whiteSpace: 'nowrap' }}
                        >
                          {formatDate(lastSent)}
                        </span>
                      )}
                    </div>
                  )}
                  {canConfirm && (
                    <Button
                      variant="primary"
                      size="icon"
                      title="Confirmar evento"
                      disabled={busyId === event.id}
                      onClick={() => handleConfirm(event)}
                    >
                      <CheckSquare className="w-4 h-4" />
                    </Button>
                  )}
                  {hasMenu && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        title="Mais ações"
                        disabled={busyId === event.id}
                        onClick={() => setOpenMenuId(openMenuId === event.id ? null : event.id)}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      {openMenuId === event.id && (
                        <>
                          {/* clique fora fecha o menu */}
                          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setOpenMenuId(null)} />
                          <div className="row-menu" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 30, background: 'white', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 180, padding: 6 }}>
                            {canCancel && (
                              <button type="button" className="row-menu-item" onClick={() => handleCancel(event)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, color: '#dc2626', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                <XCircle className="w-4 h-4" /> Cancelar evento
                              </button>
                            )}
                            {draft && (
                              <button type="button" className="row-menu-item" onClick={() => handleDiscard(event)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', fontSize: 13, fontWeight: 600, color: '#64748b', background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                                <Trash2 className="w-4 h-4" /> Descartar link
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
            );
          })
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
            {/* Cabeçalho: imagem única da decoradora (avatar), igual ao PDF */}
            <div className="quote-doc-header">
              {previewOwner?.avatar_url ? (
                <img
                  className="quote-doc-logo"
                  src={previewOwner.avatar_url}
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

      {/* Modal de reativação promocional (WhatsApp, um a um) */}
      <Modal
        isOpen={!!promoModal}
        onClose={() => setPromoModal(null)}
        title="Mensagem de reativação"
        className="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPromoModal(null)}>Cancelar</Button>
            <Button icon={MessageCircle} isLoading={promoSending} onClick={handleSendPromo}>Enviar</Button>
          </>
        }
      >
        {promoModal && (
          <div className="space-y-4">
            <div>
              <Input
                label="Telefone do Cliente"
                value={promoPhone}
                onChange={(e) => setPromoPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
                Se corrigir o número, ele é salvo no cadastro do cliente.
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {(() => {
                const last = promoModal.client?.id ? lastPromoByClient.get(promoModal.client.id) : undefined;
                return last ? `Última mensagem aberta em ${formatDate(last)}` : 'Nenhuma mensagem enviada ainda';
              })()}
            </div>

            <div className="form-group">
              <label className="form-label">Mensagem</label>
              <textarea
                className="form-input"
                rows={5}
                value={promoText}
                onChange={(e) => setPromoText(e.target.value)}
                style={{ resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>

            <p style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', margin: 0 }}>
              ⚠️ O sistema registra que o link foi <strong>aberto</strong>, não que a mensagem foi entregue. Disparo promocional em volume pelo WhatsApp pessoal pode levar o número a ser bloqueado — espace os envios.
            </p>
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
