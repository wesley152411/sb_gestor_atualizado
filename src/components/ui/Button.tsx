'use client';

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';

/* Variantes visuais do botão premium */
const variants = {
  primary: 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md hover:shadow-lg hover:from-brand-700 hover:to-brand-600 active:scale-[0.97]',
  secondary: 'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97]',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
  danger: 'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 active:scale-[0.97]',
} as const;

const sizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
  /* Botão quadrado com só ícone, usado no calendário */
  icon: 'p-2 text-sm',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  children?: React.ReactNode;
  /* Suporte ao padrão usado nas pages do sócio */
  icon?: LucideIcon;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, icon: Icon, isLoading, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={isLoading || props.disabled}
        className={`inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : Icon ? (
          <Icon className="w-4 h-4" />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
