'use client';

import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, Eye, EyeOff } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon: Icon, type, ...props }, ref) => {
    // Campos de senha ganham um botão de olho para revelar o texto — importa para
    // quem tem dificuldade de digitar sem conferir. Centralizado aqui: toda tela
    // com <Input type="password"> (login, cadastro, redefinição) herda o toggle.
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
      <div className="form-group">
        {label && <label className="form-label" style={error ? { color: '#ef4444' } : undefined}>{label}</label>}
        <div className="relative">
          {Icon && (
            <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          )}
          <input
            ref={ref}
            type={inputType}
            className={cn(
              'form-input',
              Icon && 'pl-10',
              isPassword && 'pr-10',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {error && <span className="text-xs text-red-500 mt-1.5 block font-medium">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
