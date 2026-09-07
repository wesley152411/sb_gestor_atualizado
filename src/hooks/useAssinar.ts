'use client';

import { useState } from 'react';

// A ação de assinar, em um lugar só.
//
// Dois pontos da interface levam ao Mercado Pago — a tela /assinatura e o portão
// de quem nunca assinou. Duplicar a chamada significaria dois lugares para
// esquecer de tratar erro, e dois comportamentos que divergem com o tempo.
//
// O init_point NUNCA vem da tela: quem decide para onde ir é o servidor, que o
// recebeu do Mercado Pago ao criar a preapproval.

export function useAssinar() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function assinar() {
    setEnviando(true);
    setErro('');
    try {
      const res = await fetch('/api/billing/subscribe', { method: 'POST' });
      const corpo = await res.json().catch(() => ({}));
      if (!res.ok || !corpo.initPoint) {
        throw new Error(corpo.error || 'Não foi possível iniciar a assinatura.');
      }
      // Daqui em diante quem manda é o Mercado Pago. O retorno cai em
      // /assinatura/retorno, que confirma com o servidor — nunca pela URL.
      window.location.href = corpo.initPoint;
    } catch (motivo) {
      setErro(motivo instanceof Error ? motivo.message : 'Não foi possível iniciar a assinatura.');
      // Só solta o botão no ERRO: no sucesso a página está saindo, e reabilitar
      // convidaria a um segundo clique que criaria outra preapproval.
      setEnviando(false);
    }
  }

  return { assinar, enviando, erro };
}
