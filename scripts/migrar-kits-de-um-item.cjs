// CONVERTE kits de UM componente em peças avulsas com valor.
//
// POR QUE ISTO EXISTE
// A tela do Acervo gravava a peça no instante em que se clicava em "Criar novo
// item", antes de a decoradora preencher o valor. Ao salvar, o valor ia para o
// KIT e a peça ficava em zero. Resultado: um kit embrulhando uma peça só, com o
// valor no lugar errado e o card aparecendo sem preço.
//
// NEM TODO kit de um componente é isso. Alguns podem ser deliberados — uma peça
// pode ser alugada avulsa por um preço e montada por outro. Por isso o script
// CLASSIFICA em vez de converter em bloco, e só age no que é inequívoco.
//
// Uso:
//   node scripts/migrar-kits-de-um-item.cjs --env=prod --expect-ref=<ref>            (dry-run)
//   node scripts/migrar-kits-de-um-item.cjs --env=prod --expect-ref=<ref> --apply
//   [--incluir-revisar]  converte também os classificados como REVISAR
//   [--apagar-vazios]    apaga kits sem componente nenhum
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');


// Primeira linha NAO VAZIA da mensagem de erro.
//
// Pegar a linha 0 parecia bastar e falhava calado: erro do Prisma comeca COM
// uma quebra de linha, entao a linha 0 e "" e o script imprimia "ERRO:" sem
// nada. Ja custou duas investigacoes neste projeto — uma delas com uma
// transacao de producao revertida e nenhuma pista do motivo.
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
const incluirRevisar = args.includes('--incluir-revisar');
const apagarVazios = args.includes('--apagar-vazios');

const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };
if (!(envMode in ENV_SETS)) { console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`); process.exit(1); }

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
// Allowlist, não blocklist: banco desconhecido é RECUSADO.
if (!expectRef) { console.error('🛑 --expect-ref é obrigatório: este script APAGA kits e ALTERA preços.'); process.exit(1); }
if (!url.includes(expectRef)) {
  console.error(`🛑 ABORTADO: DATABASE_URL não contém o ref esperado "${expectRef}". Nada foi tocado.`);
  process.exit(1);
}

const reais = (v) => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

(async () => {
  const prisma = new PrismaClient();
  try {
    const alvo = new URL(url);
    console.log(`alvo: host=${alvo.hostname} db=${alvo.pathname.slice(1)} (--env=${envMode}, ref ${expectRef})\n`);

    const kits = await prisma.kit.findMany({ orderBy: { created_at: 'asc' } });
    const itens = await prisma.inventoryItem.findMany();
    const porId = new Map(itens.map((i) => [i.id, i]));

    // Kits ainda REFERENCIADOS não são tocados de jeito nenhum: apagar um kit
    // preso a uma locação ou a um orçamento quebraria o histórico.
    const emOrdens = await prisma.rentalOrderItem.findMany({ where: { kit_id: { not: null } }, select: { kit_id: true } });
    const emEventos = await prisma.partyEvent.findMany({ where: { source_kit_id: { not: null } }, select: { source_kit_id: true } });
    const referenciados = new Set([...emOrdens.map((r) => r.kit_id), ...emEventos.map((r) => r.source_kit_id)]);

    const seguros = [];   // bug puro: peça sem preço, kit sem capa
    const revisar = [];   // a peça JÁ tem preço, ou o kit tem capa própria
    const quebrados = []; // aponta para peça inexistente
    const vazios = [];
    const presos = [];

    for (const k of kits) {
      const comps = Array.isArray(k.items) ? k.items : [];
      if (referenciados.has(k.id)) { if (comps.length <= 1) presos.push({ k }); continue; }
      if (comps.length === 0) { vazios.push({ k }); continue; }
      if (comps.length > 1) continue;

      const item = porId.get(String(comps[0].id));
      if (!item) { quebrados.push({ k, idFantasma: String(comps[0].id) }); continue; }

      const precoAtual = Number(item.rental_price ?? 0);
      const temCapa = Boolean(k.image_url);
      const registro = { k, item, precoAtual, temCapa };
      // O critério do que é INEQUÍVOCO: a peça está em zero (nunca recebeu preço)
      // e o kit não tem capa própria a perder. Qualquer outra combinação sugere
      // intenção da decoradora e vai para revisão manual.
      if (precoAtual === 0 && !temCapa) seguros.push(registro);
      else revisar.push(registro);
    }

    const linha = (r) => {
      const nomeIgual = r.item.name.trim().toLowerCase() === r.k.name.trim().toLowerCase();
      return `  kit "${r.k.name}" ${reais(r.k.value)}  ->  peça "${r.item.name}" ` +
        `(preço atual ${reais(r.precoAtual)}, estoque ${r.item.stock_quantity})` +
        `${nomeIgual ? '' : '   ⚠ NOMES DIFERENTES'}${r.temCapa ? '   ⚠ kit tem capa própria' : ''}`;
    };

    console.log(`=== A CONVERTER (${seguros.length}) — peça sem preço, kit sem capa ===`);
    seguros.forEach((r) => console.log(linha(r)));
    if (!seguros.length) console.log('  (nenhum)');

    console.log(`\n=== REVISAR (${revisar.length}) — NÃO serão tocados sem --incluir-revisar ===`);
    revisar.forEach((r) => console.log(linha(r)));
    if (!revisar.length) console.log('  (nenhum)');

    console.log(`\n=== QUEBRADOS (${quebrados.length}) — apontam para peça que não existe mais ===`);
    quebrados.forEach((r) => console.log(`  kit "${r.k.name}" ${reais(r.k.value)} -> id fantasma ${r.idFantasma}`));
    if (!quebrados.length) console.log('  (nenhum)');

    console.log(`\n=== VAZIOS (${vazios.length}) — só com --apagar-vazios ===`);
    vazios.forEach((r) => console.log(`  kit "${r.k.name}" ${reais(r.k.value)}, zero componentes`));
    if (!vazios.length) console.log('  (nenhum)');

    if (presos.length) {
      console.log(`\n=== INTOCÁVEIS (${presos.length}) — referenciados em locação/orçamento ===`);
      presos.forEach((r) => console.log(`  kit "${r.k.name}" — histórico depende dele`));
    }

    // DUPLICADOS: dois kits apontando para a MESMA peça. Sem tratar, o segundo
    // sobrescreveria o preço do primeiro e o resultado dependeria da ordem.
    const aConverter = incluirRevisar ? [...seguros, ...revisar] : seguros;
    const porPeca = new Map();
    for (const r of aConverter) {
      const lista = porPeca.get(r.item.id) || [];
      lista.push(r);
      porPeca.set(r.item.id, lista);
    }
    const duplicados = [...porPeca.values()].filter((l) => l.length > 1);
    if (duplicados.length) {
      console.log(`\n=== MESMA PEÇA EM MAIS DE UM KIT (${duplicados.length}) ===`);
      for (const lista of duplicados) {
        const valores = lista.map((r) => Number(r.k.value ?? 0));
        const escolhido = Math.max(...valores);
        console.log(`  peça "${lista[0].item.name}": kits ${lista.map((r) => `"${r.k.name}" ${reais(r.k.value)}`).join(' e ')}`);
        console.log(`     -> fica ${reais(escolhido)} (o MAIOR, que é o valor original); os kits são apagados`);
      }
    }

    // O plano final: um preço por peça, e a lista de kits a apagar.
    const precoPorPeca = new Map();
    for (const [itemId, lista] of porPeca) {
      precoPorPeca.set(itemId, { valor: Math.max(...lista.map((r) => Number(r.k.value ?? 0))), item: lista[0].item });
    }
    const kitsParaApagar = aConverter.map((r) => r.k).concat(apagarVazios ? vazios.map((r) => r.k) : []);

    console.log('\n=== PLANO ===');
    console.log(`  ${precoPorPeca.size} peça(s) recebem preço`);
    for (const [, v] of precoPorPeca) console.log(`     "${v.item.name}": ${reais(v.item.rental_price)} -> ${reais(v.valor)}`);
    console.log(`  ${kitsParaApagar.length} kit(s) apagados: ${kitsParaApagar.map((k) => `"${k.name}"`).join(', ') || '(nenhum)'}`);
    if (!incluirRevisar && revisar.length) console.log(`  ${revisar.length} em REVISAR ficam como estão (use --incluir-revisar para converter)`);
    if (!apagarVazios && vazios.length) console.log(`  ${vazios.length} vazio(s) ficam como estão (use --apagar-vazios)`);
    if (quebrados.length) console.log(`  ${quebrados.length} quebrado(s) NUNCA são tocados por este script — precisam de decisão sua`);

    if (!apply) {
      console.log('\n(dry-run) nada foi gravado. Rode de novo com --apply para executar o plano acima.');
      return;
    }
    if (!precoPorPeca.size && !kitsParaApagar.length) {
      console.log('\nnada a fazer.');
      return;
    }

    const comprovante = {
      quando: new Date().toISOString(),
      alvo: `${alvo.hostname}${alvo.pathname}`,
      ref: expectRef,
      incluiuRevisar: incluirRevisar,
      apagouVazios: apagarVazios,
      precos: [...precoPorPeca.values()].map((v) => ({
        item_id: v.item.id, nome: v.item.name, de: Number(v.item.rental_price ?? 0), para: v.valor,
      })),
      // A LINHA INTEIRA, não um resumo: "Painel Safari Retangular" tem capa
      // própria, e um comprovante sem image_url/description/status tornaria a
      // exclusão irreversível na prática. Comprovante que não permite refazer
      // não é comprovante, é recibo.
      kitsApagados: kitsParaApagar.map((k) => ({ ...k, value: Number(k.value ?? 0), created_at: k.created_at.toISOString() })),
    };

    // TUDO NUMA TRANSAÇÃO: preço aplicado sem o kit apagado (ou o contrário)
    // deixaria o acervo pior do que estava.
    //
    // E em POUCAS idas e voltas. A primeira tentativa fez um update/delete por
    // linha: 12 operações em série contra o pooler de produção, medidas em
    // ~1272ms cada — 15s, muito além dos 5s que o Prisma dá por padrão a uma
    // transação interativa. A transação estourou no último delete e reverteu
    // tudo (corretamente), mas o erro do Prisma começa com quebra de linha e o
    // script imprimia "ERRO:" vazio. Agrupar por valor derruba de 12 para 3.
    const porValor = new Map();
    for (const [itemId, v] of precoPorPeca) {
      const lista = porValor.get(v.valor) || [];
      lista.push(itemId);
      porValor.set(v.valor, lista);
    }

    await prisma.$transaction(async (tx) => {
      for (const [valor, ids] of porValor) {
        await tx.inventoryItem.updateMany({ where: { id: { in: ids } }, data: { rental_price: valor } });
      }
      await tx.kit.deleteMany({ where: { id: { in: kitsParaApagar.map((k) => k.id) } } });
    }, { timeout: 20000 });

    for (const [, v] of precoPorPeca) console.log(`  preço: "${v.item.name}" -> ${reais(v.valor)}`);
    for (const k of kitsParaApagar) console.log(`  apagado: kit "${k.name}"`);

    const nome = `migracao-kits-${expectRef}-${Date.now()}.json`;
    const destino = path.join(process.cwd(), nome);
    fs.writeFileSync(destino, JSON.stringify(comprovante, null, 2), 'utf8');
    console.log(`\ncomprovante: ${destino}`);
    console.log('O comprovante guarda o JSON `items` de cada kit apagado — é o que permitiria refazê-los.');
  } catch (erro) {
    console.error('ERRO:', primeiraLinha(erro));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
