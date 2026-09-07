'use client';

import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes } from 'react';
import { useBloqueioDeEscrita } from '@/components/providers/AssinaturaProvider';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  isLoading?: boolean;
  /**
   * Marca o botão como AÇÃO DE ESCRITA. Em somente-leitura ele fica desabilitado
   * com o motivo no title, em vez de deixar a decoradora clicar e tomar erro.
   *
   * É cortesia de interface, não barreira: o servidor recusa de qualquer forma
   * (402 SUBSCRIPTION_READ_ONLY). Esquecer a marca em um botão degrada a
   * experiência; não abre buraco de segurança.
   */
  bloqueiaEmLeitura?: boolean;
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
  bloqueiaEmLeitura,
  title,
  ...props
}: ButtonProps) {
  const { bloqueado, motivo } = useBloqueioDeEscrita();
  const travado = Boolean(bloqueiaEmLeitura && bloqueado);
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
      disabled={disabled || isLoading || travado}
      title={travado ? motivo : title}
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
