// Teste autenticado do RLS — prova que a POLICY está correta, não só ligada.
// (O 401 anônimo só prova que o RLS está ativo; sem sessão o acesso é negado de
//  qualquer forma. Aqui usamos tokens reais para exercitar a policy.)
//
// Fluxo: cria 2 usuários -> semeia 1 linha de cada por tabela -> concede SELECT
// TEMPORÁRIO a `authenticated` -> chama o PostgREST com o token de cada usuário
// e confirma que cada um vê SÓ a própria linha (nem zero, nem a do outro, nem
// dados de produção) -> REVOGA o grant (restaura o estado fechado) -> limpa.
//
// Rodar da raiz do projeto:  node docs/security/rls-auth-test.mjs
// Requer RLS já aplicado nas tabelas testadas (ver rls-enable.sql).
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

for (const f of ['.env.local', '.env']) {
  try { for (const line of readFileSync(f,'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g,'');
  } } catch {}
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const p = new PrismaClient();
const sb = createClient(URL, ANON, { auth: { persistSession: false } });

// Lote 1 (dados de cliente). Estender com o Lote 2 quando aplicado:
// decorators, inventory_items, kits, consumables, forum_posts.
const TABLES = ['clients','party_events','rental_orders','rental_order_items','chat_messages'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('   OK  ', m); } else { fail++; console.log('   FALHA', m); } };

async function mkUser(tag) {
  const email = `rlsauth_${tag}_${Date.now()}@sbgestor-test.local`;
  const { data, error } = await sb.auth.signUp({ email, password: 'RlsAuth12345!' });
  if (error || !data.session) throw new Error(`signUp ${tag}: ${error?.message||'sem sessão'}`);
  return { id: data.user.id, token: data.session.access_token };
}
async function restGet(table, token) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  let b = []; try { b = await r.json(); } catch {}
  return { status: r.status, ids: Array.isArray(b) ? b.map(x=>x.id) : [] };
}
const ex = (s) => p.$executeRawUnsafe(s);

try {
  const A = await mkUser('A'), B = await mkUser('B');
  const t = Date.now();
  await ex(`INSERT INTO public.decorators (id,name) VALUES ('${A.id}','RLS A'),('${B.id}','RLS B')`);
  const ID = {}; for (const tb of TABLES) ID[tb] = { A: `${tb}_A_${t}`, B: `${tb}_B_${t}` };
  await ex(`INSERT INTO public.clients (id,name,decorator_id) VALUES ('${ID.clients.A}','cli A','${A.id}'),('${ID.clients.B}','cli B','${B.id}')`);
  await ex(`INSERT INTO public.party_events (id,client_name,decorator_id) VALUES ('${ID.party_events.A}','ev A','${A.id}'),('${ID.party_events.B}','ev B','${B.id}')`);
  await ex(`INSERT INTO public.rental_orders (id,total_value,owner_id) VALUES ('${ID.rental_orders.A}',10,'${A.id}'),('${ID.rental_orders.B}',20,'${B.id}')`);
  await ex(`INSERT INTO public.rental_order_items (id,order_id,name) VALUES ('${ID.rental_order_items.A}','${ID.rental_orders.A}','it A'),('${ID.rental_order_items.B}','${ID.rental_orders.B}','it B')`);
  await ex(`INSERT INTO public.chat_messages (id,message,sender_id,receiver_id) VALUES ('${ID.chat_messages.A}','msg A','${A.id}','${A.id}'),('${ID.chat_messages.B}','msg B','${B.id}','${B.id}')`);

  const pre = await restGet('clients', A.token);
  ok(pre.status===401||pre.status===403, `sem GRANT: authenticated barrado -> HTTP ${pre.status}`);

  for (const tb of TABLES) await ex(`GRANT SELECT ON public.${tb} TO authenticated`);
  for (const tb of TABLES) {
    const ra = await restGet(tb, A.token), rb = await restGet(tb, B.token);
    ok(ra.status===200 && rb.status===200, `${tb}: HTTP 200 (A=${ra.status} B=${rb.status})`);
    ok(ra.ids.includes(ID[tb].A) && !ra.ids.includes(ID[tb].B) && ra.ids.length===1, `${tb}: A vê só a própria (viu ${ra.ids.length})`);
    ok(rb.ids.includes(ID[tb].B) && !rb.ids.includes(ID[tb].A) && rb.ids.length===1, `${tb}: B vê só a própria (viu ${rb.ids.length})`);
  }
  for (const tb of TABLES) await ex(`REVOKE SELECT ON public.${tb} FROM authenticated`);
  const post = await restGet('clients', A.token);
  ok(post.status===401||post.status===403, `após REVOKE: fechado de novo -> HTTP ${post.status}`);

  await p.decorator.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  console.log(`\n=== ${pass} OK, ${fail} FALHA ===`);
  process.exit(fail ? 1 : 0);
} catch (e) { console.error('ERRO:', e.message); process.exit(1); }
finally { await p.$disconnect(); }
