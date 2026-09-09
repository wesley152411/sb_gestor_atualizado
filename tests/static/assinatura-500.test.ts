import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import { conferirCoerencia, ambienteEsperado, redigirSegredos } from '@/lib/mercadopago-credencial';

// POR QUE ESTE TESTE EXISTE
//
// A primeira decoradora REAL que tentou assinar recebeu 500 três vezes seguidas.
// A rota /api/billing/subscribe não tinha try/catch: qualquer exceção —
// credencial do Mercado Pago incoerente, MP fora do ar, erro do Prisma — subia
// como 500 mudo. A decoradora via "Não foi possível iniciar a assinatura" e não
// sobrava pista NENHUMA com contexto.
//
// O defeito não é só o erro em si: é que o erro não deixava rastro. Um 500 sem
// log com contexto é o pior desfecho possível, porque impede o diagnóstico.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

describe('nenhuma exceção escapa da rota de assinatura', () => {
  const fonte = ler('src/app/api/billing/subscribe/route.ts');

  it('criarAssinatura roda DENTRO de um try', () => {
    const chamada = fonte.indexOf('await criarAssinatura(');
    const tryAntes = fonte.lastIndexOf('try {', chamada);
    const catchDepois = fonte.indexOf('} catch', chamada);
    expect(chamada, 'a rota deveria chamar criarAssinatura').toBeGreaterThan(-1);
    expect(tryAntes, 'sem try, a exceção vira 500 mudo').toBeGreaterThan(-1);
    expect(catchDepois).toBeGreaterThan(chamada);
  });

  it('o catch registra com etiqueta buscável', () => {
    // Sem etiqueta, achar a requisição no log da Netlify é caçar agulha.
    expect(fonte).toMatch(/\[ASSINATURA-EXCECAO\]/);
    expect(fonte, 'o log precisa dizer QUEM tentou').toMatch(/decoradora=\$\{acesso\.decoratorId\}/);
  });

  it('o que vai para o log passa pela redação de segredos', () => {
    expect(fonte).toMatch(/redigirSegredos\(detalhe\)/);
  });

  it('a resposta ao navegador NÃO é 500 nem carrega o detalhe', () => {
    const catchBloco = fonte.slice(fonte.indexOf('} catch (motivo)'), fonte.indexOf('if (!resultado.ok)'));
    expect(catchBloco).toMatch(/status: 502/);
    expect(catchBloco, 'detalhe de configuração não é assunto da decoradora')
      .not.toMatch(/error: .*\$\{detalhe\}/);
  });
});

describe('a redação de segredos cobre o token do Mercado Pago', () => {
  it('não deixa passar um APP_USR- inteiro para o log', () => {
    const token = 'APP_USR-1234567890123456-090912-abcdef1234567890abcdef1234567890-123456789';
    expect(redigirSegredos(`falhou com ${token}`), 'token cru no log é vazamento')
      .not.toContain(token);
  });

  it('não deixa passar um TEST- inteiro', () => {
    const token = 'TEST-1234567890123456-090912-abcdef1234567890abcdef1234567890-123456789';
    expect(redigirSegredos(`falhou com ${token}`)).not.toContain(token);
  });
});

describe('o operador consegue ver o veredito da credencial', () => {
  const saude = ler('src/app/api/billing/saude/route.ts');

  it('a saúde expõe o diagnóstico, e SÓ para o operador', () => {
    const guarda = saude.indexOf("process.env.OPERADOR_DECORATOR_ID !== acesso.decoratorId");
    const diagnostico = saude.indexOf('diagnosticoCredencial()');
    expect(guarda, 'a rota precisa continuar restrita ao operador').toBeGreaterThan(-1);
    expect(diagnostico, 'o diagnóstico precisa vir DEPOIS da guarda').toBeGreaterThan(guarda);
  });

  it('o diagnóstico devolve veredito, nunca o segredo', () => {
    const mp = ler('src/lib/mercadopago.ts');
    const bloco = mp.slice(mp.indexOf('export async function diagnosticoCredencial'), mp.indexOf('export type RespostaMP'));
    expect(bloco, 'o token não pode sair no retorno').not.toMatch(/token,\s*$/m);
    expect(bloco).toMatch(/modo:/);
    expect(bloco).toMatch(/esperado:/);
    expect(bloco).toMatch(/motivo:/);
  });
});

describe('o veredito que a credencial errada produz', () => {
  it('TEST- em produção é RECUSA, e o motivo diz o que fazer', () => {
    // É a hipótese mais provável do 500: as credenciais de sandbox usadas em
    // toda a fase de teste continuarem na Netlify.
    const r = conferirCoerencia('TEST-123', 'producao');
    expect(r.resultado).toBe('recusa');
    expect(r.resultado === 'recusa' && r.motivo).toMatch(/MP_ACCESS_TOKEN de produção na Netlify/);
  });

  it('APP_USR- em produção é aceito', () => {
    expect(conferirCoerencia('APP_USR-123', 'producao').resultado).toBe('aceita');
  });

  it('produção é o esperado quando NODE_ENV=production e MP_AMBIENTE está ausente', () => {
    expect(ambienteEsperado({ NODE_ENV: 'production' })).toBe('producao');
    // E o inverso, que é a armadilha: MP_AMBIENTE=teste na Netlify faria a
    // guarda esperar sandbox e recusar a credencial de produção.
    expect(ambienteEsperado({ NODE_ENV: 'production', MP_AMBIENTE: 'teste' })).toBe('teste');
  });
});
