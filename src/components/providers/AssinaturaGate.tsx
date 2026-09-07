'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAssinatura } from '@/components/providers/AssinaturaProvider';
import { useAssinar } from '@/hooks/useAssinar';
import { signOut } from '@/services/api';

// PORTÃO DE QUEM NUNCA ASSINOU.
//
// O buraco que isto fecha: uma decoradora se cadastrava, confirmava o e-mail,
// entrava — e via o app INTEIRO vazio. Toda rota de dados devolve
// 402 SUBSCRIPTION_REQUIRED, e nenhuma tela reagia a isso. Sem erro, sem faixa,
// sem explicação. Ela concluiria que o sistema está quebrado e iria embora, e
// nós perderíamos a cliente no primeiro minuto — não por preço, por silêncio.
//
// POR QUE TELA CHEIA, e não faixa nem redirecionamento:
//
//   - faixa   — faixa é aviso sobre algo que ainda dá para contornar. Aqui não
//               dá: ela não consegue usar NADA. Uma tarja sobre um app vazio
//               continua parecendo defeito, só que com um bilhete em cima.
//   - redirect— muda a URL a cada navegação, briga com o botão voltar e cria
//               laço com a própria /assinatura. Além disso o histórico dela fica
//               poluído de redirecionamentos.
//   - tela cheia — é o mesmo formato que ela JÁ viu nesta sessão duas vezes
//               (confirmação de e-mail e aceite legal). A linguagem visual é
//               conhecida, a URL não muda, e a saída é um clique.
//
// NÃO é dispensável, porque a regra de negócio é essa: sem assinatura não se
// entra. Mas também não é armadilha — sair da conta e ler os documentos estão
// aqui, e é a mesma cortesia que o gate de aceite legal já oferece.

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function AssinaturaGate({ children }: { children: React.ReactNode }) {
  const { status, ofereceTeste, valorCentavos, carregando } = useAssinatura();
  const { assinar, enviando, erro } = useAssinar();
  const pathname = usePathname();

  // As telas de assinatura são a SAÍDA do portão. Barrá-las prenderia a pessoa
  // fora do único lugar que resolve o problema — inclusive /assinatura/retorno,
  // para onde o Mercado Pago devolve depois do pagamento.
  const naSaida = pathname.startsWith('/assinatura');

  // Enquanto carrega, deixa passar. Mesma escolha de useBloqueioDeEscrita: piscar
  // o app e depois cobrir com um muro é pior do que 200ms de tela normal — e o
  // servidor recusa os dados de qualquer forma, então nada vaza nesse intervalo.
  const precisaAssinar = !carregando && (status === 'sem_assinatura' || status === 'pendente');

  if (naSaida || !precisaAssinar) return <>{children}</>;

  const pendente = status === 'pendente';

  return (
    <main className="legal-gate-page">
      <section className="legal-gate-card assinatura-portao">
        {pendente ? <Clock size={32} aria-hidden="true" /> : <CreditCard size={32} aria-hidden="true" />}

        <h1>{pendente ? 'Sua assinatura não foi concluída' : 'Ative sua assinatura'}</h1>

        <p>
          {pendente
            ? 'Você começou a assinatura e o Mercado Pago ainda não confirmou. Se você fechou a página antes de terminar, pode começar de novo agora.'
            : 'Sua conta está criada. Para usar o SB Gestor, ative sua assinatura.'}
        </p>

        <div className="assinatura-portao-preco">
          <span className="assinatura-valor">{reais(valorCentavos)}</span>
          <span className="assinatura-periodo">por mês</span>
        </div>

        {/* O ponto que a tela NÃO pode esconder: o mês grátis não corre sozinho.
            Ela autoriza o pagamento primeiro e só é cobrada 30 dias depois.
            Descobrir isso no Mercado Pago, de surpresa, é o que faz desistir. */}
        {ofereceTeste && !pendente && (
          <div className="assinatura-portao-teste">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>
              <strong>Primeiro mês grátis.</strong> Você autoriza o pagamento agora no Mercado Pago
              e a <strong>primeira cobrança acontece só daqui a 30 dias</strong>. Cancelando antes
              disso, você não paga nada.
            </span>
          </div>
        )}

        {erro && <p role="alert" className="legal-error">{erro}</p>}

        <Button type="button" className="w-full" size="lg" isLoading={enviando} onClick={assinar}>
          {pendente ? 'Tentar de novo' : ofereceTeste ? 'Começar mês grátis' : 'Assinar'}
        </Button>

        <p className="assinatura-portao-nota">
          Pagamento pelo Mercado Pago — não guardamos dados do seu cartão.
        </p>

        <div className="assinatura-portao-rodape">
          <Link href="/termos" target="_blank" rel="noopener noreferrer">Termos de Uso</Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacidade" target="_blank" rel="noopener noreferrer">Privacidade</Link>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="legal-decline"
            onClick={async () => { await signOut(); window.location.href = '/login'; }}
          >
            Sair da conta
          </button>
        </div>
      </section>
    </main>
  );
}
