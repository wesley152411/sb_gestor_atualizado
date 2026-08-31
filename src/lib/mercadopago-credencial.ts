// Regras sobre a CREDENCIAL do Mercado Pago — funções puras, sem segredo dentro e
// sem 'server-only', para poderem ser testadas de verdade. O módulo que realmente
// usa o Access Token é @/lib/mercadopago, e esse é server-only.

export type ModoMP = 'teste' | 'producao';

// O prefixo é o que distingue os dois mundos:
//   TEST-...      credenciais de TESTE da própria aplicação. Note que /users/me
//                 devolve a conta REAL — elas pertencem a ela, mas operam em teste.
//   APP_USR-...   produção, OU credenciais de um usuário de teste (aí /users/me
//                 traz a tag 'test_user'). Só a API distingue esses dois; por
//                 prefixo, tratamos APP_USR- como produção e exigimos a checagem
//                 online em script que escreve (ver verificarContaSandbox).
export function modoDoToken(token: string): ModoMP {
  return token.startsWith('TEST-') ? 'teste' : 'producao';
}

// Qual mundo ESTE processo deveria estar usando. MP_AMBIENTE manda quando existe
// (útil em preview deploy); senão vale o NODE_ENV.
export function ambienteEsperado(env: Record<string, string | undefined>): ModoMP {
  const explicito = env.MP_AMBIENTE;
  if (explicito === 'teste' || explicito === 'producao') return explicito;
  return env.NODE_ENV === 'production' ? 'producao' : 'teste';
}

export type Coerencia = { ok: true; modo: ModoMP } | { ok: false; motivo: string };

// Confere nos DOIS sentidos, porque os dois erros são caros e silenciosos:
//   dev/teste com credencial de produção  -> cobrança REAL em cliente real;
//   produção com credencial de teste      -> NINGUÉM é cobrado, e nada reclama.
export function conferirCoerencia(token: string, esperado: ModoMP): Coerencia {
  const modo = modoDoToken(token);
  if (modo === esperado) return { ok: true, modo };
  if (esperado === 'teste') {
    return {
      ok: false,
      motivo:
        'Credencial de PRODUÇÃO em ambiente de teste: uma escrita aqui cobraria ' +
        'de verdade. Use as credenciais de teste (token TEST-) ou defina MP_AMBIENTE=producao ' +
        'se este processo é mesmo produção.',
    };
  }
  return {
    ok: false,
    motivo:
      'Credencial de TESTE em ambiente de produção: nenhuma cobrança sairia e a ' +
      'falha seria silenciosa. Configure MP_ACCESS_TOKEN de produção na Netlify.',
  };
}

// Tira segredo de qualquer texto ANTES de ele virar log ou mensagem de erro.
// Aplicado no corpo de resposta do MP e em toda exceção que sai daqui.
const PADROES: RegExp[] = [
  /\b(?:TEST|APP_USR)-[A-Za-z0-9_-]{8,}/g, // access token / public key
  /\bBearer\s+\S+/gi,                      // header de autorização
  // 48+ de propósito: o id de preapproval tem 32 hex e PRECISA sobreviver no log,
  // senão o diagnóstico de cobrança fica cego. A assinatura do MP tem 64.
  /\b[0-9a-f]{48,}\b/gi,
];

export function redigirSegredos(texto: string): string {
  return PADROES.reduce((acc, padrao) => acc.replace(padrao, '[REDIGIDO]'), texto);
}
