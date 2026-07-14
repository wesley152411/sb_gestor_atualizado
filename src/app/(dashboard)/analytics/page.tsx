'use client';

import { CalendarDays, DollarSign, Package, AlertTriangle, Truck } from 'lucide-react';
import { KpiCard } from '@/components/analytics/KpiCard';
import { FinancialChart, ThemesChart, VolumeChart } from '@/components/analytics/Charts';
import { useAuthStore } from '@/stores/auth-store';
import { usePartyEvents, useInventory } from '@/hooks/swr-hooks';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { PartyEvent } from '@/types';

// Somente contratos fechados/entregues contam como receita real —
// "Pendente" é apenas orçamento, ainda não é uma venda confirmada.
const REVENUE_STATUSES: PartyEvent['status'][] = ['Confirmado', 'Finalizado'];

function monthKey(dateStr?: string): string {
  return dateStr ? dateStr.slice(0, 7) : '';
}

export default function AnalyticsPage() {
  const { decorator } = useAuthStore();
  const { events, isLoading: isEventsLoading } = usePartyEvents(decorator?.id);
  const { items: inventory, isLoading: isInventoryLoading } = useInventory(decorator?.id);
  const [monthFilter, setMonthFilter] = useState(''); // 'YYYY-MM', vazio = todos os períodos

  const isLoading = isEventsLoading || isInventoryLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-brand-200 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  // Custo real por peça, cadastrado no Acervo (itens excluídos depois de usados
  // num evento não têm custo disponível e são ignorados no cálculo de custo).
  const inventoryCostMap = new Map(inventory.map((i) => [i.id, Number(i.internal_cost) || 0]));

  const eventCost = (event: PartyEvent) =>
    (event.items || []).reduce((sum, item) => {
      const unitCost = inventoryCostMap.get(item.id);
      return unitCost !== undefined ? sum + unitCost * item.quantity : sum;
    }, 0);

  // --- KPI Calculations (respeitam o filtro de período) ---
  const revenueEvents = events.filter((e) =>
    REVENUE_STATUSES.includes(e.status) &&
    (monthFilter === '' || monthKey(e.event_date) === monthFilter)
  );

  const totalRevenue = revenueEvents.reduce((sum, e) => sum + Number(e.total_value), 0);
  const totalCost = revenueEvents.reduce((sum, e) => sum + eventCost(e), 0);
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
  const avgTicket = revenueEvents.length > 0 ? totalRevenue / revenueEvents.length : 0;

  const themeCounts = revenueEvents.reduce((acc, e) => {
    acc[e.theme] = (acc[e.theme] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let topTheme = 'Nenhum';
  let maxCount = 0;
  for (const [theme, count] of Object.entries(themeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topTheme = theme;
    }
  }

  // --- Chart Data: últimos 6 meses reais (independente do filtro de período,
  // que serve só para recortar os KPIs acima) ---
  const now = new Date();
  const monthBuckets = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  const eventsByMonth = monthBuckets.map(({ key }) =>
    events.filter((e) => REVENUE_STATUSES.includes(e.status) && monthKey(e.event_date) === key)
  );

  const financialLabels = monthBuckets.map((b) => b.label);
  const revenueData = eventsByMonth.map((evts) => evts.reduce((sum, e) => sum + Number(e.total_value), 0));
  const costData = eventsByMonth.map((evts) => evts.reduce((sum, e) => sum + eventCost(e), 0));
  const volumeData = eventsByMonth.map((evts) => evts.length);

  const themeLabels = Object.keys(themeCounts).slice(0, 4);
  const themeData = Object.values(themeCounts).slice(0, 4);
  const finalThemeLabels = themeLabels.length > 0 ? themeLabels : ['Vazio'];
  const finalThemeData = themeData.length > 0 ? themeData : [1];

  // --- Dados para tabela e logística (design da branch de UI) ---
  const upcomingEvents = [...events]
    .filter(e => new Date(e.event_date) >= now)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 5);

  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const logisticsEvents = events.filter(e => {
    const d = new Date(e.event_date);
    return d >= now && d <= in48h;
  });

  const getPaymentStatus = (status: string) => {
    if (status === 'Confirmado') return { label: 'Pago', variant: 'success' as const };
    if (status === 'Pendente') return { label: 'Pendente', variant: 'warning' as const };
    return { label: 'Atrasado', variant: 'danger' as const };
  };

  return (
    <div className="animate-fade-in">
      {/* Cabeçalho com filtro de mês */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dashboard Analítico</h1>
          <p className="text-sm text-slate-400 mt-1">Acompanhe métricas de desempenho, logística e conflitos de estoque.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="form-input month-filter-input"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            aria-label="Filtrar por mês do evento"
          />
          {monthFilter !== '' && (
            <button type="button" className="clients-clear-filters" onClick={() => setMonthFilter('')}>
              Ver todos os períodos
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards — dados reais (sócio) + visual novo (UI branch) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <KpiCard
          title="Receita Total"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          variant="emerald"
          trend={{ value: `Margem: ${margin}%`, direction: totalProfit >= 0 ? 'up' : 'down' }}
        />
        <KpiCard
          title="Lucro Líquido"
          value={formatCurrency(totalProfit)}
          icon={TrendingUp ?? CalendarDays}
          variant="indigo"
          trend={{ value: `Ticket médio: ${formatCurrency(avgTicket)}`, direction: 'up' }}
        />
        <KpiCard
          title="Eventos Confirmados"
          value={String(revenueEvents.length)}
          icon={CalendarDays}
          variant="amber"
        />
        <KpiCard
          title="Tema Mais Pedido"
          value={topTheme}
          icon={Package}
          variant="red"
        />
      </div>

      {/* Tabela de Próximos Eventos + Logística (design da branch de UI) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Tabela */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-800">Próximos Eventos</h3>
            <p className="text-xs text-slate-400 mt-0.5">Seus 5 eventos mais próximos</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Data</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tema</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {upcomingEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                      Nenhum evento agendado
                    </td>
                  </tr>
                ) : (
                  upcomingEvents.map((evt) => {
                    const payment = getPaymentStatus(evt.status);
                    return (
                      <tr key={evt.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm font-semibold text-slate-700">{evt.client_name}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">{formatDate(evt.event_date)}</td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600">{evt.theme}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm font-semibold text-slate-700">{formatCurrency(evt.total_value)}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={payment.variant}>{payment.label}</Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quadro de Logística */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-brand-500" />
              <h3 className="text-base font-bold text-slate-800">Logística 48h</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Entregas e montagens pendentes</p>
          </div>
          <div className="p-4 flex flex-col gap-3">
            {logisticsEvents.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400">
                Nenhuma entrega programada
              </div>
            ) : (
              logisticsEvents.map((evt) => (
                <div key={evt.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-brand-200 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-slate-700">{evt.client_name}</span>
                    <Badge variant={evt.status === 'Confirmado' ? 'success' : 'warning'}>
                      {evt.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">
                    📍 {evt.address || 'Endereço não informado'}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>📅 {formatDate(evt.event_date)}</span>
                    <span>🕐 Montagem: {evt.setup_time || '--:--'}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {evt.items?.length || 0} itens • {evt.items?.reduce((s, i) => s + i.quantity, 0) || 0} peças
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Gráficos com dados reais do sócio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-base font-bold text-slate-800 mb-1">Saúde Financeira</h3>
          <p className="text-xs text-slate-400 mb-4">Comparativo de faturamento vs custos reais (6 meses)</p>
          <div className="h-[260px]">
            <FinancialChart labels={financialLabels} revenue={revenueData} costs={costData} />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-base font-bold text-slate-800 mb-1">Temas Mais Locados</h3>
          <p className="text-xs text-slate-400 mb-4">Distribuição por estilo de festa</p>
          <div className="h-[260px]">
            <ThemesChart labels={finalThemeLabels} dataValues={finalThemeData} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1">Volume de Eventos</h3>
        <p className="text-xs text-slate-400 mb-4">Quantidade de festas realizadas por mês</p>
        <div className="h-[220px]">
          <VolumeChart labels={financialLabels} dataValues={volumeData} />
        </div>
      </div>
    </div>
  );
}
