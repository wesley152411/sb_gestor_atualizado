// Lê o que as decoradoras mandaram pela aba Suporte (tabela support_feedback).
//
// POR QUE EXISTE: a spec pediu que a opinião ficasse "consultável depois". Uma
// tabela sozinha satisfaz isso só no papel — na prática ninguém abre o Studio do
// Supabase e escreve SQL para ler três linhas. Este script é a leitura de fato.
//
// SÓ LÊ. Não apaga, não altera, não escreve nada. A exclusão dessas linhas
// acontece junto com a conta, pela cascata do delete-decorator.cjs.
//
// Uso:
//   node scripts/ver-feedback.cjs [--env=test|prod] [--expect-ref=<ref>]
//                                 [--tipo=avaliacao|opiniao|ia_interesse]
//                                 [--dias=30] [--limite=50] [--json]
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

// Primeira linha NAO VAZIA da mensagem de erro (mesmo motivo dos outros
// scripts: erro do Prisma comeca com quebra de linha e imprimiria "ERRO:" seco).
function primeiraLinha(erro) {
  const texto = String(erro && erro.message ? erro.message : erro);
  const linha = texto.split(String.fromCharCode(10)).map((s) => s.trim()).filter(Boolean)[0];
  return linha || '(erro sem mensagem)';
}

const args = process.argv.slice(2);
const get = (k) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : undefined; };
const envMode = get('env') || 'test';
const expectRef = get('expect-ref');
const tipo = get('tipo');
const dias = Number(get('dias') || 0);
const limite = Number(get('limite') || 50);
const comoJson = args.includes('--json');

const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };
if (!(envMode in ENV_SETS)) { console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`); process.exit(1); }

const TIPOS = ['avaliacao', 'opiniao', 'ia_interesse'];
if (tipo && !TIPOS.includes(tipo)) { console.error(`🛑 --tipo inválido: "${tipo}". Use ${TIPOS.join(' | ')}.`); process.exit(1); }

for (const f of ENV_SETS[envMode]) {
  try { for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`🛑 DATABASE_URL não definido (--env=${envMode}).`); process.exit(1); }
if (expectRef && !url.includes(expectRef)) { console.error(`🛑 Abortado: DATABASE_URL não contém o ref "${expectRef}". Alvo errado?`); process.exit(1); }

const CARINHAS = { 1: '😖 Péssimo', 2: '🙁 Ruim', 3: '😐 Regular', 4: '🙂 Muito Bom', 5: '🤩 Incrível' };
const ROTULO = { avaliacao: 'AVALIAÇÃO', opiniao: 'OPINIÃO', ia_interesse: 'QUER A IA' };

const quando = (d) => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

(async () => {
  const p = new PrismaClient();
  try {
    const where = {};
    if (tipo) where.tipo = tipo;
    if (dias > 0) where.criado_em = { gte: new Date(Date.now() - dias * 86400000) };

    const linhas = await p.supportFeedback.findMany({
      where,
      orderBy: { criado_em: 'desc' },
      take: limite,
      // O nome da decoradora, para o recado ter rosto. O e-mail mora em
      // auth.users e não é preciso aqui: quem quiser responder acha pelo id.
      include: { decorators: { select: { name: true } } },
    });

    if (comoJson) {
      console.log(JSON.stringify(linhas, null, 2));
      return;
    }

    console.log(`alvo: ${new URL(url).hostname}  (--env=${envMode})`);
    console.log(`filtro: ${tipo || 'todos os tipos'}${dias > 0 ? `, últimos ${dias} dia(s)` : ''}  |  máx ${limite}\n`);

    if (!linhas.length) { console.log('(nenhum recado ainda)'); return; }

    for (const l of linhas) {
      const nome = l.decorators?.name || '(sem nome)';
      console.log(`─── ${ROTULO[l.tipo] || l.tipo}  ·  ${quando(l.criado_em)}`);
      console.log(`    de: ${nome}  [${l.decorator_id}]`);
      if (l.nota != null) console.log(`    nota: ${CARINHAS[l.nota] || l.nota}`);
      if (l.assuntos?.length) console.log(`    assuntos: ${l.assuntos.join(', ')}`);
      if (l.mensagem) console.log(`    "${l.mensagem.replace(/\n/g, '\n     ')}"`);
      console.log('');
    }

    // Resumo: a nota MAIS RECENTE de cada decoradora, não a média de todas as
    // linhas. A tabela é histórico — quem clicou três vezes contaria três vezes
    // e a "satisfação" viraria a média de quem mexe mais, não de quem gosta mais.
    const todas = await p.supportFeedback.findMany({
      where: { tipo: 'avaliacao' },
      orderBy: { criado_em: 'desc' },
      select: { decorator_id: true, nota: true },
    });
    const atual = new Map();
    for (const a of todas) if (!atual.has(a.decorator_id)) atual.set(a.decorator_id, a.nota);

    const notas = [...atual.values()].filter((n) => n != null);
    if (notas.length) {
      const media = notas.reduce((s, n) => s + n, 0) / notas.length;
      const dist = [1, 2, 3, 4, 5].map((n) => `${n}:${notas.filter((x) => x === n).length}`).join('  ');
      console.log(`─── nota atual de ${notas.length} decoradora(s): média ${media.toFixed(2)}  (${dist})`);
    }
  } catch (e) {
    console.error('ERRO:', primeiraLinha(e));
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
