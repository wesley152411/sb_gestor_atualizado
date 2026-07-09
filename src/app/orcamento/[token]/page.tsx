'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Phone, Mail, User, Calendar as CalendarIcon, Clock, Package, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import type { QuoteLinkData } from '@/types';

export default function PublicQuotePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [quote, setQuote] = useState<QuoteLinkData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    name: '', phone: '', email: '', cpf: '', address: '',
    event_date: '', setup_time: '', start_time: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/quote/${token}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data: QuoteLinkData = await res.json();
        setQuote(data);
        setForm({
          name: data.client_name || '',
          phone: data.phone || '',
          email: data.email || '',
          cpf: data.cpf || '',
          address: data.address || '',
          event_date: data.event_date || '',
          setup_time: data.setup_time || '',
          start_time: data.start_time || '',
        });
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [token]);

  const isLocked = quote?.status === 'Confirmado' || quote?.status === 'Finalizado';

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.event_date) {
      setErrorMsg('Preencha ao menos seu nome e a data do evento.');
      return;
    }
    setErrorMsg('');
    setIsSaving(true);
    try {
      const res = await fetch(`/api/public/quote/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || 'Não foi possível enviar seus dados. Tente novamente.');
        return;
      }
      setSubmitted(true);
    } catch {
      setErrorMsg('Não foi possível enviar seus dados. Verifique sua conexão e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={pageWrapperStyle}>
        <p style={{ color: '#64748b' }}>Carregando orçamento...</p>
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div style={pageWrapperStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Link não encontrado</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>
            Esse link de orçamento não existe ou foi removido. Peça para a decoradora enviar um novo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrapperStyle}>
      <div style={{ ...cardStyle, maxWidth: 640 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 44, height: 44, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 18, color: 'white',
          }}>SB</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Orçamento de {quote.decorator.name}</h1>
          <p style={{ fontSize: 13, color: '#64748b' }}>Confira os detalhes e preencha seus dados abaixo.</p>
        </div>

        {/* Card preview */}
        <div style={{ display: 'flex', gap: 16, background: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 24 }}>
          {quote.card.image_url ? (
            <img src={quote.card.image_url} alt={quote.card.name} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 96, height: 96, borderRadius: 10, background: '#e2e8f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package className="w-8 h-8" style={{ color: '#94a3b8' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{quote.card.name}</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>{quote.card.description || 'Sem descrição.'}</p>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#4f46e5' }}>{formatCurrency(quote.card.price)}</span>
            {quote.card.isKit && quote.card.items && quote.card.items.length > 0 && (
              <ul style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                {quote.card.items.map((item, idx) => (
                  <li key={idx}>• {item.name} x{item.quantity}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {isLocked ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: '#10b981', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, marginBottom: 4 }}>Este orçamento já foi confirmado.</p>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Qualquer alteração agora precisa ser feita diretamente com {quote.decorator.name}.
            </p>
          </div>
        ) : (
          <>
            {submitted && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#047857', fontWeight: 600 }}>
                Dados enviados! Você pode atualizar as informações abaixo a qualquer momento, até a decoradora confirmar o orçamento.
              </div>
            )}
            {errorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                {errorMsg}
              </div>
            )}

            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Seus Dados</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              <Input label="Nome Completo" icon={User} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label="Telefone" icon={Phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <Input label="E-mail" icon={Mail} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Informações de Entrega</h3>
            <div style={{ marginBottom: 16 }}>
              <Input label="Endereço de Entrega" icon={MapPin} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro, cidade" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
              <Input label="Data do Evento" icon={CalendarIcon} type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
              <Input label="Horário de Chegada" icon={Clock} type="time" value={form.setup_time} onChange={(e) => setForm({ ...form, setup_time: e.target.value })} />
              <Input label="Horário de Início" icon={Clock} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>

            <Button className="w-full" size="lg" isLoading={isSaving} onClick={handleSubmit}>
              {submitted ? 'Atualizar Dados' : 'Enviar Meus Dados'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

const pageWrapperStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%)',
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 20,
  padding: '40px 36px',
  width: '100%',
  maxWidth: 480,
  boxShadow: '0 16px 50px rgba(0,0,0,0.2)',
  maxHeight: '95vh',
  overflowY: 'auto',
};
