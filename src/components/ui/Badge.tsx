'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: ReactNode;
  variant?: 'public' | 'private' | 'kit' | 'rented' | 'success' | 'warning' | 'danger' | 'neutral';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  const variants = {
    public: 'bg-emerald-500/90 text-white',
    private: 'bg-slate-500/90 text-white',
    kit: 'bg-indigo-600/90 text-white',
    rented: 'bg-amber-500/90 text-white',
    success: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700',
    danger: 'bg-red-100 text-red-700',
    neutral: 'bg-slate-100 text-slate-700',
  };

  return (
    <span
      className={cn(
        'px-2.5 py-0.5 rounded-md text-xs font-bold whitespace-nowrap',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
