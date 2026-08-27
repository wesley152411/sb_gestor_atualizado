// Aplica um arquivo .sql statement-a-statement no banco apontado por DATABASE_URL.
// Reutilizável para TESTE e (depois, juntos) PRODUÇÃO. NUNCA embute credencial:
// a conexão vem do ambiente (ou de um .env.test/.env.local gitignorado).
//
// Uso:
//   DATABASE_URL='...' node scripts/apply-sql.cjs <arquivo.sql> [--expect-ref=<ref>]
//   (ou defina DATABASE_URL num .env.test gitignorado e rode sem inline)
//
// --expect-ref: trava de segurança — aborta se o DATABASE_URL não contiver esse
// ref de projeto. Evita aplicar no banco errado (teste vs produção).
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

// carrega .env.test(.local) ANTES de .env.local/.env (first-wins)
for (const f of ['.env.test.local', '.env.test', '.env.local', '.env']) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* arquivo ausente */ }
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const expectRef = (args.find((a) => a.startsWith('--expect-ref=')) || '').split('=')[1];

if (!file) {
  console.error('uso: node scripts/apply-sql.cjs <arquivo.sql> [--expect-ref=<ref>]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('🛑 DATABASE_URL não definido (env ou .env.test).');
  process.exit(1);
}
if (expectRef && !url.includes(expectRef)) {
  console.error(`🛑 Abortado: DATABASE_URL não contém o ref esperado "${expectRef}". Alvo errado? Nada foi aplicado.`);
  process.exit(1);
}

let target = '(não parseável)';
try {
  const u = new URL(url);
  target = `host=${u.hostname} db=${u.pathname.replace(/^\//, '')} user=${decodeURIComponent(u.username)}`;
} catch { /* mostra o que der */ }

// remove comentários de linha (-- ...) e divide por ';'. As migrações deste repo
// não usam dollar-quoting nem ';' dentro de literais, então o split simples basta.
const sql = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.replace(/--.*$/, '')).join('\n');
const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean);

(async () => {
  const p = new PrismaClient();
  console.log(`alvo:    ${target}`);
  console.log(`arquivo: ${file} — ${stmts.length} statements\n`);
  try {
    for (let i = 0; i < stmts.length; i++) {
      const label = stmts[i].replace(/\s+/g, ' ').slice(0, 70);
      process.stdout.write(`  [${i + 1}/${stmts.length}] ${label} … `);
      await p.$executeRawUnsafe(stmts[i]);
      console.log('OK');
    }
    console.log('\n✅ aplicado com sucesso');
  } catch (e) {
    console.log('FALHOU');
    console.error('   ' + String(e && e.message ? e.message : e).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
