'use client';

import { useMemo, useState } from 'react';
import { DayPicker, type DayButtonProps, type NavProps } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Package, Phone, User, Download } from 'lucide-react';
import 'react-day-picker/style.css';
import { useAuthStore } from '@/stores/auth-store';
import { useCalendarEvents } from '@/hooks/swr-hooks';
import { useNotificationStore } from '@/stores/notification-store';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { generateLogisticsPDF } from '@/lib/pdf-generator';
import type { RentalOrder, PartyEvent } from '@/types';

function toDateKey(dateStr?: string): string {
  if (!dateStr) return '';
  return dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
}

function statusVariant(status?: string): 'success' | 'warning' | 'neutral' {
  if (status === 'Confirmado') return 'success';
  if (status === 'Pendente') return 'warning';
  return 'neutral';
}

interface DayBucket {
  rentalOrders: RentalOrder[];
  partyEvents: PartyEvent[];
}

export default function CalendarPage() {
  const { decorator } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth() + 1;

  const { rentalOrders, partyEvents, isLoading } = useCalendarEvents(decorator?.id, year, month);

  const handleDownloadPDF = async (event: PartyEvent) => {
    try {
      await generateLogisticsPDF(event);
      addNotification('PDF Gerado', `Logística de ${event.client_name} baixada.`);
    } catch (err) {
      console.error('Falha ao gerar PDF logístico:', err);
      addNotification('Erro ao Gerar PDF', 'Não foi possível gerar o PDF logístico.', true);
    }
  };

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
    rentalOrders.forEach((o) => {
      const key = toDateKey(o.event_date);
      if (key) getBucket(key).rentalOrders.push(o);
    });
    partyEvents.forEach((e) => {
      const key = toDateKey(e.event_date);
      if (key) getBucket(key).partyEvents.push(e);
    });
    return map;
  }, [rentalOrders, partyEvents]);

  const selectedBucket = selectedDay ? eventsByDay.get(selectedDay) : undefined;

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
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Carregando calendário...</div>
        ) : (
          <DayPicker
            locale={ptBR}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            showOutsideDays
            className="sb-calendar"
            modifiers={{
              booked: (date) => eventsByDay.has(
                `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              ),
            }}
            onDayClick={(date) => {
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              if (eventsByDay.has(key)) setSelectedDay(key);
            }}
            components={{
              DayButton: CalendarDayButton,
              Nav: CalendarNav,
            }}
          />
        )}
      </div>

      <Modal
        isOpen={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatDate(selectedDay) : ''}
      >
        <div className="space-y-4">
          {selectedBucket?.rentalOrders.map((order) => {
            const isOwner = order.owner_id === decorator?.id;
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

          {selectedBucket?.partyEvents.map((event) => (
            <div key={event.id} className="calendar-detail-card">
              <div className="flex-row-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                  Formulário de Festa
                </span>
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
              <Button
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={() => handleDownloadPDF(event)}
              >
                Gerar PDF Logístico
              </Button>
            </div>
          ))}

          {!selectedBucket?.rentalOrders.length && !selectedBucket?.partyEvents.length && (
            <p className="text-sm text-slate-500 text-center py-4">Nenhuma locação nesta data.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CalendarDayButton({ day, modifiers, ...props }: DayButtonProps) {
  return (
    <button {...props} type="button">
      {day.date.getDate()}
      {modifiers.booked && <span className="calendar-day-dot" />}
    </button>
  );
}

function CalendarNav({ onPreviousClick, onNextClick }: NavProps) {
  return (
    <div className="calendar-nav">
      <Button variant="ghost" size="icon" onClick={onPreviousClick} aria-label="Mês anterior">
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onNextClick} aria-label="Próximo mês">
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
