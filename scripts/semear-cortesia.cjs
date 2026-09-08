// SEMEIA ASSINATURAS DE CORTESIA para as contas que já usavam o sistema antes de
// existir cobrança.
//
// POR QUE ISTO EXISTE, e por que a ORDEM importa:
// Com o gate de assinatura no ar, uma conta sem linha em `subscriptions` recebe
// 402 SUBSCRIPTION_REQUIRED em TODA rota de dados — nem lê. Não é somente-leitura:
// é trancada para fora. Então a semeadura tem de acontecer ANTES do deploy do
// código que lê essas linhas. Assim não existe janela em que o gate está ativo e
// as linhas faltam — e não é preciso flag de bypass, que é caminho de escape que
// alguém esquece ligado.
//
// Uso:
//   node scripts/semear-cortesia.cjs --env=prod --expect-ref=<ref>            (dry-run)
//   node scripts/semear-cortesia.cjs --env=prod --expect-ref=<ref> --apply
//   [--dias=90]            janela da cortesia (padrão 90)
//   [--incluir-internas]   inclui contas is_internal (padrão: NÃO inclui)
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
const dias = Number(get('dias') || 90);
const apply = args.includes('--apply');
// is_internal marca conta de teste. Por padrão elas ficam DE FORA, senão uma
// rodada no banco de teste semearia dezenas de contas do harness. A inclusão é
// opt-in explícito, para o caso legítimo: a conta interna que o dono usa para
// testar em produção também precisa passar pelo gate como qualquer outra.
const incluirInternas = args.includes('--incluir-internas');

const ENV_SETS = { test: ['.env', '.env.local', '.env.test', '.env.test.local'], prod: ['.env', '.env.local'] };
if (!(envMode in ENV_SETS)) { console.error(`🛑 --env inválido: "${envMode}". Use test | prod.`); process.exit(1); }
if (!Number.isFinite(dias) || dias <= 0) { console.error('🛑 --dias precisa ser um número positivo.'); process.exit(1); }

for (const arquivo of ENV_SETS[envMode]) {
  try {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* arquivo ausente */ }
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`🛑 DATABASE_URL não definido (--env=${envMode}).`); process.exit(1); }

// TRAVA: allowlist do ref esperado, não blocklist. Um banco desconhecido — nem
// produção nem teste — é RECUSADO. É a diferença entre improvável e impossível.
if (!expectRef) {
  console.error('🛑 --expect-ref é obrigatório: este script ESCREVE. Informe o ref do projeto alvo.');
  process.exit(1);
}
if (!url.includes(expectRef)) {
  console.error(`🛑 ABORTADO: DATABASE_URL não contém o ref esperado "${expectRef}". Nada foi tocado.`);
  process.exit(1);
}

const PREFIXO_CORTESIA = 'cortesia:';
const VALOR_MENSAL_CENTAVOS = 14990;

(async () => {
  const prisma = new PrismaClient();
  try {
    const alvo = new URL(url);
    console.log(`alvo: host=${alvo.hostname} db=${alvo.pathname.slice(1)} (--env=${envMode}, ref ${expectRef})`);
    console.log(`janela da cortesia: ${dias} dias\n`);

    const decoradoras = await prisma.decorator.findMany({
      where: incluirInternas ? {} : { is_internal: false },
      select: { id: true, name: true, cnpj: true, is_internal: true },
      orderBy: { created_at: 'asc' },
    });
    console.log(`contas internas: ${incluirInternas ? 'INCLUÍDAS (--incluir-internas)' : 'excluídas'}`);

    const semAssinatura = [];
    for (const d of decoradoras) {
      const jaTem = await prisma.subscription.findFirst({ where: { decorator_id: d.id, vigente: true } });
      if (jaTem) {
        console.log(`  PULA    ${d.name} — já tem assinatura vigente (${jaTem.status})`);
      } else {
        semAssinatura.push(d);
      }
    }

    const fim = new Date(Date.now() + dias * 24 * 3600 * 1000);
    console.log(`\n${semAssinatura.length} conta(s) receberão cortesia até ${fim.toISOString().slice(0, 10)}:`);
    for (const d of semAssinatura) {
      console.log(`  - ${d.name}${d.is_internal ? ' [interna]' : ''} | CNPJ ${d.cnpj || '(sem CNPJ)'} | id=${d.id}`);
    }

    if (!semAssinatura.length) {
      console.log('\nnada a fazer.');
      return;
    }

    if (!apply) {
      console.log('\n(dry-run) nada foi gravado. Rode de novo com --apply para semear.');
      console.log('LEMBRE: semear ANTES do deploy. Depois do deploy sem as linhas, as contas ficam trancadas fora.');
      return;
    }

    const comprovante = {
      quando: new Date().toISOString(),
      alvo: `${alvo.hostname}${alvo.pathname}`,
      ref: expectRef,
      diasDeCortesia: dias,
      incluiuInternas: incluirInternas,
      expiraEm: fim.toISOString(),
      semeadas: [],
    };

    for (const d of semAssinatura) {
      const criada = await prisma.subscription.create({
        data: {
          decorator_id: d.id,
          // Prefixo reconhecido pelo job de reconciliação, que ignora (e conta)
          // estas linhas em vez de consultar o Mercado Pago por elas.
          mp_preapproval_id: `${PREFIXO_CORTESIA}${d.id}`,
          status: 'ativa',
          vigente: true,
          plano: 'mensal',
          valor_centavos: VALOR_MENSAL_CENTAVOS,
          periodo_fim: fim,
          motivo_cancelamento: null,
        },
      });
      comprovante.semeadas.push({ id: criada.id, decorator_id: d.id, nome: d.name, interna: d.is_internal, preapproval: criada.mp_preapproval_id });
      console.log(`  semeada: ${d.name} -> ${criada.mp_preapproval_id}`);
    }

    // Comprovante em arquivo, como no delete-decorator: escrita em produção não
    // pode depender de alguém ter guardado o terminal.
    const nome = `cortesia-${expectRef}-${Date.now()}.json`;
    const destino = path.join(process.cwd(), nome);
    fs.writeFileSync(destino, JSON.stringify(comprovante, null, 2), 'utf8');
    console.log(`\ncomprovante: ${destino}`);
    console.log(`\nA CORTESIA EXPIRA EM ${fim.toISOString().slice(0, 10)}.`);
    console.log('Depois dessa data as contas caem em somente-leitura (leem tudo, não operam).');
  } catch (erro) {
    console.error('ERRO:', primeiraLinha(erro));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
