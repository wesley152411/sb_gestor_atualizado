'use client';

import { forwardRef, useRef, CSSProperties } from 'react';
import { Input } from './Input';
import { formatPhoneMask, sanitizePhoneDigits } from '@/lib/utils';

interface PhoneInputProps {
  label?: string;
  error?: string;
  value: string;                 // guarda SEMPRE só dígitos (normalizado)
  onChange: (digits: string) => void;
  style?: CSSProperties;
  required?: boolean;
  placeholder?: string;
}

// Campo de telefone com máscara BR progressiva: a pessoa digita só números e o
// campo formata sozinho — (31) 3456-7890 ou (31) 98765-4321. Aceita colagem de
// número já formatado, trata backspace no separador e guarda só dígitos no state.
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, ...rest }, ref) => {
    const prevLen = useRef(0);
    const digits = sanitizePhoneDigits(value).slice(0, 11);
    const display = formatPhoneMask(digits);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      let next = sanitizePhoneDigits(raw).slice(0, 11);
      // Backspace sobre um separador: o texto encurtou mas os dígitos não
      // mudaram → apaga um dígito (senão o cursor "trava" no separador).
      if (raw.length < prevLen.current && next === digits) {
        next = next.slice(0, -1);
      }
      prevLen.current = formatPhoneMask(next).length;
      onChange(next);
    };

    return (
      <Input
        {...rest}
        ref={ref}
        type="tel"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
      />
    );
  }
);

PhoneInput.displayName = 'PhoneInput';
