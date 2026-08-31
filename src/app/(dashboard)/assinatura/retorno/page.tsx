'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock } from 'lucide-react';

// A tela de retorno do Mercado Pago.
//
// NADA na URL é levado a sério. O MP volta com ?preapproval_id=... e alguns
// parâmetros próprios; o preapproval_id é usado só como PONTEIRO para o servidor
// reler a verdade em GET /preapproval/{id}. Um ?status=approved forjado à mão não
// libera coisa nenhuma.
//
// A corrida com o webhook se resolve sozinha: os dois caminhos chamam a mesma
// função idempotente. Se o webhook chegar primeiro, aqui apenas confirma.

type Fase = 'confirmando' | 'pronto' | 'demorando' | 'erro';

// Espera crescente: 1s, 2s, 4s, 8s. Teto de ~15s, e então para de insistir — a
// tela nunca fica presa num spinner infinito.
const ESPERAS = [1000, 2000, 4000, 8000];

export default function RetornoPage() {
  const params = useSearchParams();
  const preapprovalId = params.get('preapproval_id') || params.get('preapproval') || '';
  // Estado inicial DERIVADO: sem preapproval_id já nascemos em 'erro'. Marcar isso
  // dentro do efeito seria setState síncrono em efeito — render em cascata à toa.
  const [fase, setFase] = useState<Fase>(preapprovalId ? 'confirmando' : 'erro');
  const cancelado = useRef(false);

  useEffect(() => {
    if (!preapprovalId) return;
    cancelado.current = false;

    async function confirmar() {
      for (let tentativa = 0; tentativa <= ESPERAS.length; tentativa++) {
        if (cancelado.current) return;
        try {
          const res = await fetch('/api/billing/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preapproval_id: preapprovalId }),
          });
          const corpo = await res.json().catch(() => ({}));
          if (res.status === 404) { if (!cancelado.current) setFase('erro'); return; }
          if (corpo?.pronto) { if (!cancelado.current) setFase('pronto'); return; }
        } catch {
          // Rede instável no meio do retorno: continua tentando dentro do teto.
        }
        const espera = ESPERAS[tentativa];
        if (espera === undefined) break;
        await new Promise((r) => setTimeout(r, espera));
      }
      // Esgotou o teto sem confirmação. NÃO é erro: o pagamento pode estar a
      // caminho. O webhook e o job de reconciliação terminam o serviço.
      if (!cancelado.current) setFase('demorando');
    }

    confirmar();
    return () => { cancelado.current = true; };
  }, [preapprovalId]);

  return (
    <div className="assinatura-page">
      <section className="assinatura-retorno">
        {fase === 'confirmando' && (
          <>
            <Clock size={32} aria-hidden="true" className="assinatura-girando" />
            <h1>Confirmando seu pagamento</h1>
            <p>Isso leva alguns segundos. Não feche esta página.</p>
          </>
        )}

        {fase === 'pronto' && (
          <>
            <CheckCircle2 size={32} aria-hidden="true" />
            <h1>Assinatura confirmada</h1>
            <p>Tudo certo. Seu acesso já está liberado.</p>
            <Link href="/analytics" className="assinatura-link">Ir para o painel</Link>
          </>
        )}

        {fase === 'demorando' && (
          <>
            <Clock size={32} aria-hidden="true" />
            <h1>Recebemos seu pagamento</h1>
            <p>
              O Mercado Pago ainda está confirmando. Vamos liberar seu acesso em instantes e avisamos
              por e-mail. Você pode fechar esta página.
            </p>
            <Link href="/assinatura" className="assinatura-link">Ver minha assinatura</Link>
          </>
        )}

        {fase === 'erro' && (
          <>
            <h1>Não encontramos esta assinatura</h1>
            <p>Se você concluiu o pagamento, aguarde alguns minutos e confira em Assinatura.</p>
            <Link href="/assinatura" className="assinatura-link">Ver minha assinatura</Link>
          </>
        )}
      </section>
    </div>
  );
}
