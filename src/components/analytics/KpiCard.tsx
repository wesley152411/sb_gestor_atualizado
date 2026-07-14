'use client';

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

/* Variantes de cor para o ícone do KPI */
const iconVariants = {
  emerald: 'bg-emerald-100 text-emerald-600',
  indigo: 'bg-brand-100 text-brand-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
} as const;

const trendColors = {
  up: 'text-emerald-600',
  down: 'text-red-500',
};

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  variant?: keyof typeof iconVariants;
  trend?: { value: string; direction: 'up' | 'down' };
  className?: string;
}

export function KpiCard({ title, value, icon: Icon, variant = 'indigo', trend, className = '' }: KpiCardProps) {
  return (
    <div className={`group relative bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-500 font-medium">{title}</span>
          <span className="text-2xl font-extrabold text-slate-800 tracking-tight">{value}</span>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-semibold ${trendColors[trend.direction]}`}>
              {trend.direction === 'up' ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              <span>{trend.value}</span>
            </div>
          )}
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconVariants[variant]} transition-transform group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
