import 'server-only';

import {
  ambienteEsperado,
  conferirCoerencia,
  modoDoToken,
  redigirSegredos,
  type ModoMP,
} from '@/lib/mercadopago-credencial';

// ÚNICO ponto do sistema que toca o Access Token do Mercado Pago.
//
// Três regras que estão no CÓDIGO e não na disciplina de quem escreve:
//   1. 'server-only' no topo — importar isto de componente cliente quebra o build.
//      Nunca existe MP_ACCESS_TOKEN com prefixo NEXT_PUBLIC_: esse prefixo faz o
//      Next embutir o valor no bundle do navegador.
//   2. O token é lido DENTRO da função, nunca em escopo de módulo. Não há
//      constante exportável, nem valor capturado em closure que vaze num dump.
//   3. Tudo que sai daqui — corpo de resposta e mensagem de exceção — passa por
//      redigirSegredos(). Log de erro do Mercado Pago costuma ecoar o request.
//
// As rotas usam mpFetch e nunca veem o token.

const API = 'https://api.mercadopago.com';
const TIMEOUT_PADRAO_MS = 8000;

export class ErroMercadoPago extends Error {
  readonly status: number;
  readonly corpo: unknown;
  constructor(mensagem: string, status: number, corpo?: unknown) {
    // A mensagem já chega redigida; redige de novo por garantia — é barato.
    super(redigirSegredos(mensagem));
    this.name = 'ErroMercadoPago';
    this.status = status;
    this.corpo = corpo;
  }
}

// Lê e VALIDA a credencial a cada chamada. A validação é nos dois sentidos:
// credencial de produção em ambiente de teste cobraria de verdade; credencial de
// teste em produção não cobraria ninguém e ninguém reclamaria.
function credencial(): { token: string; modo: ModoMP } {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new ErroMercadoPago('MP_ACCESS_TOKEN ausente no ambiente do servidor.', 0);
  }
  const esperado = ambienteEsperado(process.env);
  const coerencia = conferirCoerencia(token, esperado);
  if (!coerencia.ok) throw new ErroMercadoPago(coerencia.motivo, 0);
  return { token, modo: coerencia.modo };
}

// Diagnóstico seguro para log e telas internas: diz o MODO, nunca o segredo.
export function modoMercadoPago(): ModoMP | 'ausente' {
  const token = process.env.MP_ACCESS_TOKEN;
  return token ? modoDoToken(token) : 'ausente';
}

export type RespostaMP<T> = { status: number; body: T };

type OpcoesMP = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Chave de idempotência do MP. Obrigatória em POST que cria cobrança. */
  idempotencia?: string;
  timeoutMs?: number;
};

/**
 * Chamada à API do Mercado Pago. Devolve status e corpo já parseado; NÃO lança
 * para status HTTP de erro — quem chama decide, porque 404 e 409 têm significado
 * de negócio aqui. Lança apenas para falha de rede, timeout ou credencial incoerente.
 */
export async function mpFetch<T = unknown>(caminho: string, opcoes: OpcoesMP = {}): Promise<RespostaMP<T>> {
  const { token } = credencial();
  const { method = 'GET', body, idempotencia, timeoutMs = TIMEOUT_PADRAO_MS } = opcoes;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (idempotencia) headers['X-Idempotency-Key'] = idempotencia;

  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
  } catch (motivo) {
    // A mensagem de rede pode ecoar a URL e headers; redige antes de propagar.
    const detalhe = motivo instanceof Error ? motivo.message : String(motivo);
    throw new ErroMercadoPago(`Falha ao falar com o Mercado Pago (${method} ${caminho}): ${detalhe}`, 0);
  }

  const texto = await resposta.text();
  let corpo: unknown;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta não-JSON (HTML de erro, por exemplo): guarda redigida e truncada.
    corpo = { naoJson: redigirSegredos(texto).slice(0, 500) };
  }
  return { status: resposta.status, body: corpo as T };
}

/**
 * Texto curto e SEGURO para log de uma resposta do Mercado Pago. Use isto em vez
 * de despejar o corpo cru: a API deles ecoa partes da requisição em erro.
 */
export function resumoParaLog(caminho: string, resposta: RespostaMP<unknown>): string {
  const corpo = redigirSegredos(JSON.stringify(resposta.body ?? null)).slice(0, 300);
  return `[mp] ${caminho} -> HTTP ${resposta.status} ${corpo}`;
}

/**
 * Guarda ONLINE de sandbox, para SCRIPT que escreve no Mercado Pago.
 *
 * O prefixo sozinho não basta: 'APP_USR-' tanto é produção quanto credencial de
 * um USUÁRIO DE TESTE. Só /users/me distingue, pela tag 'test_user'. Em
 * 2026-08-31 a versão que checava só a tag deu falso alarme com credencial
 * 'TEST-' legítima — por isso os dois sinais valem.
 */
export async function verificarContaSandbox(): Promise<{ sandbox: boolean; conta: string; porque: string }> {
  const { token } = credencial();
  const me = await mpFetch<{ nickname?: string; email?: string; tags?: string[] }>('/users/me');
  const porPrefixo = modoDoToken(token) === 'teste';
  const porTag = (me.body?.tags ?? []).includes('test_user');
  return {
    sandbox: porPrefixo || porTag,
    conta: me.body?.nickname ?? '(desconhecida)',
    porque: porPrefixo ? 'prefixo TEST-' : porTag ? 'tag test_user' : 'nenhum sinal de teste',
  };
}
