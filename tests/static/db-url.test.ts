import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import { ajustarUrlDoBanco, descreverSemSenha } from '@/lib/db-url';

// POR QUE ESTE TESTE EXISTE
//
// A DATABASE_URL da Netlify perdeu `pgbouncer=true` numa troca de variável. Na
// porta 6543 (pooler de transação do Supabase) isso faz o Prisma colidir nomes
// de prepared statements — "prepared statement "s6" already exists" — e TODA
// rota que lê o banco cai, login e aceite legal inclusive.
//
// A correção vive no código para não depender de a variável ser colada
// perfeitamente num painel. Estas provas guardam que o ajuste acontece SÓ onde
// deve, que não mexe na senha, e que nunca a escreve no log.

// Senha com caractere especial CODIFICADO (%40 = @): é o caso real deste banco.
const SENHA = 'ab%40cd%23ef';
const POOLER = `postgresql://postgres.urvbkfyyvbsahdnkkwed:${SENHA}@aws-1-us-west-2.pooler.supabase.com:6543/postgres`;

describe('garante pgbouncer=true no pooler de transação', () => {
  it('acrescenta ?pgbouncer=true quando a URL não tem parâmetros', () => {
    const r = ajustarUrlDoBanco(POOLER);
    expect(r.ajustada).toBe(true);
    expect(r.url).toBe(`${POOLER}?pgbouncer=true`);
  });

  it('acrescenta &pgbouncer=true quando já existem outros parâmetros', () => {
    const r = ajustarUrlDoBanco(`${POOLER}?connection_limit=1`);
    expect(r.url).toBe(`${POOLER}?connection_limit=1&pgbouncer=true`);
  });

  it('não duplica quando já está certo', () => {
    const certo = `${POOLER}?pgbouncer=true&connection_limit=1`;
    const r = ajustarUrlDoBanco(certo);
    expect(r.ajustada, 'configuração certa não pode ser tocada').toBe(false);
    expect(r.url).toBe(certo);
  });

  it('troca pgbouncer=false por true, sem duplicar a chave', () => {
    const r = ajustarUrlDoBanco(`${POOLER}?pgbouncer=false&connection_limit=1`);
    expect(r.ajustada).toBe(true);
    expect(r.url).toBe(`${POOLER}?pgbouncer=true&connection_limit=1`);
    expect(r.url.match(/pgbouncer=/g)).toHaveLength(1);
  });

  it('respeita um fragmento no fim', () => {
    expect(ajustarUrlDoBanco(`${POOLER}#x`).url).toBe(`${POOLER}?pgbouncer=true#x`);
  });
});

describe('não mexe no que não é pooler de transação', () => {
  it('porta 5432 (sessão) passa intacta', () => {
    const sessao = POOLER.replace(':6543/', ':5432/');
    const r = ajustarUrlDoBanco(sessao);
    expect(r.ajustada).toBe(false);
    expect(r.url).toBe(sessao);
  });

  it('vazio, nulo e lixo passam intactos — o Prisma dá o erro certo para eles', () => {
    expect(ajustarUrlDoBanco(undefined)).toEqual({ url: '', ajustada: false });
    expect(ajustarUrlDoBanco(null)).toEqual({ url: '', ajustada: false });
    expect(ajustarUrlDoBanco('isso não é url')).toEqual({ url: 'isso não é url', ajustada: false });
  });
});

describe('a senha é sagrada', () => {
  it('os bytes da senha codificada saem EXATAMENTE iguais', () => {
    // Regravar a URL com new URL().toString() poderia re-codificar a senha.
    // O ajuste é por texto: o trecho da credencial não pode mudar nem um byte.
    const r = ajustarUrlDoBanco(POOLER);
    expect(r.url.startsWith(`postgresql://postgres.urvbkfyyvbsahdnkkwed:${SENHA}@`)).toBe(true);
  });

  it('caractere cru que o URL re-codificaria sai IGUAL (= e ;)', () => {
    // O furo que esta prova fecha: com a senha já codificada (%40, %23), trocar a
    // edição por texto por new URL().toString() passaria igual — a prova acima não
    // distinguiria as duas implementações. `=` e `;` crus SÃO re-codificados pelo
    // toString (viram %3D e %3B). Medido antes de escrever esta prova.
    const cru = 'postgresql://postgres.urvbkfyyvbsahdnkkwed:ab=cd;ef@aws-1-us-west-2.pooler.supabase.com:6543/postgres';
    const r = ajustarUrlDoBanco(cru);
    expect(r.ajustada).toBe(true);
    expect(r.url, 'a credencial não pode ser re-codificada').toBe(`${cru}?pgbouncer=true`);
  });

  it('o motivo do log não contém a senha, nem codificada nem decodificada', () => {
    const r = ajustarUrlDoBanco(POOLER);
    expect(r.motivo).toBeTruthy();
    expect(r.motivo).not.toContain(SENHA);
    expect(r.motivo).not.toContain(decodeURIComponent(SENHA));
    expect(r.motivo, 'nem o usuário, que carrega o ref').not.toContain('postgres.urvbkfyyvbsahdnkkwed');
  });

  it('a descrição para log mostra host, porta e NOMES dos parâmetros, só isso', () => {
    const d = descreverSemSenha(`${POOLER}?connection_limit=1`);
    expect(d).toBe('aws-1-us-west-2.pooler.supabase.com:6543/postgres (params: connection_limit)');
    expect(d).not.toContain(SENHA);
  });
});

describe('o cliente Prisma usa o ajuste', () => {
  const fonte = readFileSync(path.join(RAIZ, 'src/lib/prisma.ts'), 'utf8');

  it('passa a URL pelo ajuste antes de criar o cliente', () => {
    expect(fonte).toMatch(/ajustarUrlDoBanco\(process\.env\.DATABASE_URL\)/);
  });

  it('só sobrescreve a URL quando precisou ajustar', () => {
    // Configuração certa tem de continuar exatamente como antes — o Prisma lendo
    // o env sozinho. Sobrescrever sempre mudaria o caminho de quem está correto.
    expect(fonte).toMatch(/ajuste\.ajustada \? \{ datasources: \{ db: \{ url: ajuste\.url \} \} \} : \{\}/);
  });

  it('avisa no log com etiqueta buscável quando ajustou', () => {
    expect(fonte).toMatch(/\[DB-URL\]/);
  });
});
