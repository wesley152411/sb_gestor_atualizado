'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock } from 'lucide-react';
import { signIn } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const result = await signIn(email, password);
    
    if (result.success) {
      router.push('/analytics');
    } else {
      setError(result.message || 'Erro ao fazer login.');
    }
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
          <div style={{
            width: 50, height: 50, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: 'white',
          }}>SB</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Entrar no SB GESTOR</h1>
          <p style={{ fontSize: 14, color: '#64748b' }}>Acesse sua conta para gerenciar seu acervo.</p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626', fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Input
            label="E-mail"
            type="email"
            icon={Mail}
            placeholder="seuemail@empresa.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            label="Senha"
            type="password"
            icon={Lock}
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <Link href="/forgot-password" style={{ fontSize: 13, color: '#4f46e5', fontWeight: 600 }}>
              Esqueci minha senha
            </Link>
          </div>

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
            Entrar
          </Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#64748b' }}>
          Ainda não tem conta?{' '}
          <Link href="/signup" style={{ color: '#4f46e5', fontWeight: 700 }}>
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  );
}
