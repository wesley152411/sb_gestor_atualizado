'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  isLoading,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'btn-base';
  
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };

  const sizes = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg',
    icon: 'btn-icon-sz',
  };

  const iconSize = size === 'sm' ? '14px' : size === 'lg' ? '18px' : '16px';

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span 
          style={{
            width: '16px',
            height: '16px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            display: 'inline-block',
            animation: 'spin 1s linear infinite'
          }}
        />
      ) : Icon && iconPosition === 'left' ? (
        <Icon 
          style={{ width: iconSize, height: iconSize, flexShrink: 0 }} 
        />
      ) : null}
      
      {children && <span>{children}</span>}
      
      {!isLoading && Icon && iconPosition === 'right' && (
        <Icon 
          style={{ width: iconSize, height: iconSize, flexShrink: 0 }} 
        />
      )}
    </button>
  );
}
