'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { formatCurrency, whatsappUrl, isValidBrPhone, sanitizePhoneDigits } from '@/lib/utils';
import { EVENT_STATUS } from '@/lib/event-status';
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
    event_date: '', setup_time: '', start_time: '', observation: '',
  });
  const phoneRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.event_date) {
      setErrorMsg('Preencha seu nome e a data do evento.');
      return;
    }
    if (!isValidBrPhone(form.phone)) {
      setErrorMsg('Informe um telefone com DDD.');
      phoneRef.current?.focus();
      return;
    }
    setErrorMsg('');
    setIsSaving(true);
    try {
      const res = await fetch(`/api/public/quote/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Telefone salvo NORMALIZADO (só dígitos) — a normalização já existe.
        body: JSON.stringify({ ...form, phone: sanitizePhoneDigits(form.phone) }),
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
      <div className="quote-page">
        <p style={{ color: 'var(--text-secondary)' }}>Carregando orçamento...</p>
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="quote-page">
        <div className="quote-card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Link não encontrado</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Esse link de orçamento não existe ou foi removido. Peça para a decoradora enviar um novo.
          </p>
        </div>
      </div>
    );
  }

  const items = quote.card.items || [];

  // Só o RASCUNHO ("Aguardando preenchimento") é editável. Depois do envio (ou
  // se já veio enviado/confirmado/finalizado) → tela de agradecimento em leitura.
  // Cancelado → mensagem própria de orçamento inativo.
  const isCancelled = quote.status === EVENT_STATUS.CANCELADO;
  const isDraft = quote.status === EVENT_STATUS.AGUARDANDO_PREENCHIMENTO;
  const showForm = isDraft && !submitted;
  const waLink = whatsappUrl(quote.decorator.whatsapp);

  return (
    <div className="quote-page">
      <div className="quote-card">
        {/* Cabeçalho: logo + título */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 60, height: 60, margin: '0 auto 16px' }}>
            <Logo size={60} />
          </div>
          <h1 style={titleStyle}>Orçamento de {quote.decorator.name}</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Confira os detalhes e preencha seus dados abaixo.</p>
        </div>

        {/* Card do produto + itens + total */}
        <div style={productCardStyle}>
          <div className="quote-product-row">
            {quote.card.image_url ? (
              <img src={quote.card.image_url} alt={quote.card.name} className="quote-product-img" />
            ) : (
              <div className="quote-product-img" style={photoPlaceholderStyle}>foto do produto</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>{quote.card.name}</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 10 }}>{quote.card.description || 'Sem descrição.'}</p>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>
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
                      <span style={{ fontSize: 15, color: 'var(--text-primary)' }}>{item.name}</span>
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 }}>×{item.quantity}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div style={totalBarStyle}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Valor total</span>
            <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>
              {formatCurrency(quote.card.price)}
            </strong>
          </div>
        </div>

        {isCancelled ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontWeight: 700, marginBottom: 4, fontSize: 16, color: 'var(--text-primary)' }}>Orçamento não está mais ativo</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: waLink ? 18 : 0 }}>
              Este orçamento foi cancelado. Se ainda tiver interesse, fale diretamente com {quote.decorator.name}.
            </p>
            {waLink && <WhatsAppLink href={waLink} />}
          </div>
        ) : !showForm ? (
          <div style={{ padding: '8px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <CheckCircle2 className="w-10 h-10" style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, marginBottom: 4, fontSize: 16, color: 'var(--text-primary)' }}>Pedido recebido! 🎉</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Seus dados foram enviados para {quote.decorator.name}. Agora é só aguardar a confirmação do orçamento.
              </p>
            </div>
            <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
              <ReadRow label="Nome" value={form.name} />
              <ReadRow label="Telefone" value={form.phone} />
              <ReadRow label="Endereço" value={form.address} />
              <ReadRow label="Data do evento" value={form.event_date} />
              <ReadRow label="Horário de chegada" value={form.setup_time} />
              <ReadRow label="Horário de início" value={form.start_time} />
              {form.observation?.trim() && <ReadRow label="Observações" value={form.observation} />}
            </div>
          </div>
        ) : (
          <>
            {submitted && (
              <div style={{ background: 'var(--success-light)', border: '1px solid #a7f3d0', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#047857', fontWeight: 600 }}>
                Dados enviados! Você pode atualizar as informações abaixo a qualquer momento, até a decoradora confirmar o orçamento.
              </div>
            )}
            {errorMsg && (
              <div style={{ background: 'var(--danger-light)', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--danger)', fontWeight: 600 }}>
                {errorMsg}
              </div>
            )}

            <SectionTitle>Seus dados</SectionTitle>
            <div className="quote-grid-2" style={{ marginBottom: 8 }}>
              <Input label="Nome completo" placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <PhoneInput ref={phoneRef} label="Telefone" value={form.phone} onChange={(d) => setForm({ ...form, phone: d })} placeholder="(11) 99999-9999" required />
            </div>
            <div className="quote-grid-2" style={{ marginBottom: 24 }}>
              <Input label="E-mail" type="email" placeholder="voce@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" />
            </div>

            <SectionTitle>Informações de entrega</SectionTitle>
            <div style={{ marginBottom: 16 }}>
              <Input label="Endereço de entrega" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, bairro, cidade" />
            </div>
            <div className="quote-grid-3" style={{ marginBottom: 28 }}>
              {/* lang="pt-BR" e step=60: pedem ao navegador o formato brasileiro
                  (dd/mm/aaaa e 24h) e removem o segmento de segundos. */}
              <Input label="Data do evento" type="date" lang="pt-BR" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
              <Input label="Horário de chegada" type="time" lang="pt-BR" step={60} value={form.setup_time} onChange={(e) => setForm({ ...form, setup_time: e.target.value })} />
              <Input label="Horário de início" type="time" lang="pt-BR" step={60} value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            </div>

            <SectionTitle>Observações</SectionTitle>
            <div className="form-group" style={{ marginBottom: 28 }}>
              <label className="form-label">
                Algum detalhe, pedido especial ou dúvida?{' '}
                <span style={{ color: 'var(--text-light)', fontWeight: 500 }}>(opcional)</span>
              </label>
              <textarea
                className="form-input"
                rows={5}
                style={{ resize: 'vertical', minHeight: 130, lineHeight: 1.5 }}
                placeholder="Conte pra gente qualquer detalhe importante sobre o evento..."
                value={form.observation}
                onChange={(e) => setForm({ ...form, observation: e.target.value })}
              />
            </div>

            <Button className="w-full" size="lg" isLoading={isSaving} onClick={handleSubmit} style={{ width: '100%', justifyContent: 'center', padding: '15px 20px', fontSize: 16 }}>
              {submitted ? 'Atualizar meus dados' : 'Enviar meus dados'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Linha somente-leitura dos dados enviados (tela de agradecimento).
function ReadRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

// Contato com a decoradora por WhatsApp (só na tela de orçamento CANCELADO — na
// tela de confirmação foi removido a pedido). Nova aba, rel seguro.
function WhatsAppLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 48, padding: '12px 16px', borderRadius: 12, background: 'var(--success)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
    >
      <MessageCircle className="w-4 h-4" /> Falar no WhatsApp
    </a>
  );
}

// ==================== ESTILOS (cores só por token) ====================

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  color: 'var(--text-primary)',
  marginBottom: 6,
  letterSpacing: '-0.3px',
};

const productCardStyle: React.CSSProperties = {
  background: 'var(--primary-lighter)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 20,
  marginBottom: 28,
};

const photoPlaceholderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontSize: 11,
  color: 'var(--text-light)',
  background: 'var(--bg-input)',
  border: '1px dashed var(--border-strong)',
};

const dashedDividerStyle: React.CSSProperties = {
  borderTop: '1px dashed var(--border-strong)',
  margin: '20px 0 16px',
};

const itemsLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  color: 'var(--text-light)',
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
  background: 'var(--primary)',
  flexShrink: 0,
};

const totalBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  background: 'var(--primary-light)',
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
  color: 'var(--text-primary)',
  marginBottom: 14,
};

const dashStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 20,
  height: 2,
  borderRadius: 2,
  background: 'var(--primary)',
  flexShrink: 0,
};
