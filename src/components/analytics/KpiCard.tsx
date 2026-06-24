'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  variant?: 'emerald' | 'indigo' | 'amber' | 'red';
  className?: string;
}

export function KpiCard({ title, value, icon: Icon, variant = 'indigo', className }: KpiCardProps) {
  return (
    <div className={cn("kpi-card", className)}>
      <div className={cn("kpi-icon", variant)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <span className="kpi-value">{value}</span>
        <span className="kpi-label">{title}</span>
      </div>
    </div>
  );
}
