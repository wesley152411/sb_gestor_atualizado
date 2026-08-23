'use client';

import { DollarSign, PieChart, TrendingUp, Users } from 'lucide-react';
import { KpiCard } from '@/components/analytics/KpiCard';
import { FinancialChart, ThemesChart, VolumeChart } from '@/components/analytics/Charts';
import { useAuthStore } from '@/stores/auth-store';
import { usePartyEvents, useInventory } from '@/hooks/swr-hooks';
import { formatCurrency } from '@/lib/utils';
import { countsAsRevenue } from '@/lib/event-status';
import { useState } from 'react';
import type { PartyEvent } from '@/types';

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
    return <div className="p-8 text-center text-slate-500">Carregando dashboard...</div>;
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
    countsAsRevenue(e) &&
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
    events.filter((e) => countsAsRevenue(e) && monthKey(e.event_date) === key)
  );

  const financialLabels = monthBuckets.map((b) => b.label);
  const revenueData = eventsByMonth.map((evts) => evts.reduce((sum, e) => sum + Number(e.total_value), 0));
  const costData = eventsByMonth.map((evts) => evts.reduce((sum, e) => sum + eventCost(e), 0));
  const volumeData = eventsByMonth.map((evts) => evts.length);

  const themeLabels = Object.keys(themeCounts).slice(0, 4);
  const themeData = Object.values(themeCounts).slice(0, 4);
  const finalThemeLabels = themeLabels.length > 0 ? themeLabels : ['Vazio'];
  const finalThemeData = themeData.length > 0 ? themeData : [1];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Analítico</h1>
          <p className="page-subtitle">Acompanhe as métricas de desempenho do seu acervo e eventos.</p>
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

      <div className="kpi-grid">
        <KpiCard
          title="Faturamento Bruto"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
          variant="emerald"
        />
        <KpiCard
          title="Margem de Lucro"
          value={`${margin}%`}
          icon={TrendingUp}
          variant="indigo"
        />
        <KpiCard
          title="Ticket Médio"
          value={formatCurrency(avgTicket)}
          icon={PieChart}
          variant="amber"
        />
        <KpiCard
          title="Tema em Alta"
          value={topTheme}
          icon={Users}
          variant="red"
        />
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Saúde Financeira</h3>
            <p className="chart-card-subtitle">Comparativo de faturamento vs custos reais (6 meses)</p>
          </div>
          <div className="chart-wrapper">
            <FinancialChart labels={financialLabels} revenue={revenueData} costs={costData} />
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Temas Mais Locados</h3>
            <p className="chart-card-subtitle">Distribuição por estilo de festa</p>
          </div>
          <div className="chart-wrapper">
            <ThemesChart labels={finalThemeLabels} dataValues={finalThemeData} />
          </div>
        </div>

        <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">Volume de Eventos</h3>
            <p className="chart-card-subtitle">Quantidade de festas realizadas por mês</p>
          </div>
          <div className="chart-wrapper" style={{ height: '220px' }}>
            <VolumeChart labels={financialLabels} dataValues={volumeData} />
          </div>
        </div>
      </div>
    </div>
  );
}
