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

// Precedência (o ÚLTIMO vence): .env < .env.local < .env.test < .env.test.local.
// Os arquivos de TESTE têm override:true — sobrescrevem inclusive o que já veio do
// SHELL (ex.: um DATABASE_URL de dev exportado no ambiente). Sem isso, um
// DATABASE_URL pré-existente no process.env vencia o .env.test.local (bug do
// first-wins) e o --expect-ref abortava apontando pro banco errado.
const loadedFiles = [];
function loadEnvFile(f, override) {
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { return; }
  loadedFiles.push(f);
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1], val = m[2].trim().replace(/^["']|["']$/g, '');
    if (override || !process.env[key]) process.env[key] = val;
  }
}
loadEnvFile('.env', false);
loadEnvFile('.env.local', false);
loadEnvFile('.env.test', true);
loadEnvFile('.env.test.local', true);

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const expectRef = (args.find((a) => a.startsWith('--expect-ref=')) || '').split('=')[1];

if (!file) {
  console.error('uso: node scripts/apply-sql.cjs <arquivo.sql> [--expect-ref=<ref>]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;

// Descreve o alvo SEM a senha (host/db/user) — o "user" carrega o ref (postgres.<ref>).
function describeTarget(u) {
  if (!u) return '(DATABASE_URL vazio)';
  try {
    const x = new URL(u);
    return `host=${x.hostname} db=${x.pathname.replace(/^\//, '')} user=${decodeURIComponent(x.username)}`;
  } catch { return '(não parseável)'; }
}
const target = describeTarget(url);

// Log de diagnóstico ANTES de qualquer decisão: mostra o que foi carregado e de onde.
console.log(`envs carregados (o último vence): ${loadedFiles.join(', ') || '(nenhum arquivo .env encontrado)'}`);
console.log(`DATABASE_URL lido → ${target}`);

if (!url) {
  console.error('🛑 DATABASE_URL não definido (nem no ambiente nem em .env.test/.env.local).');
  process.exit(1);
}
if (expectRef && !url.includes(expectRef)) {
  console.error(`🛑 Abortado: DATABASE_URL não contém o ref esperado "${expectRef}". Alvo lido: ${target}. Arquivos: ${loadedFiles.join(', ')}. Nada foi aplicado.`);
  process.exit(1);
}

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
