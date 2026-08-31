// Lista pedidos pendentes de exclusão. É somente leitura: a exclusão continua
// manual, pelo delete-decorator.cjs, para incluir Auth e Storage com segurança.
//
// Uso:
//   node scripts/pending-deletions.cjs --env=test --expect-ref=<ref-de-teste>
//   node scripts/pending-deletions.cjs --env=prod --expect-ref=urvbkfyyvbsahdnkkwed
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const get = (key) => (args.find((arg) => arg.startsWith(`--${key}=`)) || '').slice(key.length + 3);
const envMode = get('env') || 'test';
const expectRef = get('expect-ref');
const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };

if (!(envMode in ENV_SETS)) {
  console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`);
  process.exit(1);
}

for (const file of ENV_SETS[envMode]) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`🛑 DATABASE_URL não definido (--env=${envMode}).`);
  process.exit(1);
}
if (expectRef && !url.includes(expectRef)) {
  console.error(`🛑 Abortado: DATABASE_URL não contém o ref esperado "${expectRef}". Nada foi consultado.`);
  process.exit(1);
}

(async () => {
  const prisma = new PrismaClient();
  try {
    const target = new URL(url);
    console.log(`alvo: host=${target.hostname} db=${target.pathname.slice(1)} (--env=${envMode})`);
    const rows = await prisma.$queryRawUnsafe(`
      SELECT d.id, d.name, d.deletion_requested_at, u.email
      FROM public.decorators d
      LEFT JOIN auth.users u ON u.id = d.id::uuid
      WHERE d.deletion_requested_at IS NOT NULL
      ORDER BY d.deletion_requested_at ASC
    `);
    if (!rows.length) {
      console.log('✅ Nenhum pedido de exclusão pendente.');
      return;
    }
    console.log(`\n${rows.length} pedido(s) pendente(s):`);
    for (const row of rows) {
      console.log(`- ${row.deletion_requested_at.toISOString()} | ${row.name} | ${row.email || '(sem login)'} | id=${row.id}`);
    }
    console.log('\nPara processar um pedido, faça primeiro o dry-run:');
    console.log('  node scripts/delete-decorator.cjs --id=<id> --env=<test|prod> --expect-ref=<ref>');
  } catch (error) {
    console.error('ERRO:', String(error?.message || error).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
