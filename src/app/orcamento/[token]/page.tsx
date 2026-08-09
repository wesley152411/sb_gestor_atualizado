'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import type { QuoteLinkData } from '@/types';

// ==================== TOKENS VISUAIS ====================
const TERRACOTA = '#B85450';
const TERRACOTA_DARK = '#A04844';
const PAGE_BG = '#F5F1EC';
const SERIF = "Georgia, 'Times New Roman', serif";

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
    event_date: '', setup_time: '', start_time: '', observation: '',
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
          observation: data.observation || '',
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

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 style={sectionTitleStyle}>
      <span style={dashStyle} />
      {children}
    </h3>
  );

  if (isLoading) {
    return (
      <div style={pageWrapperStyle}>
        <p style={{ color: '#8a8078' }}>Carregando orçamento...</p>
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div style={pageWrapperStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 22, fontFamily: SERIF, marginBottom: 8 }}>Link não encontrado</h1>
          <p style={{ color: '#8a8078', fontSize: 14 }}>
            Esse link de orçamento não existe ou foi removido. Peça para a decoradora enviar um novo.
          </p>
        </div>
      </div>
    );
  }

  const items = quote.card.items || [];

  return (
    <div style={pageWrapperStyle}>
      <div style={{ ...cardStyle, maxWidth: 640 }}>
        {/* Cabeçalho: ícone SB + título serifado */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 16px' }}>
            <div style={sbSquareStyle}>SB</div>
            <span style={sbDotStyle} />
          </div>
          <h1 style={titleStyle}>Orçamento de {quote.decorator.name}</h1>
          <p style={{ fontSize: 14, color: '#8a8078' }}>Confira os detalhes e preencha seus dados abaixo.</p>
        </div>

        {/* Card do produto + itens + total */}
        <div style={productCardStyle}>
          <div style={{ display: 'flex', gap: 18 }}>
            {quote.card.image_url ? (
              <img
                src={quote.card.image_url}
                alt={quote.card.name}
                style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }}
              />
            ) : (
              <div style={photoPlaceholderStyle}>foto do produto</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 22, fontFamily: SERIF, fontWeight: 700, marginBottom: 6 }}>{quote.card.name}</h2>
              <p style={{ fontSize: 14, color: '#8a8078', marginBottom: 10 }}>{quote.card.description || 'Sem descrição.'}</p>
              <span style={{ fontSize: 24, fontFamily: SERIF, fontWeight: 700, color: TERRACOTA }}>
                {formatCurrency(quote.card.price)}
              </span>
            </div>
          </div>

          {items.length > 0 && (
            <>
              <div style={dashedDividerStyle} />
              <div style={itemsLabelStyle}>Itens inclusos</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {items.map((item, idx) => (
                  <li key={idx} style={itemRowStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span style={bulletStyle} />
                      <span style={{ fontSize: 15, color: '#2f2a26' }}>{item.name}</span>
                    </span>
                    <span style={{ fontSize: 13, color: '#8a8078', flexShrink: 0 }}>×{item.quantity}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div style={totalBarStyle}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#2f2a26' }}>Valor total</span>
            <strong style={{ fontSize: 20, fontFamily: SERIF, fontWeight: 700, color: TERRACOTA }}>
              {formatCurrency(quote.card.price)}
            </strong>
          </div>
        </div>

        {isLocked ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: '#10b981', margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, marginBottom: 4 }}>Este orçamento já foi confirmado.</p>
            <p style={{ fontSize: 13, color: '#8a8078' }}>
              Qualquer alteração agora precisa ser feita diretamente com {quote.decorator.name}.
            </p>
          </div>
        ) : (
          <>
            {submitted && (
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#047857', fontWeight: 600 }}>
                Dados enviados! Você pode atualizar as informações abaixo a qualquer momento, até a decoradora confirmar o orçamento.
              </div>
            )}
            {errorMsg && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                {errorMsg}
              </div>
            )}

            <SectionTitle>Seus dados</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              <Input label="Nome completo" style={inputStyle} placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <Input label="Telefone" style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <Input label="E-mail" style={inputStyle} type="email" placeholder="voce@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="CPF" style={inputStyle} value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
            </div>

            <SectionTitle>Informações de entrega</SectionTitle>
            <div style={{ marginBottom: 16 }}>
              <Input label="Endereço de entrega" style={inputStyle} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro, cidade" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 28 }}>
              {/* lang="pt-BR" e step=60: pedem ao navegador o formato brasileiro
                  (dd/mm/aaaa e 24h) e removem o segmento de segundos. */}
              <Input label="Data do evento" style={inputStyle} type="date" lang="pt-BR" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
              <Input label="Horário de chegada" style={inputStyle} type="time" lang="pt-BR" step={60} value={form.setup_time} onChange={(e) => setForm({ ...form, setup_time: e.target.value })} />
              <Input label="Horário de início" style={inputStyle} type="time" lang="pt-BR" step={60} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>

            <SectionTitle>Observações</SectionTitle>
            <div className="form-group" style={{ marginBottom: 28 }}>
              <label className="form-label">
                Algum detalhe, pedido especial ou dúvida?{' '}
                <span style={{ color: '#a2968e', fontWeight: 500 }}>(opcional)</span>
              </label>
              <textarea
                className="form-input"
                rows={5}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 130, lineHeight: 1.5 }}
                placeholder="Conte pra gente qualquer detalhe importante sobre o evento..."
                value={form.observation}
                onChange={(e) => setForm({ ...form, observation: e.target.value })}
              />
            </div>

            <Button className="w-full" size="lg" isLoading={isSaving} onClick={handleSubmit} style={submitButtonStyle}>
              {submitted ? 'Atualizar meus dados' : 'Enviar meus dados'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== ESTILOS ====================

const pageWrapperStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: PAGE_BG,
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 24,
  padding: '40px 36px',
  width: '100%',
  maxWidth: 480,
  boxShadow: '0 10px 40px rgba(90, 70, 60, 0.08)',
  maxHeight: '95vh',
  overflowY: 'auto',
};

const sbSquareStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 18,
  background: TERRACOTA,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: SERIF,
  fontWeight: 700,
  fontSize: 24,
  color: 'white',
  boxShadow: '0 8px 20px rgba(184, 84, 80, 0.28)',
};

const sbDotStyle: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: '#F6D3CB',
};

const titleStyle: React.CSSProperties = {
  fontSize: 30,
  fontFamily: SERIF,
  fontWeight: 700,
  color: '#2f2a26',
  marginBottom: 6,
  textTransform: 'none',
  letterSpacing: '-0.2px',
};

const productCardStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #FDF2F0 0%, #FBF7F2 100%)',
  border: '1px solid #F2E4DE',
  borderRadius: 18,
  padding: 22,
  marginBottom: 28,
};

const photoPlaceholderStyle: React.CSSProperties = {
  width: 112,
  height: 112,
  borderRadius: 12,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontSize: 11,
  color: '#a8988f',
  backgroundColor: '#F3EDE7',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(168,152,143,0.16), rgba(168,152,143,0.16) 8px, transparent 8px, transparent 16px)',
};

const dashedDividerStyle: React.CSSProperties = {
  borderTop: '1px dashed #E4D5CD',
  margin: '20px 0 16px',
};

const itemsLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: '#a2968e',
  marginBottom: 10,
};

const itemRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '7px 0',
};

const bulletStyle: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: TERRACOTA,
  flexShrink: 0,
};

const totalBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: '#FBE4E0',
  borderRadius: 12,
  padding: '14px 18px',
  marginTop: 18,
};

const sectionTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  fontSize: 17,
  fontWeight: 700,
  color: '#2f2a26',
  marginBottom: 14,
};

const dashStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 20,
  height: 2,
  borderRadius: 2,
  background: TERRACOTA,
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  background: '#F8F5F1',
  border: '1px solid #EDE4DC',
  borderRadius: 12,
  padding: '12px 14px',
};

const submitButtonStyle: React.CSSProperties = {
  width: '100%',
  background: TERRACOTA,
  borderColor: TERRACOTA_DARK,
  color: 'white',
  fontWeight: 700,
  borderRadius: 14,
  padding: '16px 20px',
  fontSize: 16,
  textTransform: 'none',
  justifyContent: 'center',
};
