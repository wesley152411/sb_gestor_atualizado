'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, MessageSquareHeart, Mail, Copy, Check, Send, Bot, Bell,
  ChevronDown, HelpCircle, Lock, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationStore } from '@/stores/notification-store';
import {
  ASSUNTOS_SUPORTE, CARINHAS, EMAIL_SUPORTE, FAQ_SUPORTE, LIMITE_MENSAGEM, rotuloDaNota,
  type TipoFeedback,
} from '@/lib/suporte';

// ============================================================================
// ABA SUPORTE
//
// O canal de volta: a decoradora avalia o sistema, escreve o que quer melhorar,
// fala com a gente por e-mail e consulta as dúvidas frequentes.
//
// TUDO QUE ELA ESCREVE É GRAVADO (POST /api/suporte/feedback → support_feedback).
// Um formulário de opinião que só agradece na tela e não guarda nada é pior do
// que não existir: ela gasta cinco minutos escrevendo e nós nunca lemos.
//
// O QUE NÃO ESTÁ AQUI, E POR QUÊ:
//   - a faixa de estatísticas do print (tempo de resposta, satisfação,
//     notificações) — não temos esses números. Número inventado sobre o próprio
//     suporte é a única mentira que ela pode conferir na hora seguinte.
//   - respostas do FAQ — ainda não foram escritas (ver FAQ_SUPORTE).
//   - selo "Online" ao lado do e-mail — pelo mesmo motivo da faixa: não existe
//     sinal de presença nenhum por trás dele.
// ============================================================================

/** Lead-in da confirmação da nota. Não comemora um 1 nem lamenta um 5. */
function saudacaoDaNota(nota: number): string {
  if (nota >= 4) return 'Que alegria!';
  if (nota === 3) return 'Obrigado pelo retorno.';
  return 'Sentimos muito por isso.';
}

async function enviarFeedback(corpo: {
  tipo: TipoFeedback;
  nota?: number | null;
  assuntos?: string[];
  mensagem?: string;
}): Promise<void> {
  const res = await fetch('/api/suporte/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}));
    throw new Error(erro.error || 'Não foi possível registrar agora. Tente de novo em instantes.');
  }
}

export default function SuportePage() {
  const { addNotification } = useNotificationStore();

  // --- avaliação (grava no clique, sem botão) ---
  const [nota, setNota] = useState<number | null>(null);

  // --- opinião ---
  const [mensagem, setMensagem] = useState('');
  const [assuntos, setAssuntos] = useState<string[]>([]);
  const [enviandoOpiniao, setEnviandoOpiniao] = useState(false);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  // --- e-mail ---
  const [copiado, setCopiado] = useState(false);

  // --- assistente de IA ---
  const [avisoPedido, setAvisoPedido] = useState(false);
  const [pedindoAviso, setPedindoAviso] = useState(false);

  // --- FAQ ---
  const [aberta, setAberta] = useState<string | null>(null);

  // A carinha dela já vem marcada ao abrir a tela: sem isso, cada visita parece
  // que a avaliação anterior se perdeu.
  useEffect(() => {
    let vivo = true;
    fetch('/api/suporte/feedback')
      .then((res) => (res.ok ? res.json() : null))
      .then((dados) => { if (vivo && dados && typeof dados.nota === 'number') setNota(dados.nota); })
      .catch(() => { /* a tela funciona sem a nota anterior; não vale um alarme */ });
    return () => { vivo = false; };
  }, []);

  // Marca na hora, grava depois de a mão parar.
  //
  // A carinha responde ao dedo (otimista) porque esperar a rede para pintar um
  // emoji é o tipo de lentidão que faz clicar de novo. A GRAVAÇÃO espera um
  // respiro: percorrendo as cinco com a seta, ela passa por quatro notas que não
  // quis — gravar cada uma encheria a tabela de ruído e faria "a última linha"
  // deixar de ser a resposta dela.
  const gravarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendenteRef = useRef<number | null>(null);

  const avaliar = (valor: number) => {
    const anterior = nota;
    setNota(valor);
    pendenteRef.current = valor;
    if (gravarRef.current) clearTimeout(gravarRef.current);
    gravarRef.current = setTimeout(() => {
      gravarRef.current = null;
      pendenteRef.current = null;
      enviarFeedback({ tipo: 'avaliacao', nota: valor }).catch((e: any) => {
        setNota(anterior); // falhou: volta ao que era, em vez de fingir que guardou
        addNotification('Avaliação não registrada', e.message, true);
      });
    }, 600);
  };

  // Saiu da tela dentro do respiro: o envio é DISPARADO na saída, não cancelado.
  // Cancelar engoliria a avaliação de quem clica e navega em seguida — que é
  // exatamente o comportamento de quem só queria dar a nota e seguir a vida.
  // Sem setState aqui: o componente já não existe para receber o resultado.
  useEffect(() => () => {
    if (gravarRef.current) clearTimeout(gravarRef.current);
    const pendente = pendenteRef.current;
    if (pendente !== null) {
      void enviarFeedback({ tipo: 'avaliacao', nota: pendente }).catch(() => {});
    }
  }, []);

  // Setas percorrem as carinhas e JÁ escolhem — é o comportamento padrão de um
  // radiogroup, e é o que faz o tabIndex rotativo acima valer alguma coisa.
  // Home/End vão para as pontas; o resto das teclas segue o caminho normal.
  const aoNavegarCarinhas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
      : 0;
    if (!passo && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();

    const atual = CARINHAS.findIndex((c) => c.nota === nota);
    const base = atual === -1 ? 0 : atual;
    const destino = e.key === 'Home' ? 0
      : e.key === 'End' ? CARINHAS.length - 1
      // Dá a volta: da última para a primeira, como num rádio.
      : (base + passo + CARINHAS.length) % CARINHAS.length;

    const alvo = CARINHAS[destino];
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-carinha="${alvo.nota}"]`)?.focus();
    avaliar(alvo.nota);
  };

  // Chip = atalho de escrita. Acrescenta o assunto ao texto e devolve o cursor
  // para o campo, no fim — ela continua digitando de onde parou.
  const inserirAssunto = (assunto: string) => {
    setMensagem((atual) => {
      const prefixo = atual.trim() ? `${atual.replace(/\s+$/, '')}\n` : '';
      const novo = `${prefixo}${assunto}: `;
      return novo.length > LIMITE_MENSAGEM ? atual : novo;
    });
    setAssuntos((atual) => (atual.includes(assunto) ? atual : [...atual, assunto]));
    requestAnimationFrame(() => {
      const campo = textoRef.current;
      if (!campo) return;
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
    });
  };

  const enviarOpiniao = async () => {
    const texto = mensagem.trim();
    if (!texto || enviandoOpiniao) return;
    setEnviandoOpiniao(true);
    try {
      await enviarFeedback({ tipo: 'opiniao', nota, assuntos, mensagem: texto });
      setMensagem('');
      setAssuntos([]);
      addNotification('Opinião enviada', 'Recebemos sua mensagem. Obrigado por nos contar!');
    } catch (e: any) {
      // O texto dela NÃO é limpo aqui, de propósito: se a rede falhou, perder o
      // que ela escreveu é o dobro do prejuízo.
      addNotification('Não foi possível enviar', e.message, true);
    } finally {
      setEnviandoOpiniao(false);
    }
  };

  const copiarEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL_SUPORTE);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência bloqueada (http, permissão negada): o endereço
      // continua visível e selecionável na tela, então só avisamos.
      addNotification('Não consegui copiar', `Selecione e copie manualmente: ${EMAIL_SUPORTE}`, true);
    }
  };

  const pedirAviso = async () => {
    if (avisoPedido || pedindoAviso) return;
    setPedindoAviso(true);
    try {
      await enviarFeedback({ tipo: 'ia_interesse' });
      setAvisoPedido(true);
    } catch (e: any) {
      addNotification('Não foi possível registrar', e.message, true);
    } finally {
      setPedindoAviso(false);
    }
  };

  const restantes = LIMITE_MENSAGEM - mensagem.length;
  const rotuloAtual = rotuloDaNota(nota);
  const assuntoEmail = encodeURIComponent('Suporte SB Gestor');

  return (
    <div className="suporte-page">
      {/* ---------------- Cabeçalho ---------------- */}
      <header className="suporte-hero">
        <span className="suporte-hero-selo">
          <Sparkles size={14} aria-hidden="true" />
          Cuidado com seu Ateliê
        </span>
        <h1>Como podemos ajudar você hoje?</h1>
        <p>
          Sabemos a dedicação que envolve separar cada acervo, calcular propostas e deixar cada
          festa inesquecível. Nosso suporte existe para garantir que sua gestão siga tão leve
          quanto suas celebrações.
        </p>
      </header>

      <div className="suporte-grade">
        {/* ================= COLUNA ESQUERDA ================= */}
        <div className="suporte-coluna">

          {/* ---------------- Avaliação ---------------- */}
          <section className="suporte-card" aria-labelledby="suporte-avaliacao-titulo">
            <div className="suporte-card-topo">
              <span className="suporte-card-icone rosa" aria-hidden="true">
                <MessageSquareHeart size={18} />
              </span>
              <div>
                <h2 id="suporte-avaliacao-titulo">Sua opinião sobre o sistema</h2>
                <p className="suporte-card-sub">Como tem sido gerenciar seu ateliê com o SB Gestor?</p>
              </div>
            </div>

            {/* radiogroup de verdade, e não cinco botões soltos: escolher UMA de
                cinco é o que um rádio significa. Isso obriga o par que o padrão
                exige — tabIndex rotativo (o grupo inteiro é UMA parada de Tab) e
                setas para percorrer. Sem os dois, role="radio" só mente para o
                leitor de tela. */}
            <div
              className="suporte-carinhas"
              role="radiogroup"
              aria-label="Sua avaliação do SB Gestor"
              onKeyDown={aoNavegarCarinhas}
            >
              {CARINHAS.map((c, i) => {
                const marcada = nota === c.nota;
                return (
                  <button
                    key={c.nota}
                    type="button"
                    role="radio"
                    aria-checked={marcada}
                    aria-label={c.rotulo}
                    // Nada marcado ainda: a primeira carinha é a porta de entrada.
                    tabIndex={marcada || (nota === null && i === 0) ? 0 : -1}
                    data-carinha={c.nota}
                    className={cn('suporte-carinha', marcada && 'marcada')}
                    onClick={() => avaliar(c.nota)}
                  >
                    <span className="suporte-carinha-emoji" aria-hidden="true">{c.emoji}</span>
                    <span className="suporte-carinha-rotulo">{c.rotulo}</span>
                  </button>
                );
              })}
            </div>

            {/* role="status": a confirmação é lida em voz alta sem roubar o foco. */}
            <p className="suporte-avaliacao-eco" role="status">
              {rotuloAtual ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  <span>
                    {saudacaoDaNota(nota as number)} Sua avaliação atual está como{' '}
                    <strong>{rotuloAtual}</strong>.
                  </span>
                </>
              ) : (
                <span>Toque em uma carinha para registrar sua avaliação.</span>
              )}
            </p>
          </section>

          {/* ---------------- Opinião ---------------- */}
          <section className="suporte-card" aria-labelledby="suporte-opiniao-titulo">
            <div className="suporte-card-topo">
              <span className="suporte-card-icone lilas" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div>
                <h2 id="suporte-opiniao-titulo">O que podemos melhorar no SB Gestor?</h2>
                <p className="suporte-card-sub">
                  Sem formulários burocráticos — conte com suas próprias palavras, como se
                  estivesse no WhatsApp.
                </p>
              </div>
            </div>

            <p className="suporte-chips-rotulo" id="suporte-chips-rotulo">
              Atalhos rápidos para adicionar ao assunto:
            </p>
            <div className="suporte-chips" role="group" aria-labelledby="suporte-chips-rotulo">
              {ASSUNTOS_SUPORTE.map((assunto) => (
                <button
                  key={assunto}
                  type="button"
                  className={cn('suporte-chip', assuntos.includes(assunto) && 'usado')}
                  onClick={() => inserirAssunto(assunto)}
                >
                  {assunto}
                </button>
              ))}
            </div>

            <label className="suporte-campo-rotulo" htmlFor="suporte-mensagem">
              Sua mensagem
            </label>
            <textarea
              id="suporte-mensagem"
              ref={textoRef}
              className="suporte-textarea"
              rows={6}
              maxLength={LIMITE_MENSAGEM}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              aria-describedby="suporte-contador"
              placeholder={
                'Ex.: "Adoraria poder agrupar cilindros e bandejas em kits para montar ' +
                'orçamentos mais rápido…" ou "Senti falta de poder anexar foto de referência ' +
                'da paleta de balões…"'
              }
            />

            <div className="suporte-opiniao-rodape">
              <span
                id="suporte-contador"
                className={cn('suporte-contador', restantes <= 50 && 'no-limite')}
              >
                {mensagem.length}/{LIMITE_MENSAGEM} caracteres
              </span>
              <button
                type="button"
                className="suporte-botao-enviar"
                onClick={enviarOpiniao}
                disabled={!mensagem.trim() || enviandoOpiniao}
              >
                <Send size={16} aria-hidden="true" />
                {enviandoOpiniao ? 'Enviando…' : 'Enviar Minha Opinião'}
              </button>
            </div>

            <p className="suporte-nota-rodape">
              <Lock size={13} aria-hidden="true" />
              Seu feedback é lido diretamente pelos fundadores.
            </p>
          </section>
        </div>

        {/* ================= COLUNA DIREITA ================= */}
        <div className="suporte-coluna">

          {/* ---------------- E-mail ---------------- */}
          <section className="suporte-card" aria-labelledby="suporte-email-titulo">
            <div className="suporte-card-topo">
              <span className="suporte-card-icone azul" aria-hidden="true">
                <Mail size={18} />
              </span>
              <div>
                <h2 id="suporte-email-titulo">Prefere falar diretamente conosco?</h2>
                <p className="suporte-card-sub">
                  Atendimento dedicado para dúvidas com orçamentos complexos ou suporte urgente
                  durante a montagem no fim de semana.
                </p>
              </div>
            </div>

            <div className="suporte-email-caixa">
              <span className="suporte-email-rotulo">E-mail oficial de suporte</span>
              <div className="suporte-email-linha">
                <span className="suporte-email-valor">{EMAIL_SUPORTE}</span>
                <button type="button" className="suporte-copiar" onClick={copiarEmail}>
                  {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <a className="suporte-botao-email" href={`mailto:${EMAIL_SUPORTE}?subject=${assuntoEmail}`}>
              <Mail size={16} aria-hidden="true" />
              Escrever agora por e-mail
            </a>

            <p className="suporte-nota-rodape">
              <ShieldCheck size={13} aria-hidden="true" />
              Respondemos normalmente no mesmo dia (incluindo plantões de sábado).
            </p>
          </section>

          {/* ---------------- Assistente de IA (vitrine) ---------------- */}
          <section className="suporte-card suporte-card-ia" aria-labelledby="suporte-ia-titulo">
            <div className="suporte-card-topo">
              <span className="suporte-card-icone roxo" aria-hidden="true">
                <Bot size={18} />
              </span>
              <div>
                <h2 id="suporte-ia-titulo">Assistente Virtual com IA</h2>
                <span className="suporte-selo-breve">Novidade em breve</span>
              </div>
            </div>

            <p className="suporte-card-sub">
              Imagine tirar dúvidas 24/7 sobre sugestão de precificação de kits de festa, cálculo
              automático de balões por metro e reconciliação rápida de acervo com inteligência
              artificial.
            </p>

            <button
              type="button"
              className="suporte-botao-aviso"
              onClick={pedirAviso}
              disabled={avisoPedido || pedindoAviso}
            >
              {avisoPedido ? <Check size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
              {avisoPedido ? 'Avisaremos você!' : pedindoAviso ? 'Registrando…' : 'Avise-me quando lançar'}
            </button>

            <p className="suporte-nota-rodape" role="status">
              {avisoPedido
                ? 'Anotado. Você será avisada assim que o assistente existir.'
                : 'Ainda não está disponível — este espaço é só a prévia do que vem.'}
            </p>
          </section>

          {/* ---------------- FAQ ---------------- */}
          <section className="suporte-card" aria-labelledby="suporte-faq-titulo">
            <div className="suporte-card-topo">
              <span className="suporte-card-icone verde" aria-hidden="true">
                <HelpCircle size={18} />
              </span>
              <div>
                <h2 id="suporte-faq-titulo">Dúvidas Frequentes das Decoradoras</h2>
              </div>
            </div>

            <ul className="suporte-faq">
              {FAQ_SUPORTE.map((item) => {
                const expandida = aberta === item.id;
                return (
                  <li key={item.id} className={cn('suporte-faq-item', expandida && 'aberta')}>
                    <h3 className="suporte-faq-titulo">
                      <button
                        type="button"
                        className="suporte-faq-gatilho"
                        aria-expanded={expandida}
                        aria-controls={`faq-resposta-${item.id}`}
                        id={`faq-pergunta-${item.id}`}
                        onClick={() => setAberta(expandida ? null : item.id)}
                      >
                        <span>{item.pergunta}</span>
                        <ChevronDown className="suporte-faq-seta" size={18} aria-hidden="true" />
                      </button>
                    </h3>
                    <div
                      id={`faq-resposta-${item.id}`}
                      role="region"
                      aria-labelledby={`faq-pergunta-${item.id}`}
                      className="suporte-faq-resposta"
                      hidden={!expandida}
                    >
                      {item.resposta ? (
                        <p>{item.resposta}</p>
                      ) : (
                        // Placeholder honesto: melhor dizer que ainda não há resposta
                        // do que inventar um passo a passo que não funciona.
                        <p className="suporte-faq-pendente">
                          Resposta em breve. Enquanto isso, escreva para{' '}
                          <a href={`mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(item.pergunta)}`}>
                            {EMAIL_SUPORTE}
                          </a>{' '}
                          que respondemos você direto.
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
