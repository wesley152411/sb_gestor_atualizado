import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

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
export async function createTestAccount(label: string): Promise<TestAccount> {
  const email = `harness_${label}_${Date.now()}@sbgestor-test.local`;
  const password = 'Harness12345!';

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
export async function assertDbReachable() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (e: any) {
    const first = String(e?.message || e).split('\n').find((l: string) => l.trim()) || String(e);
    throw new Error(
      '🛑 Pré-condição do harness — o Prisma não autenticou no banco de TESTE (DATABASE_URL). ' +
      'Verifique o secret TEST_DATABASE_URL: (1) a senha é a ATUAL do banco (se você rotacionou, ' +
      'atualize o secret); (2) o usuário do session pooler é postgres.<ref>, não `postgres` puro. ' +
      `Erro do Prisma: ${first}`
    );
  }
}

// Varre TODAS as contas de teste (decoradora + Auth) pelo padrão de e-mail.
// Robusto contra execuções interrompidas que deixaram resíduo em produção.
export async function sweepTestAccounts() {
  const users = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM auth.users WHERE email LIKE '%@sbgestor-test.local' OR email LIKE '%@example.com'`
  );
  const ids = users.map((u) => u.id);
  if (ids.length) await prisma.decorator.deleteMany({ where: { id: { in: ids } } });
  await prisma.$executeRawUnsafe(
    `DELETE FROM auth.users WHERE email LIKE '%@sbgestor-test.local' OR email LIKE '%@example.com'`
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
