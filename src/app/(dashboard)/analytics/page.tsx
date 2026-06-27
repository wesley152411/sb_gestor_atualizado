'use client';

import { DollarSign, PieChart, TrendingUp, Users } from 'lucide-react';
import { KpiCard } from '@/components/analytics/KpiCard';
import { FinancialChart, ThemesChart, VolumeChart } from '@/components/analytics/Charts';
import { useClients, usePartyEvents } from '@/hooks/swr-hooks';
import { formatCurrency } from '@/lib/utils';
import type { Client, PartyEvent } from '@/types';

export default function AnalyticsPage() {
  const { clients, isLoading: isClientsLoading } = useClients();
  const { events, isLoading: isEventsLoading } = usePartyEvents();

  const isLoading = isClientsLoading || isEventsLoading;

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Carregando dashboard...</div>;
  }

  // --- KPI Calculations ---
  const totalRevenue = events.reduce((sum, e) => sum + e.total_value, 0);
  const totalCost = totalRevenue * 0.35; // Simulated 35% cost
  const totalProfit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
  
  const themeCounts = events.reduce((acc, e) => {
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

  const avgTicket = events.length > 0 ? totalRevenue / events.length : 0;

  // --- Chart Data ---
  // Mock monthly data for charts based on total
  const financialLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
  const revenueData = [1200, 1900, 1500, 2200, 1800, totalRevenue];
  const costData = revenueData.map(r => r * 0.35);

  const themeLabels = Object.keys(themeCounts).slice(0, 4);
  const themeData = Object.values(themeCounts).slice(0, 4);
  
  // If no data, provide fallbacks for donut chart to look good
  const finalThemeLabels = themeLabels.length > 0 ? themeLabels : ['Vazio'];
  const finalThemeData = themeData.length > 0 ? themeData : [1];

  const volumeData = [1, 3, 2, 4, 2, events.length];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Analítico</h1>
          <p className="page-subtitle">Acompanhe as métricas de desempenho do seu acervo e eventos.</p>
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
            <p className="chart-card-subtitle">Comparativo de faturamento vs custos estimados (6 meses)</p>
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
