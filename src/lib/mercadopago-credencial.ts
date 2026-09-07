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
export type ClasseToken = 'teste_pelo_prefixo' | 'indeterminado';

// O prefixo NÃO decide sozinho, e essa é a lição que custou uma sessão inteira:
//   TEST-...     credenciais de teste da própria aplicação. Sempre sandbox.
//   APP_USR-...  AMBÍGUO. É produção OU credencial de um usuário de teste — numa
//                conta de teste, as credenciais "de produção" já SÃO de sandbox.
// Só /users/me distingue os dois, pela tag 'test_user'. Por isso este módulo
// classifica, e quem autoriza é a confirmação ONLINE em @/lib/mercadopago.
export function classeDoToken(token: string): ClasseToken {
  return token.startsWith('TEST-') ? 'teste_pelo_prefixo' : 'indeterminado';
}

/** @deprecated use classeDoToken — o prefixo sozinho não distingue produção de usuário de teste. */
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

export type Coerencia =
  | { resultado: 'aceita'; modo: ModoMP }
  | { resultado: 'recusa'; motivo: string }
  | { resultado: 'exige_confirmacao_online'; motivo: string };

// Confere nos DOIS sentidos, porque os dois erros são caros e silenciosos:
//   dev/teste com credencial de produção  -> cobrança REAL em cliente real;
//   produção com credencial de teste      -> NINGUÉM é cobrado, e nada reclama.
//
// O caso 'exige_confirmacao_online' é o novo: APP_USR- num ambiente de teste pode
// ser produção (proibido) ou um usuário de teste (permitido). Declarar não basta —
// se bastasse, MP_AMBIENTE=teste viraria a porta pela qual uma credencial de
// produção entra no ambiente de teste. Quem autoriza é a tag 'test_user'.
export function conferirCoerencia(token: string, esperado: ModoMP): Coerencia {
  const classe = classeDoToken(token);

  if (classe === 'teste_pelo_prefixo') {
    if (esperado === 'teste') return { resultado: 'aceita', modo: 'teste' };
    return {
      resultado: 'recusa',
      motivo:
        'Credencial de TESTE em ambiente de produção: nenhuma cobrança sairia e a ' +
        'falha seria silenciosa. Configure MP_ACCESS_TOKEN de produção na Netlify.',
    };
  }

  // APP_USR-: ambíguo.
  if (esperado === 'producao') return { resultado: 'aceita', modo: 'producao' };
  return {
    resultado: 'exige_confirmacao_online',
    motivo:
      'Token APP_USR- em ambiente de teste: pode ser produção (proibido) ou um ' +
      'usuário de teste (permitido). Confirmando pela tag test_user em /users/me.',
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
