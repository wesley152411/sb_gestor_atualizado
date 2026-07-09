'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Package, Phone, User, Download, Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useCalendarEvents } from '@/hooks/swr-hooks';
import { useNotificationStore } from '@/stores/notification-store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { generateLogisticsPDF } from '@/lib/pdf-generator';
import type { RentalOrder, PartyEvent } from '@/types';

type ViewMode = 'month' | 'week' | 'day';

interface DayBucket {
  rentalOrders: RentalOrder[];
  partyEvents: PartyEvent[];
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

function statusVariant(status?: string): 'success' | 'warning' | 'neutral' {
  if (status === 'Confirmado') return 'success';
  if (status === 'Pendente') return 'warning';
  return 'neutral';
}

export default function CalendarPage() {
  const router = useRouter();
  const { decorator } = useAuthStore();
  const { addNotification } = useNotificationStore();

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
        bucket = { rentalOrders: [], partyEvents: [] };
        map.set(key, bucket);
      }
      return bucket;
    };
    [current, prev, next].forEach(({ rentalOrders, partyEvents }) => {
      rentalOrders.forEach((o) => {
        const key = toDateKey(o.event_date);
        if (key) getBucket(key).rentalOrders.push(o);
      });
      partyEvents.forEach((e) => {
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
                const events: { label: string; variant: 'marketplace' | 'internal' }[] = [
                  ...(bucket?.rentalOrders.map((o) => ({
                    label: `Marketplace · ${o.items?.[0]?.name || 'Locação'}`,
                    variant: 'marketplace' as const,
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
          <span className="calendar-legend-item"><span className="calendar-legend-dot marketplace" />Marketplace</span>
          <span className="calendar-legend-item"><span className="calendar-legend-dot internal" />Eventos Internos</span>
          <span className="calendar-legend-item"><span className="calendar-legend-dot alert" />Atenção/Atraso</span>
        </div>
      </div>

      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatFullDate(selectedDay) : ''}
      >
        <DayDetails bucket={selectedBucket} decoratorId={decorator?.id} onDownloadPDF={handleDownloadPDF} />
      </Modal>
    </div>
  );
}

function formatFullDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} de ${MONTH_LABELS[m - 1]}, ${y}`;
}

function DayAgenda({ date, bucket, decoratorId, onDownloadPDF }: {
  date: Date;
  bucket?: DayBucket;
  decoratorId?: string;
  onDownloadPDF: (event: PartyEvent) => void;
}) {
  return (
    <div className="calendar-day-agenda">
      <h3 className="calendar-day-agenda-title">
        {date.getDate()} de {MONTH_LABELS[date.getMonth()]}, {date.getFullYear()}
      </h3>
      <DayDetails bucket={bucket} decoratorId={decoratorId} onDownloadPDF={onDownloadPDF} />
    </div>
  );
}

function DayDetails({ bucket, decoratorId, onDownloadPDF }: {
  bucket?: DayBucket;
  decoratorId?: string;
  onDownloadPDF: (event: PartyEvent) => void;
}) {
  return (
    <div className="space-y-4">
      {bucket?.rentalOrders.map((order) => {
        const isOwner = order.owner_id === decoratorId;
        const contact = isOwner ? order.renter : order.owner;
        return (
          <div key={order.id} className="calendar-detail-card">
            <div className="flex-row-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                {isOwner ? 'Marketplace · Sua peça alugada' : 'Marketplace · Você alugou'}
              </span>
              <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
            </div>
            <ul className="text-sm text-slate-700 space-y-1 mb-2">
              {order.items?.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <Package className="w-3.5 h-3.5 text-slate-400" />
                  {item.name} x{item.quantity}
                </li>
              ))}
            </ul>
            {contact && (
              <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{contact.name}</span>
                {contact.phone && (
                  <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{contact.phone}</span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {bucket?.partyEvents.map((event) => (
        <div key={event.id} className="calendar-detail-card">
          <div className="flex-row-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">Formulário de Festa</span>
            <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
          </div>
          <ul className="text-sm text-slate-700 space-y-1 mb-2">
            {event.items?.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                {item.name} x{item.quantity}
              </li>
            ))}
          </ul>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1 mb-3">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{event.client_name}</span>
            {event.phone && (
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{event.phone}</span>
            )}
          </div>
          <Button variant="secondary" size="sm" icon={Download} onClick={() => onDownloadPDF(event)}>
            Gerar PDF Logístico
          </Button>
        </div>
      ))}

      {!bucket?.rentalOrders.length && !bucket?.partyEvents.length && (
        <p className="text-sm text-slate-500 text-center py-4">Nenhuma locação nesta data.</p>
      )}
    </div>
  );
}
