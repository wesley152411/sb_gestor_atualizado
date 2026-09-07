'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle2, Heart, Gift } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// A TELA DE CANCELAMENTO (Termos 6.1 e 6.2).
//
// Duas decisões de produto que a tela precisa honrar:
//
// 1. A oferta aparece ANTES da confirmação, mas recusá-la conclui o cancelamento
//    NA MESMA TELA — sem mandar a decoradora para outro lugar, sem pedir e-mail,
//    sem "fale conosco". Quem decidiu sair não deve ter atrito.
// 2. Cancelar NÃO corta o acesso na hora: vale até o fim do período pago. A tela
//    diz a data, porque essa é a dúvida imediata de quem cancela.

type Estado = {
  cortesia: boolean;
  podeCancelar: boolean;
  ofereceRetencao: boolean;
  valorAtualCentavos: number;
  valorOfertaCentavos: number;
  mesesDaOferta: number;
  periodoFim: string | null;
};

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

type Fase = 'carregando' | 'oferta' | 'confirmar' | 'cancelada' | 'ficou';

export default function CancelarPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fase, setFase] = useState<Fase>('carregando');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ateQuando, setAteQuando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/billing/cancelamento')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('falha'))))
      .then((d: Estado) => {
        if (!vivo) return;
        setEstado(d);
        // Sem oferta disponível, a tela vai direto ao ponto: quem já a usou não
        // precisa ver de novo, e quem quer sair não deve dar voltas.
        setFase(d.ofereceRetencao ? 'oferta' : 'confirmar');
      })
      .catch(() => { if (vivo) setErro('Não foi possível carregar sua assinatura.'); });
    return () => { vivo = false; };
  }, []);

  async function aceitarOferta() {
    setEnviando(true); setErro('');
    try {
      const res = await fetch('/api/billing/oferta', { method: 'POST' });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.error || 'Não foi possível aplicar a oferta.');
      setFase('ficou');
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível aplicar a oferta.');
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar() {
    setEnviando(true); setErro('');
    try {
      const res = await fetch('/api/billing/cancelamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(corpo.error || 'Não foi possível cancelar agora.');
      setAteQuando(corpo.periodoFim ?? estado?.periodoFim ?? null);
      setFase('cancelada');
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível cancelar agora.');
    } finally {
      setEnviando(false);
    }
  }

  if (fase === 'carregando') return <div className="assinatura-page"><p>Carregando…</p></div>;

  // CORTESIA antes do caso geral: as duas caem em podeCancelar=false, mas por
  // motivos opostos. "Sua assinatura já está encerrada" para quem tem acesso
  // liberado e em dia seria mentira — e assustaria à toa.
  if (estado?.cortesia && fase !== 'cancelada' && fase !== 'ficou') {
    return (
      <div className="assinatura-page">
        <section className="assinatura-cartao assinatura-retorno">
          <Gift size={32} aria-hidden="true" />
          <h1>Não há cobrança a cancelar</h1>
          <p>
            Sua conta está em <strong>cortesia</strong>
            {estado.periodoFim ? <> até <strong>{dia(estado.periodoFim)}</strong></> : null}
            {' '}— você não paga nada e não há assinatura ativa no Mercado Pago.
          </p>
          <p>
            Se quiser encerrar a conta em vez disso, é só falar com a gente pelo e-mail de contato.
          </p>
          <Link href="/assinatura" className="assinatura-link">Ver minha assinatura</Link>
        </section>
      </div>
    );
  }

  if (estado && !estado.podeCancelar && fase !== 'cancelada' && fase !== 'ficou') {
    return (
      <div className="assinatura-page">
        <section className="assinatura-cartao">
          <h1 className="cancelar-titulo">Não há assinatura para cancelar</h1>
          <p className="cancelar-texto">Sua assinatura já está encerrada ou cancelada.</p>
          <Link href="/assinatura" className="assinatura-link">Ver minha assinatura</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="assinatura-page">
      {erro && <p role="alert" className="assinatura-erro">{erro}</p>}

      {fase === 'oferta' && estado && (
        <section className="assinatura-cartao">
          <Heart size={28} aria-hidden="true" className="cancelar-icone" />
          <h1 className="cancelar-titulo">Antes de você ir</h1>
          <p className="cancelar-texto">
            Podemos manter sua conta por <strong>{reais(estado.valorOfertaCentavos)} por mês
            durante {estado.mesesDaOferta} meses</strong>, em vez de {reais(estado.valorAtualCentavos)}.
            Depois desse período, o valor volta ao normal.
          </p>
          <p className="cancelar-nota">Esta oferta é válida uma única vez.</p>

          <Button type="button" className="w-full" size="lg" isLoading={enviando} onClick={aceitarOferta}>
            Aceitar e continuar por {reais(estado.valorOfertaCentavos)}
          </Button>
          {/* Recusar conclui NA MESMA TELA — sem mandar para outro lugar. */}
          <button type="button" className="cancelar-recusar" disabled={enviando} onClick={() => setFase('confirmar')}>
            Não, quero cancelar
          </button>
        </section>
      )}

      {fase === 'confirmar' && estado && (
        <section className="assinatura-cartao">
          <h1 className="cancelar-titulo">Cancelar assinatura</h1>
          <p className="cancelar-texto">
            {estado.periodoFim
              ? <>Seu acesso continua até <strong>{dia(estado.periodoFim)}</strong>, o fim do período que você já pagou. Não haverá cobrança depois disso.</>
              : <>Não haverá novas cobranças.</>}
          </p>
          <p className="cancelar-nota">
            Seus dados ficam guardados por 90 dias. Nesse prazo você pode reativar e recuperar tudo.
          </p>

          <Button type="button" className="w-full" size="lg" isLoading={enviando} onClick={cancelar}>
            Confirmar cancelamento
          </Button>
          <Link href="/assinatura" className="cancelar-recusar" aria-disabled={enviando}>
            Voltar sem cancelar
          </Link>
        </section>
      )}

      {fase === 'ficou' && estado && (
        <section className="assinatura-cartao assinatura-retorno">
          <CheckCircle2 size={32} aria-hidden="true" />
          <h1>Oferta aplicada</h1>
          <p>
            Sua assinatura passa a {reais(estado.valorOfertaCentavos)} por mês pelos próximos{' '}
            {estado.mesesDaOferta} meses. Depois disso volta a {reais(estado.valorAtualCentavos)}.
          </p>
          <button type="button" className="assinatura-link" onClick={() => router.push('/assinatura')}>
            Ver minha assinatura
          </button>
        </section>
      )}

      {fase === 'cancelada' && (
        <section className="assinatura-cartao assinatura-retorno">
          <CalendarClock size={32} aria-hidden="true" />
          <h1>Assinatura cancelada</h1>
          <p>
            {ateQuando
              ? <>Seu acesso continua até <strong>{dia(ateQuando)}</strong>. Depois disso, seus dados ficam guardados por 90 dias, e você pode reativar quando quiser.</>
              : <>Seus dados ficam guardados por 90 dias, e você pode reativar quando quiser.</>}
          </p>
          <button type="button" className="assinatura-link" onClick={() => router.push('/assinatura')}>
            Ver minha assinatura
          </button>
        </section>
      )}
    </div>
  );
}
