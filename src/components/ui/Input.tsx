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
  ({ className, label, error, icon: Icon, type, style, ...props }, ref) => {
    // Campos de senha ganham um botão de olho para revelar o texto — importa para
    // quem digita sem conferir. Centralizado aqui: toda tela com type="password"
    // (login, cadastro, redefinição) herda o toggle.
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    // POSICIONAMENTO POR ESTILO INLINE, de propósito: as classes utilitárias
    // (.absolute, .top-1/2, .-translate-y-1/2, .pr-10 …) NÃO existem no globals.css
    // deste projeto — por isso os ícones flutuavam para fora do campo. Inline não
    // depende dessas classes e funciona em todas as telas.
    const iconStyle: React.CSSProperties = {
      position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
      color: '#94a3b8', pointerEvents: 'none',
    };
    const inputStyle: React.CSSProperties = {
      ...style,
      ...(Icon ? { paddingLeft: 40 } : null),
      ...(isPassword ? { paddingRight: 40 } : null),
      ...(error ? { borderColor: '#ef4444' } : null),
    };

    return (
      <div className="form-group">
        {label && <label className="form-label" style={error ? { color: '#ef4444' } : undefined}>{label}</label>}
        <div style={{ position: 'relative' }}>
          {Icon && <Icon size={16} style={iconStyle} />}
          <input
            ref={ref}
            type={inputType}
            className={cn('form-input', className)}
            style={inputStyle}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              tabIndex={-1}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', color: '#94a3b8',
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
        </div>
        {error && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 6, display: 'block' }}>{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
