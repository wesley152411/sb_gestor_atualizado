'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { resetPassword } from '@/services/api';
import { captchaEnabled } from '@/lib/feature-flags';
import { CaptchaWidget } from '@/components/auth/CaptchaWidget';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const captchaRef = useRef<TurnstileInstance>(undefined);

  // Quando /auth/confirm rejeita um link de recuperação (expirado/já usado), ele
  // manda para cá com ?erro=link — mostramos o motivo e o formulário pede outro.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('erro') === 'link') {
      setIsError(true);
      setMessage('Seu link de recuperação expirou ou já foi usado. Informe seu e-mail para receber um novo.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (captchaEnabled && !captchaToken) {
      setIsError(true);
      setMessage('Complete a verificação de segurança antes de continuar.');
      return;
    }
    setIsLoading(true);

    const result = await resetPassword(email, captchaToken || undefined);

    // Reset a CADA tentativa — o token do Turnstile é de uso único.
    captchaRef.current?.reset();
    setCaptchaToken('');

    setMessage(result.message || '');
    setIsError(!result.success);
    setIsLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%)',
      padding: 20,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 440,
        boxShadow: '0 16px 50px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 50, height: 50, margin: '0 auto 16px' }}>
            <Logo size={50} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Recuperar Senha</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </p>
        </div>

        {message && (
          <div style={{
            background: isError ? '#fef2f2' : '#f0fdf4',
            border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
            color: isError ? '#dc2626' : '#16a34a',
            fontWeight: 600,
          }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Input
            label="E-mail da Conta"
            type="email"
            icon={Mail}
            placeholder="seuemail@empresa.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <CaptchaWidget
            ref={captchaRef}
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken('')}
          />

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading} style={{ marginTop: 8 }}>
            Enviar Link de Recuperação
          </Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#64748b' }}>
          Lembrou a senha?{' '}
          <Link href="/login" style={{ color: '#4f46e5', fontWeight: 700 }}>
            Voltar ao Login
          </Link>
        </p>

        <PublicLegalFooter compact />
      </div>
    </div>
  );
}
