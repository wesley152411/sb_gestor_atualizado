// APAGA peças e kits criados numa JANELA DE TEMPO — para limpar lixo de teste.
//
// POR QUE ISTO EXISTE
// O Deploy Preview da Netlify usa as variáveis de ambiente do site, e portanto o
// banco de PRODUÇÃO. Testar um preview grava dados reais. Esta é a vassoura para
// o que ficou; a solução do problema de raiz é apontar os previews para o banco
// de teste (contexto `deploy-preview` na Netlify).
//
// A janela é o critério porque é o único que descreve "foi teste": nome, valor e
// descrição não distinguem uma peça de teste de uma peça de verdade.
//
// RECUSA-SE a apagar o que estiver referenciado em locação, orçamento ou dentro
// de um kit. Apagar uma peça que um kit cita deixaria o kit apontando para um id
// fantasma — que é exatamente um dos defeitos que já encontramos neste banco.
//
// Uso:
//   node scripts/limpar-testes.cjs --env=prod --expect-ref=<ref> --de=<ISO> --ate=<ISO>
//   ... --apply     grava (sem isto é dry-run)
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Primeira linha NAO VAZIA da mensagem de erro. Erro do Prisma comeca COM uma
// quebra de linha, entao pegar a linha 0 imprimia "ERRO:" sem nada.
function primeiraLinha(erro) {
  const texto = String(erro && erro.message ? erro.message : erro);
  const linha = texto.split(String.fromCharCode(10)).map((s) => s.trim()).filter(Boolean)[0];
  return linha || '(erro sem mensagem)';
}

const args = process.argv.slice(2);
const get = (chave) => (args.find((a) => a.startsWith(`--${chave}=`)) || '').slice(chave.length + 3);
const envMode = get('env') || 'test';
const expectRef = get('expect-ref');
const apply = args.includes('--apply');
const deTexto = get('de');
const ateTexto = get('ate');

const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };
if (!(envMode in ENV_SETS)) { console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`); process.exit(1); }
if (!deTexto || !ateTexto) {
  console.error('🛑 --de e --ate são obrigatórios (ISO, UTC). Ex.: --de=2026-09-08T02:10:00Z --ate=2026-09-08T02:20:00Z');
  process.exit(1);
}
const de = new Date(deTexto);
const ate = new Date(ateTexto);
if (Number.isNaN(de.getTime()) || Number.isNaN(ate.getTime()) || de >= ate) {
  console.error('🛑 janela inválida: --de precisa ser uma data ISO anterior a --ate.');
  process.exit(1);
}
// Uma janela larga demais deixa de ser "limpeza de teste" e vira exclusão em
// massa por engano de digitação. 24h é generoso para uma sessão de testes.
const HORAS = (ate - de) / 3600000;
if (HORAS > 24) {
  console.error(`🛑 janela de ${HORAS.toFixed(1)}h é grande demais para limpeza de teste (máx. 24h).`);
  process.exit(1);
}

for (const arquivo of ENV_SETS[envMode]) {
  try {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* ausente */ }
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`🛑 DATABASE_URL não definido (--env=${envMode}).`); process.exit(1); }
if (!expectRef) { console.error('🛑 --expect-ref é obrigatório: este script APAGA.'); process.exit(1); }
if (!url.includes(expectRef)) {
  console.error(`🛑 ABORTADO: DATABASE_URL não contém o ref esperado "${expectRef}". Nada foi tocado.`);
  process.exit(1);
}

const quando = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const reais = (v) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

(async () => {
  const prisma = new PrismaClient();
  try {
    const alvo = new URL(url);
    console.log(`alvo: host=${alvo.hostname} db=${alvo.pathname.slice(1)} (--env=${envMode}, ref ${expectRef})`);
    console.log(`janela: ${quando(de)} até ${quando(ate)} UTC\n`);

    const naJanela = { gte: de, lte: ate };
    const itens = await prisma.inventoryItem.findMany({ where: { created_at: naJanela }, orderBy: { created_at: 'asc' } });
    const kits = await prisma.kit.findMany({ where: { created_at: naJanela }, orderBy: { created_at: 'asc' } });

    // ---- Referências: quem NÃO pode ser apagado -----------------------------
    const todosKits = await prisma.kit.findMany({ select: { id: true, name: true, items: true } });
    const itemEmKit = new Map(); // item_id -> [nomes de kits que o citam]
    for (const k of todosKits) {
      for (const c of Array.isArray(k.items) ? k.items : []) {
        const id = String(c.id);
        itemEmKit.set(id, [...(itemEmKit.get(id) || []), k.name]);
      }
    }
    const emOrdemItem = new Set((await prisma.rentalOrderItem.findMany({ where: { item_id: { not: null } }, select: { item_id: true } })).map((r) => r.item_id));
    const emOrdemKit = new Set((await prisma.rentalOrderItem.findMany({ where: { kit_id: { not: null } }, select: { kit_id: true } })).map((r) => r.kit_id));
    const emEventoItem = new Set((await prisma.partyEvent.findMany({ where: { source_item_id: { not: null } }, select: { source_item_id: true } })).map((r) => r.source_item_id));
    const emEventoKit = new Set((await prisma.partyEvent.findMany({ where: { source_kit_id: { not: null } }, select: { source_kit_id: true } })).map((r) => r.source_kit_id));

    // Kits da janela serão apagados, então uma citação vinda DELES não prende a
    // peça: some junto. Só citação de kit que FICA é impedimento.
    const idsKitsDaJanela = new Set(kits.map((k) => k.id));
    const kitsQueFicamCitando = (itemId) => {
      const nomes = itemEmKit.get(itemId) || [];
      return nomes.filter((nome) => !kits.some((k) => k.name === nome && idsKitsDaJanela.has(k.id)));
    };

    const motivoItem = (i) => {
      const motivos = [];
      if (emOrdemItem.has(i.id)) motivos.push('está numa locação');
      if (emEventoItem.has(i.id)) motivos.push('está num orçamento');
      const citada = kitsQueFicamCitando(i.id);
      if (citada.length) motivos.push(`citada pelo kit "${citada[0]}"`);
      return motivos;
    };
    const motivoKit = (k) => {
      const motivos = [];
      if (emOrdemKit.has(k.id)) motivos.push('está numa locação');
      if (emEventoKit.has(k.id)) motivos.push('está num orçamento');
      return motivos;
    };

    const itensLivres = [], itensPresos = [], kitsLivres = [], kitsPresos = [];
    for (const i of itens) (motivoItem(i).length ? itensPresos : itensLivres).push(i);
    for (const k of kits) (motivoKit(k).length ? kitsPresos : kitsLivres).push(k);

    console.log(`=== PEÇAS na janela (${itens.length}) ===`);
    for (const i of itens) {
      const m = motivoItem(i);
      console.log(`  ${quando(i.created_at)} | "${i.name}" ${reais(i.rental_price)} estoque=${i.stock_quantity}` +
        (m.length ? `   ⛔ MANTIDA: ${m.join('; ')}` : '   -> apagar'));
    }
    if (!itens.length) console.log('  (nenhuma)');

    console.log(`\n=== KITS na janela (${kits.length}) ===`);
    for (const k of kits) {
      const m = motivoKit(k);
      const comps = (Array.isArray(k.items) ? k.items : []).map((c) => c.name).join(', ') || '(vazio)';
      console.log(`  ${quando(k.created_at)} | "${k.name}" ${reais(k.value)} [${comps}]` +
        (m.length ? `   ⛔ MANTIDO: ${m.join('; ')}` : '   -> apagar'));
    }
    if (!kits.length) console.log('  (nenhum)');

    console.log('\n=== PLANO ===');
    console.log(`  apagar ${kitsLivres.length} kit(s) e ${itensLivres.length} peça(s)`);
    if (kitsPresos.length || itensPresos.length) {
      console.log(`  MANTER ${kitsPresos.length} kit(s) e ${itensPresos.length} peça(s) por referência`);
    }

    if (!apply) {
      console.log('\n(dry-run) nada foi apagado. Rode de novo com --apply para executar.');
      return;
    }
    if (!kitsLivres.length && !itensLivres.length) {
      console.log('\nnada a fazer.');
      return;
    }

    const comprovante = {
      quando: new Date().toISOString(),
      alvo: `${alvo.hostname}${alvo.pathname}`,
      ref: expectRef,
      janela: { de: de.toISOString(), ate: ate.toISOString() },
      // Linhas INTEIRAS: comprovante que não permite refazer é recibo, não prova.
      kitsApagados: kitsLivres.map((k) => ({ ...k, value: Number(k.value ?? 0), created_at: k.created_at.toISOString() })),
      pecasApagadas: itensLivres.map((i) => ({
        ...i,
        rental_price: Number(i.rental_price ?? 0),
        internal_cost: Number(i.internal_cost ?? 0),
        created_at: i.created_at.toISOString(),
      })),
      mantidos: {
        kits: kitsPresos.map((k) => ({ id: k.id, nome: k.name, motivo: motivoKit(k) })),
        pecas: itensPresos.map((i) => ({ id: i.id, nome: i.name, motivo: motivoItem(i) })),
      },
    };

    // Kits primeiro: enquanto o kit existe, ele cita a peça.
// Tempo LIMITE explícito. O padrão do Prisma para transação interativa é 5s, e
    // dez deletes contra o Postgres remoto pelo pooler estouram isso — a transação
    // reverte inteira e o erro é "Transaction not found", que não parece timeout.
    // 20s é folgado para uma limpeza pontual e continua curto para não segurar
    // conexão do pool em caso de travamento.
    await prisma.$transaction(async (tx) => {
      for (const k of kitsLivres) {
        await tx.kit.delete({ where: { id: k.id } });
        console.log(`  apagado kit: "${k.name}"`);
      }
      for (const i of itensLivres) {
        await tx.inventoryItem.delete({ where: { id: i.id } });
        console.log(`  apagada peça: "${i.name}"`);
      }
    }, { timeout: 20000, maxWait: 10000 });

    const nome = `limpeza-testes-${expectRef}-${Date.now()}.json`;
    const destino = path.join(process.cwd(), nome);
    fs.writeFileSync(destino, JSON.stringify(comprovante, null, 2), 'utf8');
    console.log(`\ncomprovante: ${destino}`);
  } catch (erro) {
    console.error('ERRO:', primeiraLinha(erro));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
