// Exclusão TOTAL de uma decoradora — fecha o gap do inventário de dados:
//   1) tabelas do app  → cascata do FK (apagar a linha em decorators leva junto
//      clients, party_events, kits, inventory_items, consumables, forum_posts,
//      chat_messages, rental_orders(+items), client_promo_messages).
//   2) login            → DELETE em auth.users (leva o e-mail, a senha e o
//      raw_user_meta_data, INCLUINDO o CNPJ e o company_name).
//   3) arquivos         → remove os objetos dos buckets Storage 'avatars' e
//      'inventory' sob o prefixo <id>/ (precisa do SERVICE ROLE — a API de Storage
//      exige; deletar só a metadata por SQL orfanizaria os bytes no S3).
//
// SEGURO: dry-run por padrão (só mostra o que apagaria). Destrói só com --apply.
// NUNCA roda automático — exclusão é sempre acionada manualmente.
//
// Uso:
//   node scripts/delete-decorator.cjs --id=<uuid> --env=prod --expect-ref=<ref> [--apply]
//   node scripts/delete-decorator.cjs --email=<email> --env=prod --expect-ref=<ref> [--apply]
//   (o Storage exige SUPABASE_SERVICE_ROLE_KEY no ambiente — pegue em
//    Supabase → Settings → API; não commite essa chave.)
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const get = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : undefined; };
const envMode = get('env') || 'test';
const expectRef = get('expect-ref');
const idArg = get('id');
const emailArg = get('email');
const apply = args.includes('--apply');

const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };
if (!(envMode in ENV_SETS)) { console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`); process.exit(1); }
if (!idArg && !emailArg) { console.error('🛑 informe --id=<uuid> OU --email=<email>.'); process.exit(1); }
if (idArg && !/^[A-Za-z0-9-]+$/.test(idArg)) { console.error('🛑 --id inválido (esperado uuid).'); process.exit(1); }

for (const f of ENV_SETS[envMode]) {
  try { for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`🛑 DATABASE_URL não definido (--env=${envMode}).`); process.exit(1); }
if (expectRef && !url.includes(expectRef)) { console.error(`🛑 Abortado: DATABASE_URL não contém o ref "${expectRef}". Alvo errado? Nada foi feito.`); process.exit(1); }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKETS = ['avatars', 'inventory'];

async function listStorage(admin, id) {
  const out = {};
  for (const b of BUCKETS) {
    const { data, error } = await admin.storage.from(b).list(id, { limit: 1000 });
    out[b] = error ? { error: error.message } : (data || []).map((f) => `${id}/${f.name}`);
  }
  return out;
}

(async () => {
  const p = new PrismaClient();
  try {
    // Resolve o id (por e-mail, se veio --email).
    let id = idArg;
    if (!id) {
      const rows = await p.$queryRawUnsafe(`SELECT id FROM auth.users WHERE email = $1`, emailArg);
      if (!rows.length) { console.error(`🛑 nenhum auth.users com e-mail ${emailArg}.`); return; }
      id = rows[0].id;
    }

    const dec = await p.decorator.findUnique({ where: { id } });
    const authRows = await p.$queryRawUnsafe(`SELECT email, raw_user_meta_data FROM auth.users WHERE id = $1::uuid`, id);
    const auth = authRows[0];
    console.log(`alvo: ${new URL(url).hostname}  (--env=${envMode})`);
    console.log(`decorator: id=${id} name=${dec ? dec.name : '(sem linha em decorators)'}`);
    console.log(`auth.users: ${auth ? `email=${auth.email} cnpj=${(auth.raw_user_meta_data || {}).cnpj || '-'}` : '(sem linha em auth.users)'}\n`);
    if (!dec && !auth) { console.error('🛑 nada encontrado com esse id/e-mail.'); return; }

    // Preview da cascata (contagens).
    const c = async (sql) => Number((await p.$queryRawUnsafe(sql, id))[0].n);
    const counts = {
      clients: await c(`SELECT count(*)::int n FROM clients WHERE decorator_id=$1`),
      party_events: await c(`SELECT count(*)::int n FROM party_events WHERE decorator_id=$1`),
      inventory_items: await c(`SELECT count(*)::int n FROM inventory_items WHERE decorator_id=$1`),
      kits: await c(`SELECT count(*)::int n FROM kits WHERE decorator_id=$1`),
      consumables: await c(`SELECT count(*)::int n FROM consumables WHERE decorator_id=$1`),
      forum_posts: await c(`SELECT count(*)::int n FROM forum_posts WHERE author_id=$1`),
      chat_messages: await c(`SELECT count(*)::int n FROM chat_messages WHERE sender_id=$1 OR receiver_id=$1`),
      rental_orders: await c(`SELECT count(*)::int n FROM rental_orders WHERE owner_id=$1 OR renter_id=$1`),
      client_promo_messages: await c(`SELECT count(*)::int n FROM client_promo_messages WHERE decorator_id=$1`),
    };
    console.log('cascata (linhas que serão apagadas):');
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(22)} ${v}`);

    // Storage.
    let admin = null;
    if (SUPABASE_URL && SERVICE_KEY) admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    console.log('\nStorage (buckets avatars/inventory sob <id>/):');
    let storage = null;
    if (!admin) {
      console.log('  ⚠️ SUPABASE_SERVICE_ROLE_KEY ausente — não consigo listar/remover arquivos.');
      console.log('     Forneça a service role de prod (Supabase → Settings → API) para incluir o Storage.');
    } else {
      storage = await listStorage(admin, id);
      for (const b of BUCKETS) {
        const v = storage[b];
        if (v.error) console.log(`  ${b}: erro (${v.error})`);
        else console.log(`  ${b}: ${v.length} arquivo(s)`);
      }
    }

    if (!apply) { console.log('\n(dry-run) nada foi apagado. Rode de novo com --apply para excluir.'); return; }
    if (!admin) { console.error('\n🛑 --apply abortado: sem service role, a exclusão do Storage ficaria incompleta. Forneça SUPABASE_SERVICE_ROLE_KEY.'); process.exitCode = 1; return; }

    // 1) Storage
    for (const b of BUCKETS) {
      const paths = storage[b];
      if (Array.isArray(paths) && paths.length) {
        const { error } = await admin.storage.from(b).remove(paths);
        console.log(`  Storage ${b}: ${error ? 'ERRO ' + error.message : `removidos ${paths.length}`}`);
      }
    }
    // 2) tabelas (cascata) — apaga a decoradora; o FK leva o resto.
    if (dec) { await p.decorator.delete({ where: { id } }); console.log('  decorators: removida (cascata aplicada)'); }
    // 3) login (e-mail, senha, metadata com CNPJ)
    const delAuth = await p.$executeRawUnsafe(`DELETE FROM auth.users WHERE id = $1::uuid`, id);
    console.log(`  auth.users: ${delAuth} removida`);

    console.log('\n✅ exclusão total concluída. (Logs de terceiros — Netlify/Supabase/Upstash — expiram por retenção própria; ver docs/legal/data-inventory.md §4.)');
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).trim();
    console.error('ERRO:', msg.split('\n').filter(Boolean).slice(0, 3).join(' | '));
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
