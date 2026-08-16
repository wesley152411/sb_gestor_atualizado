import { createServerClient } from '@supabase/ssr';
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

// Cria uma conta REAL de teste (auto-confirma) e garante o perfil (lazy /me).
export async function createTestAccount(label: string): Promise<TestAccount> {
  const jar: Jar = new Map();
  const supabase = clientWithJar(jar);
  const email = `harness_${label}_${Date.now()}@sbgestor-test.local`;
  const password = 'Harness12345!';

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { company_name: `Harness ${label}`, name: `Harness ${label}`, location: 'Cidade Teste - TS' } },
  });
  if (error || !data.user) throw new Error(`signUp falhou (${label}): ${error?.message}`);

  // força a persistência da sessão no jar
  await supabase.auth.getUser();
  const cookie = jarToHeader(jar);
  if (!cookie) throw new Error(`sem cookie de sessão (${label})`);

  // cria o perfil da decoradora (identidade pela sessão)
  const res = await fetch(`${BASE_URL}/api/decorators/me`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: '{}',
  });
  if (!res.ok) throw new Error(`criar perfil falhou (${label}): HTTP ${res.status}`);

  return { id: data.user.id, email, cookie };
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
