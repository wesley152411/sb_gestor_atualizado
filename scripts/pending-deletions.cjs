// A ROTINA SEMANAL DE EXCLUSÃO, em um comando só.
//
// Responde às TRÊS perguntas que a rotina precisa fazer:
//
//   1. Há pedidos EXPLÍCITOS de exclusão pendentes? (deletion_requested_at)
//   2. Há contas com a GUARDA DE 90 DIAS VENCIDA? (periodo_fim + 90 dias)
//   3. Há contas que NUNCA assinaram e passaram de 90 dias? (created_at + 90)
//
// A segunda existe porque o risco aqui está invertido em relação à intuição:
// não há job que apague nada automaticamente, então os dados ficam ALÉM do prazo
// prometido nos Termos §6.3, não aquém. E acúmulo por inércia não falha, não fica
// vermelho e não manda e-mail — ninguém descobre sozinho. Uma linha de lembrete
// que depende de alguém lembrar de consultar o banco não é rotina de verdade.
//
// A terceira nasceu com o portão de assinatura: quem se cadastra, vê o portão e
// vai embora fica com nome, CNPJ e e-mail no banco, sem assinatura NENHUMA — e
// nenhum prazo dos Termos a cobre, porque a guarda conta do fim de um período
// pago que nunca existiu. A regra decidida é 90 dias sem assinatura, o MESMO
// número da guarda, para não inventar um segundo prazo que ninguém lembra.
// Enquanto o aviso por e-mail não existe, isto é LISTAGEM para decisão caso a
// caso — e ainda precisa entrar nos Termos e na Política (previsto para a 1.2).
//
// É SOMENTE LEITURA: a exclusão continua manual, pelo delete-decorator.cjs, para
// incluir Auth e Storage com segurança.
//
// Uso:
//   node scripts/pending-deletions.cjs --env=test --expect-ref=<ref-de-teste>
//   node scripts/pending-deletions.cjs --env=prod --expect-ref=urvbkfyyvbsahdnkkwed
//   [--guarda=90]  dias da guarda, para conferir outro prazo sem editar o script
const fs = require('fs');
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
const get = (key) => (args.find((arg) => arg.startsWith(`--${key}=`)) || '').slice(key.length + 3);
const envMode = get('env') || 'test';
const expectRef = get('expect-ref');
const guarda = Number(get('guarda') || 90);
const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };

if (!Number.isFinite(guarda) || guarda <= 0) {
  console.error('🛑 --guarda precisa ser um número positivo de dias.');
  process.exit(1);
}

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

const dia = (valor) => new Date(valor).toISOString().slice(0, 10);

(async () => {
  const prisma = new PrismaClient();
  let achou = false;
  try {
    const target = new URL(url);
    console.log(`alvo: host=${target.hostname} db=${target.pathname.slice(1)} (--env=${envMode})`);

    // ---- 1. Pedidos EXPLÍCITOS de exclusão -----------------------------------
    console.log('');
    console.log('=== 1. Pedidos explícitos de exclusão ===');
    const pedidos = await prisma.$queryRawUnsafe(`
      SELECT d.id, d.name, d.deletion_requested_at, u.email
      FROM public.decorators d
      LEFT JOIN auth.users u ON u.id = d.id::uuid
      WHERE d.deletion_requested_at IS NOT NULL
      ORDER BY d.deletion_requested_at ASC
    `);
    if (!pedidos.length) {
      console.log('  ✅ nenhum pendente.');
    } else {
      achou = true;
      console.log(`  ${pedidos.length} pedido(s) pendente(s):`);
      for (const row of pedidos) {
        console.log(`  - ${dia(row.deletion_requested_at)} | ${row.name} | ${row.email || '(sem login)'} | id=${row.id}`);
      }
    }

    // ---- 2. Guarda vencida ---------------------------------------------------
    // `periodo_fim + guarda < now()` já implica `periodo_fim < now()`, então
    // nenhuma linha listada aqui concede acesso — não há risco de aparecer quem
    // ainda pode operar. A condição fica assim, e não replicando concedeAcesso(),
    // porque duplicar a regra de acesso em SQL criaria uma segunda verdade.
    console.log('');
    console.log(`=== 2. Guarda de ${guarda} dias vencida (Termos 6.3) ===`);
    const vencidas = await prisma.$queryRawUnsafe(`
      SELECT d.id, d.name, d.is_internal, s.status, s.periodo_fim,
             (s.periodo_fim + ($1 || ' days')::interval) AS apagar_desde
      FROM public.subscriptions s
      JOIN public.decorators d ON d.id = s.decorator_id
      WHERE s.vigente
        AND s.periodo_fim IS NOT NULL
        AND s.periodo_fim + ($1 || ' days')::interval < now()
      ORDER BY s.periodo_fim ASC
    `, String(guarda));
    if (!vencidas.length) {
      console.log('  ✅ nenhuma conta passou da guarda.');
    } else {
      achou = true;
      console.log(`  ${vencidas.length} conta(s) com a guarda VENCIDA — os dados já deveriam ter sido apagados:`);
      for (const row of vencidas) {
        const dias = Math.floor((Date.now() - new Date(row.apagar_desde).getTime()) / 86400000);
        const interna = row.is_internal ? ' [interna]' : '';
        console.log(`  - venceu há ${String(dias).padStart(3)} dia(s) | ${row.name}${interna} | status=${row.status} | fim do período=${dia(row.periodo_fim)} | id=${row.id}`);
      }
    }

    // ---- 3. Sem data para calcular a guarda ----------------------------------
    // periodo_fim nulo num status que não concede acesso: a guarda fica sem
    // âncora e a linha some da consulta acima. Aparece aqui para não virar ponto
    // cego permanente da rotina — silêncio por ausência de dado é o pior tipo.
    const semData = await prisma.$queryRawUnsafe(`
      SELECT d.id, d.name, s.status
      FROM public.subscriptions s
      JOIN public.decorators d ON d.id = s.decorator_id
      WHERE s.vigente
        AND s.periodo_fim IS NULL
        AND s.status NOT IN ('em_teste', 'ativa', 'inadimplente', 'cancelada')
      ORDER BY d.name
    `);
    if (semData.length) {
      achou = true;
      console.log('');
      console.log('=== 3. Sem data de fim — a guarda não tem como ser calculada ===');
      console.log(`  ${semData.length} conta(s) precisam de decisão manual:`);
      for (const row of semData) {
        console.log(`  - ${row.name} | status=${row.status} | id=${row.id}`);
      }
    }

    // ---- 4. Nunca assinaram e passaram do prazo ------------------------------
    // Exige e-mail confirmado: cadastro abandonado ANTES da confirmação é outra
    // categoria (nunca virou conta de verdade) e tem limpeza própria.
    console.log('');
    console.log(`=== 4. Nunca assinaram, cadastradas há mais de ${guarda} dias ===`);
    const nuncaAssinaram = await prisma.$queryRawUnsafe(`
      SELECT d.id, d.name, d.is_internal, d.created_at, u.email
      FROM public.decorators d
      JOIN auth.users u ON u.id = d.id::uuid
      WHERE u.email_confirmed_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.decorator_id = d.id)
        AND d.created_at + ($1 || ' days')::interval < now()
      ORDER BY d.created_at ASC
    `, String(guarda));
    if (!nuncaAssinaram.length) {
      console.log('  ✅ nenhuma passou do prazo.');
    } else {
      achou = true;
      console.log(`  ${nuncaAssinaram.length} conta(s) sem assinatura nenhuma:`);
      for (const row of nuncaAssinaram) {
        const dias = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000);
        const interna = row.is_internal ? ' [interna]' : '';
        console.log(`  - cadastrada há ${String(dias).padStart(4)} dia(s) | ${row.name}${interna} | ${row.email || '(sem login)'} | id=${row.id}`);
      }
    }

    // Quantas ainda estão DENTRO do prazo. Uma linha, não uma lista: serve para
    // ver o problema crescer antes de ele virar trabalho, sem virar ruído.
    const aCaminho = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS n
      FROM public.decorators d
      JOIN auth.users u ON u.id = d.id::uuid
      WHERE u.email_confirmed_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.decorator_id = d.id)
        AND d.created_at + ($1 || ' days')::interval >= now()
    `, String(guarda));
    if (aCaminho[0].n > 0) {
      console.log(`  (mais ${aCaminho[0].n} conta(s) sem assinatura ainda dentro do prazo)`);
    }

    console.log('');
    if (achou) {
      console.log('Para processar qualquer uma, faça primeiro o dry-run:');
      console.log('  node scripts/delete-decorator.cjs --id=<id> --env=<test|prod> --expect-ref=<ref>');
    } else {
      console.log('✅ Nada pendente em nenhuma frente.');
    }
  } catch (error) {
    console.error('ERRO:', primeiraLinha(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
