// Aplica um arquivo .sql statement-a-statement no banco apontado por DATABASE_URL.
// NUNCA embute credencial: a conexão vem de arquivos .env (ou do process.env).
//
// Uso:
//   node scripts/apply-sql.cjs <arquivo.sql> [--env=test|prod] [--expect-ref=<ref>]
//
// --env escolhe QUAIS arquivos carregar (acaba com o remendo de renomear arquivo):
//   test (padrão) → .env, .env.local, .env.test, .env.test.local   (teste vence)
//   prod          → .env, .env.local                                (IGNORA os .env.test*)
// Os arquivos da env escolhida são AUTORITATIVOS: o ÚLTIMO vence e sobrescrevem
// inclusive o que veio do shell — o alvo é sempre o que a env selecionada diz.
//
// --expect-ref: trava de segurança — aborta se o DATABASE_URL não contiver esse
// ref de projeto. Recomendado em produção: --env=prod --expect-ref=urvbkfyyvbsahdnkkwed
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const expectRef = (args.find((a) => a.startsWith('--expect-ref=')) || '').split('=')[1];
const envMode = (args.find((a) => a.startsWith('--env=')) || '--env=test').split('=')[1];

if (!file) {
  console.error('uso: node scripts/apply-sql.cjs <arquivo.sql> [--env=test|prod] [--expect-ref=<ref>]');
  process.exit(1);
}

const ENV_SETS = {
  test: ['.env', '.env.local', '.env.test', '.env.test.local'],
  prod: ['.env', '.env.local'],
};
if (!(envMode in ENV_SETS)) {
  console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`);
  process.exit(1);
}

// Carrega os arquivos da env escolhida como AUTORITATIVOS (override, o último vence).
const loadedFiles = [];
for (const f of ENV_SETS[envMode]) {
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  loadedFiles.push(f);
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
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

// Log de diagnóstico ANTES de qualquer decisão: modo, arquivos e alvo resolvido.
console.log(`--env=${envMode} | arquivos carregados (o último vence): ${loadedFiles.join(', ') || '(nenhum — usando process.env)'}`);
console.log(`DATABASE_URL lido → ${target}`);

if (!url) {
  console.error(`🛑 DATABASE_URL não definido (--env=${envMode}). Verifique os arquivos: ${ENV_SETS[envMode].join(', ')}.`);
  process.exit(1);
}
if (expectRef && !url.includes(expectRef)) {
  console.error(`🛑 Abortado: DATABASE_URL não contém o ref esperado "${expectRef}". Alvo lido: ${target} (--env=${envMode}). A --env aponta pro projeto certo? Nada foi aplicado.`);
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
