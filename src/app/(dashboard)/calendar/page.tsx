'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Package, Phone, Download, Plus,
  CheckCircle2, Clock, Sparkles, Cylinder, LayoutPanelLeft, Grip, Table,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCalendarEvents } from '@/hooks/swr-hooks';
import { useNotificationStore } from '@/stores/notification-store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import { EVENT_STATUS, effectiveStatus, showsInCalendar } from '@/lib/event-status';
import { generateLogisticsPDF } from '@/lib/pdf-generator';
import type { RentalOrder, PartyEvent } from '@/types';

type ViewMode = 'month' | 'week' | 'day';

// Cada locação vira DOIS compromissos: retirada (no pickup_date) e devolução (no
// return_date), cada um com texto próprio por lado (locadora/locatária).
interface RentalCommitment {
  order: RentalOrder;
  kind: 'pickup' | 'return';
}
interface DayBucket {
  rentals: RentalCommitment[];
  partyEvents: PartyEvent[];
}

// Texto INEQUÍVOCO: diz o que fazer no dia sem abrir nada. Nomeia a contraparte.
function commitmentText(r: RentalCommitment, decoratorId?: string): { eyebrow: string; title: string } {
  const o = r.order;
  const isOwner = o.owner_id === decoratorId;
  const piece = o.items?.[0]?.name || 'peça';
  const other = isOwner ? (o.renter_name || 'a locatária') : (o.owner_name || 'a locadora');
  if (r.kind === 'pickup') {
    return isOwner
      ? { eyebrow: 'Retirada', title: `${other} retira ${piece}` }
      : { eyebrow: 'Retirada', title: `Retirar ${piece} de ${other}` };
  }
  return isOwner
    ? { eyebrow: 'Devolução', title: `${other} devolve ${piece}` }
    : { eyebrow: 'Devolução', title: `Devolver ${piece} para ${other}` };
}

const WEEKDAY_LABELS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function toDateKey(dateStr?: string): string {
  if (!dateStr) return '';
  return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthGridDays(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) =>
    new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
}

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

type StatusKey = 'success' | 'warning' | 'neutral';

function statusMeta(status?: string): { key: StatusKey; Icon: LucideIcon; label: string } {
  if (status === EVENT_STATUS.CONFIRMADO) return { key: 'success', Icon: CheckCircle2, label: status };
  if (status === 'Devolvido') return { key: 'success', Icon: CheckCircle2, label: 'Devolvido' };
  if (status === EVENT_STATUS.AGUARDANDO_CONFIRMACAO) return { key: 'warning', Icon: Clock, label: status };
  return { key: 'neutral', Icon: Clock, label: status || '—' }; // Finalizado / Cancelado / A retirar / etc.
}

// Give each item a more meaningful glyph than a generic box, inferred from its
// name. Falls back to Package when nothing matches.
function iconForItem(name?: string): LucideIcon {
  const n = (name || '').toLowerCase();
  if (n.includes('mesa')) return Table;
  if (n.includes('painel') || n.includes('painéis') || n.includes('paineis')) return LayoutPanelLeft;
  if (n.includes('cilindro') || n.includes('conjunto')) return Cylinder;
  if (n.includes('tapete') || n.includes('grama')) return Grip;
  if (n.includes('alga') || n.includes('flor') || n.includes('planta')) return Sparkles;
  return Package;
}

export default function CalendarPage() {
  const router = useRouter();
  const { decorator } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  // Vindo do acervo (peça bloqueada): /calendario?date=YYYY-MM-DD abre o DIA certo,
  // não só o mês. Ajusta o mês âncora e abre o modal daquele dia. Lê do
  // window.location (client-only) — evita a exigência de Suspense do useSearchParams.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get('date');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split('-').map(Number);
      setAnchorDate(new Date(y, m - 1, day));
      setSelectedDay(d);
    }
  }, []);

  // Marcar devolvido (só a locadora vê o botão). Atualiza os 3 meses em cache.
  const handleMarkReturned = async (orderId: string) => {
    setReturningId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Não foi possível confirmar a devolução.');
      }
      addNotification('Devolução confirmada', 'A peça voltou ao seu acervo.');
      current.mutate(); prev.mutate(); next.mutate();
    } catch (e: any) {
      addNotification('Erro', e.message || 'Não foi possível confirmar a devolução.', true);
    } finally {
      setReturningId(null);
    }
  };

  // Fetch the anchor month plus neighbors, so week/day views never miss data
  // when they straddle a month boundary. Each call is independently SWR-cached.
  const prevMonthDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1);
  const nextMonthDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);

  const current = useCalendarEvents(decorator?.id, anchorDate.getFullYear(), anchorDate.getMonth() + 1);
  const prev = useCalendarEvents(decorator?.id, prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1);
  const next = useCalendarEvents(decorator?.id, nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1);

  const isLoading = current.isLoading || prev.isLoading || next.isLoading;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, DayBucket>();
    const getBucket = (key: string) => {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { rentals: [], partyEvents: [] };
        map.set(key, bucket);
      }
      return bucket;
    };
    // Dedupe: a mesma locação vem em vários fetches de mês (quando cruza a virada).
    const seenCommit = new Set<string>();
    [current, prev, next].forEach(({ rentalOrders, partyEvents }) => {
      rentalOrders.forEach((o) => {
        const pushCommit = (dateStr: string | undefined, kind: 'pickup' | 'return') => {
          const key = toDateKey(dateStr);
          if (!key) return;
          const sig = `${o.id}:${kind}`;
          if (seenCommit.has(sig)) return;
          seenCommit.add(sig);
          getBucket(key).rentals.push({ order: o, kind });
        };
        pushCommit(o.pickup_date, 'pickup');
        pushCommit(o.return_date, 'return');
      });
      partyEvents.forEach((e) => {
        // Fora do Calendário: rascunho de link (sem data) e cancelado.
        if (!showsInCalendar(e)) return;
        const key = toDateKey(e.event_date);
        if (key) getBucket(key).partyEvents.push(e);
      });
    });
    return map;
  }, [current, prev, next]);

  const handleDownloadPDF = async (event: PartyEvent) => {
    try {
      await generateLogisticsPDF(event);
      addNotification('PDF Gerado', `Logística de ${event.client_name} baixada.`);
    } catch (err) {
      console.error('Falha ao gerar PDF logístico:', err);
      addNotification('Erro ao Gerar PDF', 'Não foi possível gerar o PDF logístico.', true);
    }
  };

  const handleDayClick = (date: Date) => {
    const key = dateKey(date);
    if (eventsByDay.has(key)) setSelectedDay(key);
  };

  const goToday = () => setAnchorDate(new Date());

  const goPrev = () => {
    if (viewMode === 'month') setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1));
    else if (viewMode === 'week') setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 7));
    else setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() - 1));
  };

  const goNext = () => {
    if (viewMode === 'month') setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1));
    else if (viewMode === 'week') setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + 7));
    else setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + 1));
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'day') {
      return `${anchorDate.getDate()} de ${MONTH_LABELS[anchorDate.getMonth()]}, ${anchorDate.getFullYear()}`;
    }
    if (viewMode === 'week') {
      const days = getWeekDays(anchorDate);
      const start = days[0];
      const end = days[6];
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} ${MONTH_LABELS[start.getMonth()]} ${start.getFullYear()}`;
      }
      return `${start.getDate()} ${MONTH_LABELS[start.getMonth()]} - ${end.getDate()} ${MONTH_LABELS[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${MONTH_LABELS[anchorDate.getMonth()]} ${anchorDate.getFullYear()}`;
  }, [viewMode, anchorDate]);

  const selectedBucket = selectedDay ? eventsByDay.get(selectedDay) : undefined;
  const today = new Date();

  const gridDays = viewMode === 'week' ? getWeekDays(anchorDate) : getMonthGridDays(anchorDate);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendário de Disponibilidade</h1>
          <p className="page-subtitle">
            Acompanhe as datas com peças e kits comprometidos no Marketplace e nos seus eventos.
          </p>
        </div>
      </div>

      <div className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="calendar-toolbar-left">
            <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="calendar-toolbar-label">{headerLabel}</span>
            <Button variant="ghost" size="icon" onClick={goNext} aria-label="Próximo">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="sm" onClick={goToday}>Hoje</Button>
          </div>
          <div className="calendar-toolbar-right">
            <div className="acervo-segmented-control">
              {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`acervo-segment ${viewMode === mode ? 'active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode === 'month' ? 'Mês' : mode === 'week' ? 'Semana' : 'Dia'}
                </button>
              ))}
            </div>
            <Button icon={Plus} onClick={() => router.push('/party-form')}>Novo Evento</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Carregando calendário...</div>
        ) : viewMode === 'day' ? (
          <DayAgenda
            date={anchorDate}
            bucket={eventsByDay.get(dateKey(anchorDate))}
            decoratorId={decorator?.id}
            onDownloadPDF={handleDownloadPDF}
            onMarkReturned={handleMarkReturned}
            returningId={returningId}
          />
        ) : (
          <>
            <div className="calendar-weekday-header">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className={`calendar-grid ${viewMode === 'week' ? 'calendar-grid-week' : ''}`}>
              {gridDays.map((date) => {
                const key = dateKey(date);
                const bucket = eventsByDay.get(key);
                const outside = date.getMonth() !== anchorDate.getMonth();
                const isToday = isSameDay(date, today);
                const events: { label: string; variant: 'pickup' | 'return' | 'internal' }[] = [
                  ...(bucket?.rentals.map((r) => ({
                    label: `${r.kind === 'pickup' ? 'Retirar' : 'Devolver'} · ${r.order.items?.[0]?.name || 'peça'}`,
                    variant: r.kind,
                  })) || []),
                  ...(bucket?.partyEvents.map((e) => ({
                    label: e.theme || e.client_name || 'Evento',
                    variant: 'internal' as const,
                  })) || []),
                ];
                const visibleEvents = viewMode === 'week' ? events : events.slice(0, 2);
                const overflow = events.length - visibleEvents.length;

                return (
                  <div
                    key={key}
                    className={`calendar-cell ${outside ? 'outside' : ''} ${isToday ? 'today' : ''} ${selectedDay === key ? 'selected' : ''} ${events.length ? 'has-events' : ''}`}
                    onClick={() => handleDayClick(date)}
                  >
                    <span className="calendar-cell-number">{date.getDate()}</span>
                    <div className="calendar-cell-events">
                      {visibleEvents.map((ev, idx) => (
                        <span key={idx} className={`calendar-pill calendar-pill-${ev.variant}`}>
                          {ev.label}
                        </span>
                      ))}
                      {overflow > 0 && <span className="calendar-pill-more">+{overflow} mais</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="calendar-legend">
          <span className="calendar-legend-item"><span className="calendar-legend-dot pickup" />Retirada (locação)</span>
          <span className="calendar-legend-item"><span className="calendar-legend-dot return" />Devolução (locação)</span>
          <span className="calendar-legend-item"><span className="calendar-legend-dot internal" />Eventos internos</span>
        </div>
      </div>

      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatFullDate(selectedDay) : ''}
        footer={<Button onClick={() => setSelectedDay(null)}>Fechar Visualização</Button>}
      >
        <DayDetails bucket={selectedBucket} decoratorId={decorator?.id} onDownloadPDF={handleDownloadPDF} onMarkReturned={handleMarkReturned} returningId={returningId} />
      </Modal>
    </div>
  );
}

function formatFullDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} de ${MONTH_LABELS[m - 1]}, ${y}`;
}

function DayAgenda({ date, bucket, decoratorId, onDownloadPDF, onMarkReturned, returningId }: {
  date: Date;
  bucket?: DayBucket;
  decoratorId?: string;
  onDownloadPDF: (event: PartyEvent) => void;
  onMarkReturned: (orderId: string) => void;
  returningId: string | null;
}) {
  return (
    <div className="calendar-day-agenda">
      <h3 className="calendar-day-agenda-title">
        {date.getDate()} de {MONTH_LABELS[date.getMonth()]}, {date.getFullYear()}
      </h3>
      <DayDetails bucket={bucket} decoratorId={decoratorId} onDownloadPDF={onDownloadPDF} onMarkReturned={onMarkReturned} returningId={returningId} />
    </div>
  );
}

function DayDetails({ bucket, decoratorId, onDownloadPDF, onMarkReturned, returningId }: {
  bucket?: DayBucket;
  decoratorId?: string;
  onDownloadPDF: (event: PartyEvent) => void;
  onMarkReturned: (orderId: string) => void;
  returningId: string | null;
}) {
  const isEmpty = !bucket?.rentals.length && !bucket?.partyEvents.length;

  return (
    <div className="detail-list">
      {bucket?.rentals.map((r) => {
        const order = r.order;
        const isOwner = order.owner_id === decoratorId;
        const { eyebrow, title } = commitmentText(r, decoratorId);
        const isReturned = order.status === 'devolvido';
        // "Devolvido" SÓ na locadora, no compromisso de DEVOLUÇÃO, enquanto ativo.
        const showReturnBtn = isOwner && r.kind === 'return' && order.status === 'ativo';
        return (
          <DetailCard
            key={`${order.id}:${r.kind}`}
            eyebrow={`Marketplace · ${eyebrow}`}
            title={title}
            status={isReturned ? 'Devolvido' : r.kind === 'return' ? 'A devolver' : 'A retirar'}
            items={order.items}
            amount={order.total_value}
            action={showReturnBtn ? (
              <Button size="sm" icon={CheckCircle2} onClick={() => onMarkReturned(order.id)} isLoading={returningId === order.id}>
                Devolvido
              </Button>
            ) : undefined}
          />
        );
      })}

      {bucket?.partyEvents.map((event) => (
        <DetailCard
          key={event.id}
          eyebrow="Formulário de Festa"
          title={event.client_name}
          status={effectiveStatus(event)}
          items={event.items}
          phone={event.phone}
          action={
            <Button variant="secondary" size="sm" icon={Download} onClick={() => onDownloadPDF(event)}>
              Gerar PDF Logístico
            </Button>
          }
        />
      ))}

      {isEmpty && (
        <p className="text-sm text-slate-500 text-center py-4">Nenhuma locação nesta data.</p>
      )}
    </div>
  );
}

function DetailCard({ eyebrow, title, status, items, phone, amount, action }: {
  eyebrow: string;
  title?: string;
  status?: string;
  items?: { name: string; quantity: number }[];
  phone?: string;
  amount?: number; // valor B2B da locação (Marketplace) — permitido aos dois lados
  action?: React.ReactNode;
}) {
  const { key, Icon: StatusIcon, label } = statusMeta(status);
  const hasFoot = !!phone || !!action || amount != null;

  return (
    <div className={`detail-card detail-card--${key}`}>
      <div className="detail-card-head">
        <div className="detail-card-headings">
          <span className="detail-card-eyebrow">{eyebrow}</span>
          {title && <span className="detail-card-title">{title}</span>}
        </div>
        <span className={`detail-status detail-status--${key}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {label}
        </span>
      </div>

      {items && items.length > 0 && (
        <ul className="detail-items">
          {items.map((item, idx) => {
            const ItemIcon = iconForItem(item.name);
            return (
              <li key={idx} className="detail-item">
                <span className="detail-item-icon"><ItemIcon className="w-3.5 h-3.5" /></span>
                <span className="detail-item-name">{item.name}</span>
                <span className="detail-item-qty">x{item.quantity}</span>
              </li>
            );
          })}
        </ul>
      )}

      {hasFoot && (
        <div className="detail-card-foot">
          {amount != null && (
            <span className="detail-amount-line">Locação B2B: <strong>{formatCurrency(amount)}</strong></span>
          )}
          {phone && (
            <span className="detail-contact-line"><Phone className="w-3.5 h-3.5" />{phone}</span>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
