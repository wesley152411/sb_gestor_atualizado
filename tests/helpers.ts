import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { assertBancoDeTesteParaApagar } from './guard';

// ----- carrega .env.local / .env (Vitest não faz isso sozinho) -----
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    try {
      const txt = readFileSync(f, 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
        }
      }
    } catch { /* arquivo ausente */ }
  }
}
loadEnv();

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export const prisma = new PrismaClient();

type Jar = Map<string, string>;

// Cliente Supabase apoiado num "cookie jar" — ao logar, a MESMA lib (@supabase/ssr)
// escreve o cookie de sessão no formato que o servidor Next lê. Assim o teste
// exercita exatamente o caminho de cookie de produção.
function clientWithJar(jar: Jar) {
  return createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
}

function jarToHeader(jar: Jar): string {
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; ');
}

export type TestAccount = { id: string; email: string; cookie: string };

// Senha única de todas as contas do harness. Exportada porque os testes de
// imutabilidade precisam de um token de acesso REAL (PostgREST), não do cookie.
export const HARNESS_PASSWORD = 'Harness12345!';

// Cliente PostgREST autenticado como a conta de teste — exercita as políticas de
// RLS/grants do jeito que um navegador com a anon key faria.
export async function restClientFor(email: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: HARNESS_PASSWORD });
  if (error) throw new Error(`🛑 Pré-condição do harness — login PostgREST falhou (${email}): ${error.message}`);
  return client;
}

// Cliente Supabase com a SERVICE ROLE (Admin API). Só no harness/CI.
function adminClient() {
  if (!SERVICE_KEY) {
    throw new Error(
      '🛑 Pré-condição do harness — SUPABASE_SERVICE_ROLE_KEY ausente. O CI precisa do secret ' +
      'TEST_SUPABASE_SERVICE_ROLE_KEY (Admin API) para criar contas de teste já confirmadas. ' +
      'Sem ele, não há como semear usuários sem passar pelo mailer.'
    );
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Cria uma conta REAL de teste e garante o perfil (lazy /me). O usuário é criado
// pela ADMIN API (service role) com email_confirm:true → nasce JÁ confirmado e SEM
// disparar e-mail de confirmação. Assim o harness NÃO depende da opção "Confirm
// email" do painel do projeto de teste, nem esbarra no limite do mailer embutido
// (que, com a confirmação ligada, derruba o signUp quando se cria várias contas).
// Cada throw abaixo nomeia a pré-condição exata, para o log do CI ser autoexplicativo.
export async function createTestAccount(
  label: string,
  opts: { acceptLegal?: boolean; email?: string } = {},
): Promise<TestAccount> {
  // opts.email: o Mercado Pago exige que pagador e coletor sejam ambos reais ou
  // ambos de teste. Como o coletor passou a ser um usuário de teste do MP, a conta
  // que vai ASSINAR precisa nascer com o e-mail de um comprador de teste do MP.
  // Medido: pagador @sbgestor-test.local -> 400 "Both payer and collector must be
  // real or test users"; pagador @testuser.com -> 201.
  const email = opts.email || `harness_${label}_${Date.now()}@sbgestor-test.local`;
  const password = HARNESS_PASSWORD;

  // 1) Cria o usuário confirmado via Admin API (não envia e-mail).
  const { data: created, error: createErr } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { company_name: `Harness ${label}`, name: `Harness ${label}`, location: 'Cidade Teste - TS' },
  });
  if (createErr || !created?.user) {
    throw new Error(
      `🛑 Pré-condição do harness — falha ao criar usuário (${label}) via Admin API: ` +
      `${createErr?.message || 'retorno sem user'}. Verifique a SERVICE_ROLE key e a URL do projeto de TESTE.`
    );
  }
  const id = created.user.id;

  // 2) Login REAL pelo caminho de cookie de produção (@supabase/ssr + jar). Como o
  //    usuário já nasce confirmado, isto NÃO depende de "Confirm email".
  const jar: Jar = new Map();
  const supabase = clientWithJar(jar);
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(
      `🛑 Pré-condição do harness — login falhou (${label}): ${signInErr.message}. ` +
      `O usuário foi criado confirmado via Admin API, então isto aponta para credenciais/URL do ` +
      `projeto de teste (anon key/URL), NÃO para a opção "Confirm email".`
    );
  }
  const cookie = jarToHeader(jar);
  if (!cookie) {
    throw new Error(`🛑 Pré-condição do harness — login OK mas sem cookie de sessão (${label}): o client @supabase/ssr não gravou o cookie no jar.`);
  }

  // 3) Cria o perfil da decoradora (identidade pela sessão). Exercita o servidor Next.
  const res = await fetch(`${BASE_URL}/api/decorators/me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `🛑 Pré-condição do harness — criar perfil falhou (${label}): HTTP ${res.status} ${body.slice(0, 200)}. ` +
      `O servidor Next respondeu; verifique DATABASE_URL do projeto de teste (caminho Prisma).`
    );
  }

  // 4) Aceite dos documentos legais. SEM isto o gate do servidor devolve 403 em
  //    toda rota de dados — é o mesmo caminho que a decoradora percorre na tela.
  //    `acceptLegal: false` deixa a conta no estado "nunca aceitou", que é o
  //    cenário do teste do gate.
  if (opts.acceptLegal !== false) {
    const legal = await fetch(`${BASE_URL}/api/legal/acceptances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ accept: true }),
    });
    if (!legal.ok) {
      const body = await legal.text().catch(() => '');
      throw new Error(
        `🛑 Pré-condição do harness — aceite legal falhou (${label}): HTTP ${legal.status} ${body.slice(0, 200)}. ` +
        `Confira se a migration 20260830140000_legal_acceptances.sql foi aplicada no banco de TESTE.`
      );
    }
  }

  // Conta de teste NUNCA aparece na vitrine/contatos, nem durante a execução:
  // marca is_internal=true. Se um run vazar a linha, ela fica invisível.
  await prisma.decorator.update({ where: { id }, data: { is_internal: true } });

  return { id, email, cookie };
}

// Pré-condição: o Prisma precisa conseguir AUTENTICAR no banco de TESTE
// (DATABASE_URL). Chamada como primeira linha do beforeAll para transformar o
// stack cru do Prisma numa mensagem que nomeia a causa. Falhas comuns no CI:
// senha rotacionada e não atualizada no secret TEST_DATABASE_URL, ou usuário do
// pooler incorreto (tem de ser postgres.<ref>, não `postgres` puro).
// Descreve o DATABASE_URL SEM vazar a senha: host/porta/db/usuário + só o TAMANHO
// da senha (revela senha vazia ou espaço/quebra-de-linha colados por engano no
// secret). É o que o CI está REALMENTE usando — some com o "adivinhar pelo que salvei".
function describeDbUrl(raw: string): string {
  if (!raw) return 'DATABASE_URL VAZIO (não chegou ao ambiente do CI)';
  const outerWs = raw !== raw.trim() ? ' ⚠ há espaço/quebra nas BORDAS da string inteira' : '';
  const pwInfo = (pw: string) =>
    pw.length === 0 ? 'SEM SENHA' : `senha=${pw.length}chars${/^\s|\s$/.test(pw) ? ' ⚠(espaço nas bordas da senha)' : ''}`;
  try {
    const u = new URL(raw.trim());
    return `host=${u.hostname} port=${u.port || '(default)'} db=${u.pathname.replace(/^\//, '') || '(vazio)'} ` +
      `user=${decodeURIComponent(u.username)} ${pwInfo(decodeURIComponent(u.password || ''))} ` +
      `params=${u.search || '(nenhum)'}${outerWs}`;
  } catch {
    const m = raw.trim().match(/^[a-z]+:\/\/([^:]+):([^@]*)@([^:/?]+)(?::(\d+))?\/?([^?]*)/i);
    if (!m) return `NÃO PARSEÁVEL (len=${raw.length})${outerWs}`;
    return `host=${m[3]} port=${m[4] || '(default)'} db=${m[5] || '(vazio)'} user=${m[1]} ${pwInfo(m[2])} (parse regex)${outerWs}`;
  }
}

export async function assertDbReachable() {
  const target = describeDbUrl(process.env.DATABASE_URL || '');
  console.log('[harness] alvo do Prisma →', target);
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (e: any) {
    const first = String(e?.message || e).split('\n').find((l: string) => l.trim()) || String(e);
    throw new Error(
      '🛑 Pré-condição do harness — o Prisma não autenticou no banco de TESTE (DATABASE_URL). ' +
      'Verifique o secret TEST_DATABASE_URL: (1) a senha é a ATUAL do banco (se você rotacionou, ' +
      'atualize o secret); (2) o usuário do session pooler é postgres.<ref>, não `postgres` puro. ' +
      `Erro do Prisma: ${first}. Alvo resolvido no CI → ${target}`
    );
  }
}

// Varre TODAS as contas de teste (decoradora + Auth) pelo padrão de e-mail.
// Robusto contra execuções interrompidas que deixaram resíduo em produção.
export async function sweepTestAccounts() {
  const users = await prisma.$queryRawUnsafe<{ id: string }[]>(
    // @testuser.com entrou porque a conta que assina usa e-mail de comprador de
    // teste do MP (ver createTestAccount) — sem isso ela não seria varrida.
    `SELECT id FROM auth.users WHERE email LIKE '%@sbgestor-test.local' OR email LIKE '%@example.com' OR email LIKE '%@testuser.com'`
  );
  const ids = users.map((u) => u.id);
  if (ids.length) await prisma.decorator.deleteMany({ where: { id: { in: ids } } });
  await prisma.$executeRawUnsafe(
    `DELETE FROM auth.users WHERE email LIKE '%@sbgestor-test.local' OR email LIKE '%@example.com' OR email LIKE '%@testuser.com'`
  );
}

// Marca/desmarca o e-mail confirmado direto no banco (equivale a clicar/‘descli-
// car’ o link). Usado para preparar contas confirmadas e para testar o cenário
// de conta NÃO confirmada com sessão.
export async function setEmailConfirmed(userId: string, confirmed: boolean) {
  // confirmed_at é coluna GERADA (a partir de email_confirmed_at) — não se seta.
  const val = confirmed ? 'now()' : 'NULL';
  await prisma.$executeRawUnsafe(
    `UPDATE auth.users SET email_confirmed_at = ${val} WHERE id = '${userId}'`
  );
}

// Cadastro CRU, sem confirmar — para inspecionar o estado que o Supabase devolve
// no signUp (sentinela do mailer_autoconfirm).
export async function rawSignUp(label: string) {
  const supabase = clientWithJar(new Map());
  const email = `sentinel_${label}_${Date.now()}@sbgestor-test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: 'Sentinel12345!' });
  if (error || !data.user) throw new Error(`signUp falhou (${label}): ${error?.message}`);
  return { id: data.user.id, email, session: data.session, emailConfirmedAt: data.user.email_confirmed_at ?? null };
}

// Remove um usuário de Auth (e a decoradora, se houver). Usado na limpeza dos
// testes que criam conta sem passar pelo fluxo confirmado.
export async function deleteAuthUser(id: string) {
  await prisma.decorator.deleteMany({ where: { id } });
  await prisma.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = '${id}'`);
}

// Fetch numa rota do app, opcionalmente com o cookie de sessão.
export function api(path: string, cookie: string | null, init: RequestInit = {}) {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (cookie) headers.Cookie = cookie;
  return fetch(`${BASE_URL}${path}`, { ...init, headers });
}

export function post(path: string, cookie: string | null, body: unknown) {
  return api(path, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

// Limpeza: apaga as LINHAS de decoradora de teste (cascata remove clientes,
// eventos, itens, kits, pedidos e chats). Os usuários de Auth ficam órfãos
// (sem service_role não dá pra apagá-los) mas invisíveis sem linha de decoradora.
export async function cleanupAccounts(ids: string[]) {
  if (ids.length) {
    await prisma.decorator.deleteMany({ where: { id: { in: ids } } });
  }
}

// Limpa beneficios_consumidos. EXPLÍCITA de propósito: nenhuma rotina de limpeza
// geral toca nesta tabela, porque a razão de ela existir é justamente sobreviver
// à exclusão da conta. Quem quiser apagá-la tem de chamar isto pelo nome.
//
// A trava é ALLOWLIST (só o ref de teste, nomeado), não blocklist: um banco
// desconhecido — nem teste nem produção — é RECUSADO. É a diferença entre
// improvável e impossível.
export async function limparBeneficiosDoTeste() {
  assertBancoDeTesteParaApagar('limparBeneficiosDoTeste');
  const { count } = await prisma.beneficioConsumido.deleteMany({});
  return count;
}
