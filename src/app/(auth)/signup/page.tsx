'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Building2, MapPin, User } from 'lucide-react';
import { signUp } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cnpjMask, checkPasswordStrength } from '@/lib/utils';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', company: '', cnpj: '', location: '', email: '', password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const passwordStrength = checkPasswordStrength(form.password);
  const passwordsMatch = form.password === form.confirmPassword;

  const handleCnpjChange = (value: string) => {
    setForm({ ...form, cnpj: cnpjMask(value) });
  };

  const handleGetLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setForm({ ...form, location: `Lat: ${pos.coords.latitude.toFixed(2)}, Lon: ${pos.coords.longitude.toFixed(2)}` });
          alert('Localização obtida! Edite se necessário (ex: Cidade - Estado).');
        },
        () => alert('Não foi possível obter a localização. Permissão negada.')
      );
    } else {
      alert('Geolocalização não suportada no seu navegador.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('As senhas não correspondem.');
      return;
    }

    if (passwordStrength === 'weak' || passwordStrength === 'none') {
      setError('A senha é muito fraca. Use pelo menos 8 caracteres com letras e números.');
      return;
    }

    setIsLoading(true);

    const result = await signUp(form.email, form.password, {
      name: form.name,
      company_name: form.company,
      cnpj: form.cnpj,
      location: form.location,
    });

    if (result.success) {
      if (result.needsEmailConfirmation) {
        alert(result.message);
        router.push('/login');
      } else {
        router.push('/analytics');
      }
    } else {
      setError(result.message || 'Erro ao criar conta.');
    }
    setIsLoading(false);
  };

  const strengthBarColors: Record<string, string> = {
    none: '', weak: '#ef4444', medium: '#f59e0b', strong: '#10b981',
  };
  const strengthBarWidths: Record<string, string> = {
    none: '0%', weak: '33%', medium: '66%', strong: '100%',
  };
  const strengthLabels: Record<string, string> = {
    none: 'Digite a senha',
    weak: 'Fraca (Use no mínimo 8 caracteres com letras e números)',
    medium: 'Média (Adicione caracteres especiais)',
    strong: 'Forte',
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
        padding: '40px 36px',
        width: '100%',
        maxWidth: 520,
        boxShadow: '0 16px 50px rgba(0,0,0,0.2)',
        maxHeight: '95vh',
        overflowY: 'auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 50, height: 50, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: 'white',
          }}>SB</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Criar Conta no SB GESTOR</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Preencha os dados da sua empresa de decoração.</p>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
            padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600,
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input label="Seu Nome" icon={User} placeholder="Maria Silva" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
            <Input label="Nome da Empresa" icon={Building2} placeholder="Bella Fest Ltda" value={form.company} onChange={e => setForm({...form, company: e.target.value})} required />
          </div>

          <Input label="CNPJ" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={e => handleCnpjChange(e.target.value)} />
          
          <div style={{ position: 'relative' }}>
            <Input label="Cidade / Estado" icon={MapPin} placeholder="São Paulo - SP" value={form.location} onChange={e => setForm({...form, location: e.target.value})} />
            <button
              type="button"
              onClick={handleGetLocation}
              style={{
                position: 'absolute', right: 8, top: 34, fontSize: 11,
                color: '#4f46e5', fontWeight: 700, cursor: 'pointer',
                background: 'rgba(79,70,229,0.08)', padding: '4px 10px', borderRadius: 6,
                border: 'none',
              }}
            >
              📍 Usar GPS
            </button>
          </div>

          <Input label="E-mail" type="email" icon={Mail} placeholder="email@empresa.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />

          <Input label="Senha" type="password" icon={Lock} placeholder="••••••••" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          
          {/* Password Strength Meter */}
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            <div className="password-strength-container">
              <div style={{
                height: '100%', borderRadius: 2,
                width: strengthBarWidths[passwordStrength],
                background: strengthBarColors[passwordStrength],
                transition: 'width 0.3s ease, background 0.3s ease',
              }} />
            </div>
            <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
              {strengthLabels[passwordStrength]}
            </span>
          </div>

          <Input label="Confirmar Senha" type="password" icon={Lock} placeholder="••••••••" value={form.confirmPassword} onChange={e => setForm({...form, confirmPassword: e.target.value})} required />
          {form.confirmPassword && !passwordsMatch && (
            <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, display: 'block', marginTop: -8, marginBottom: 12 }}>
              As senhas não correspondem.
            </span>
          )}

          <Button type="submit" className="w-full" size="lg" isLoading={isLoading} style={{ marginTop: 8 }}>
            Criar Conta
          </Button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#64748b' }}>
          Já possui uma conta?{' '}
          <Link href="/login" style={{ color: '#4f46e5', fontWeight: 700 }}>Entrar</Link>
        </p>
      </div>
    </div>
  );
}
