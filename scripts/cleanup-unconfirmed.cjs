// Remove contas de auth.users criadas e NUNCA confirmadas há mais de N dias.
// O Supabase NÃO limpa não confirmadas sozinho — elas acumulam para sempre.
// (Não confirmadas não têm linha em decorators — o perfil só é criado no 1º login
//  confirmado — mas por segurança apagamos eventuais decorators dos mesmos ids.)
//
// SEGURO POR PADRÃO: dry-run (só conta e lista). Só apaga com --apply.
// Uso:
//   node scripts/cleanup-unconfirmed.cjs --env=prod --expect-ref=<ref> [--days=14] [--apply]
//   (dry-run sem --apply; sempre confira o número antes de aplicar)
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const envMode = (args.find((a) => a.startsWith('--env=')) || '--env=test').split('=')[1];
const expectRef = (args.find((a) => a.startsWith('--expect-ref=')) || '').split('=')[1];
const days = parseInt((args.find((a) => a.startsWith('--days=')) || '--days=14').split('=')[1], 10);
const apply = args.includes('--apply');

const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };
if (!(envMode in ENV_SETS)) { console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`); process.exit(1); }
if (!Number.isInteger(days) || days < 1) { console.error('🛑 --days deve ser inteiro >= 1.'); process.exit(1); }

// Carrega os arquivos da env escolhida como autoritativos (o último vence).
for (const f of ENV_SETS[envMode]) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* ausente */ }
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`🛑 DATABASE_URL não definido (--env=${envMode}).`); process.exit(1); }
if (expectRef && !url.includes(expectRef)) {
  console.error(`🛑 Abortado: DATABASE_URL não contém o ref esperado "${expectRef}". Alvo errado? Nada foi feito.`);
  process.exit(1);
}
let target = '(?)'; try { const u = new URL(url); target = `host=${u.hostname} user=${decodeURIComponent(u.username)}`; } catch {}

(async () => {
  const p = new PrismaClient();
  const where = `email_confirmed_at IS NULL AND created_at < now() - interval '${days} days'`;
  try {
    console.log(`alvo: ${target}  (--env=${envMode})`);
    console.log(`critério: não confirmadas criadas há mais de ${days} dias\n`);

    const rows = await p.$queryRawUnsafe(
      `SELECT id, email, created_at FROM auth.users WHERE ${where} ORDER BY created_at ASC`
    );
    console.log(`encontradas: ${rows.length}`);
    rows.slice(0, 15).forEach((r) => console.log(`  ${String(r.created_at).slice(0, 10)}  ${r.email}`));
    if (rows.length > 15) console.log(`  … (+${rows.length - 15})`);

    if (rows.length === 0) { console.log('\nnada a remover.'); return; }

    if (!apply) {
      console.log(`\n(dry-run) nada foi apagado. Para remover, rode de novo com --apply.`);
      return;
    }

    const ids = rows.map((r) => r.id);
    // Defensivo: apaga decorators desses ids (não deveriam existir) antes do auth.users.
    await p.decorator.deleteMany({ where: { id: { in: ids } } });
    const deleted = await p.$executeRawUnsafe(`DELETE FROM auth.users WHERE ${where}`);
    console.log(`\n✅ removidas ${deleted} contas não confirmadas.`);
  } catch (e) {
    console.error('ERRO:', String(e && e.message ? e.message : e).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
