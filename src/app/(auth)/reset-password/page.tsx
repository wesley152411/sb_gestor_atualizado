'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { getSession, updatePassword } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Logo } from '@/components/ui/Logo';
import { checkPasswordStrength } from '@/lib/utils';

// Tela de definir a NOVA senha. Só é alcançada depois que /auth/confirm validou
// o token de recuperação (type=recovery) e estabeleceu a sessão. Aqui a pessoa
// já está autenticada (sessão de recuperação) e só troca a senha.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const strength = checkPasswordStrength(password);
  const match = password === confirm;

  useEffect(() => {
    // Sem sessão aqui = link inválido/expirado ou acesso direto à página.
    getSession().then((s) => {
      setHasSession(!!s);
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (strength === 'weak' || strength === 'none') {
      setError('A senha é muito fraca. Use pelo menos 8 caracteres com letras e números.');
      return;
    }
    if (!match) {
      setError('As senhas não correspondem.');
      return;
    }
    setIsLoading(true);
    const result = await updatePassword(password);
    if (result.success) {
      router.push('/analytics'); // já está logado após trocar a senha
    } else {
      setError(result.message || 'Não foi possível salvar a nova senha.');
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%)', padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 20, padding: '48px 40px', width: '100%',
        maxWidth: 440, boxShadow: '0 16px 50px rgba(0,0,0,0.2)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 50, height: 50, margin: '0 auto 16px' }}><Logo size={50} /></div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Definir nova senha</h1>
        </div>

        {checking && (
          <p style={{ textAlign: 'center', fontSize: 14, color: '#64748b' }}>Validando o link…</p>
        )}

        {!checking && !hasSession && (
          <>
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626', fontWeight: 600,
            }}>
              Este link de recuperação é inválido ou expirou. Peça um novo para redefinir sua senha.
            </div>
            <Link href="/forgot-password">
              <Button className="w-full" size="lg">Pedir novo link</Button>
            </Link>
            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
              <Link href="/login" style={{ color: '#4f46e5', fontWeight: 700 }}>Voltar ao Login</Link>
            </p>
          </>
        )}

        {!checking && hasSession && (
          <>
            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
                padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600,
              }}>{error}</div>
            )}
            <form onSubmit={handleSubmit}>
              <Input label="Nova senha" type="password" icon={Lock} placeholder="••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Input label="Confirmar nova senha" type="password" icon={Lock} placeholder="••••••••"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              {confirm && !match && (
                <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, display: 'block', marginTop: -8, marginBottom: 12 }}>
                  As senhas não correspondem.
                </span>
              )}
              <Button type="submit" className="w-full" size="lg" isLoading={isLoading} style={{ marginTop: 8 }}>
                Salvar e entrar
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
