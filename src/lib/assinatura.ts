import 'server-only';

import { prisma } from '@/lib/prisma';
import { mpFetch, resumoParaLog } from '@/lib/mercadopago';
import {
  calcularEstado,
  type NovoEstado,
  type PreapprovalMP,
  type StatusLocal,
} from '@/lib/assinatura-estado';
import { ancoraValida, hashAncora } from '@/lib/beneficios-hash';

// O CORAÇÃO IDEMPOTENTE.
//
// O retorno do navegador e o webhook chamam esta mesma função. Ela não recebe um
// delta nem confia em nada que o cliente mandou: relê a verdade com
// GET /preapproval/{id} e grava o resultado. Consequências de graça:
//   - rodar dez vezes dá o mesmo que rodar uma;
//   - "voltou antes do webhook" deixa de ser caso especial;
//   - query param forjado no redirect não libera nada.

export type ResultadoAplicacao =
  | { ok: true; assinaturaId: string; status: StatusLocal; divergente: boolean }
  | { ok: false; motivo: 'nao_existe_no_mp' | 'nao_conhecemos' | 'erro_mp'; detalhe: string };

const LIMITE_DIVERGENCIA = 3;

export async function aplicarEstadoDaAssinatura(preapprovalId: string): Promise<ResultadoAplicacao> {
  const resposta = await mpFetch<PreapprovalMP>(`/preapproval/${encodeURIComponent(preapprovalId)}`);

  if (resposta.status === 404) {
    return { ok: false, motivo: 'nao_existe_no_mp', detalhe: `preapproval ${preapprovalId} não existe no Mercado Pago` };
  }
  if (resposta.status >= 300) {
    return { ok: false, motivo: 'erro_mp', detalhe: resumoParaLog(`/preapproval/${preapprovalId}`, resposta) };
  }

  const atual = await prisma.subscription.findUnique({ where: { mp_preapproval_id: preapprovalId } });
  if (!atual) {
    // Não criamos linha a partir de aviso externo: a assinatura nasce em
    // /api/billing/subscribe, que é quem sabe de qual decoradora ela é. Se isto
    // aparecer, é assinatura órfã e o job de reconciliação registra para análise.
    return { ok: false, motivo: 'nao_conhecemos', detalhe: `preapproval ${preapprovalId} sem linha local` };
  }

  const agora = new Date();
  const novo = calcularEstado(resposta.body, {
    status: atual.status as StatusLocal,
    periodo_fim: atual.periodo_fim,
    teste_fim: atual.teste_fim,
    vigente: atual.vigente,
  }, agora);

  const divergente = novo.valor_centavos_mp !== null && novo.valor_centavos_mp !== atual.valor_centavos;
  const tentativas_sync = divergente ? atual.tentativas_sync + 1 : 0;

  // O teste grátis é consumido no momento em que ele COMEÇA — e o registro tem de
  // sobreviver à exclusão da conta, por isso vai em beneficios_consumidos.
  const comecouOTeste = novo.status === 'em_teste' && atual.status !== 'em_teste';

  await prisma.$transaction(async (tx) => {
    // Troca de vigente na MESMA transação: nunca há duas vigentes nem nenhuma.
    // O índice único parcial é do banco; esta ordem é o que evita bater nele.
    if (novo.vigente) {
      await tx.subscription.updateMany({
        where: { decorator_id: atual.decorator_id, vigente: true, id: { not: atual.id } },
        data: { vigente: false, atualizada_em: agora },
      });
    }

    await tx.subscription.update({
      where: { id: atual.id },
      data: {
        status: novo.status,
        vigente: novo.vigente,
        periodo_fim: novo.periodo_fim,
        proxima_cobranca: novo.proxima_cobranca,
        teste_fim: novo.teste_fim,
        valor_centavos_mp: novo.valor_centavos_mp,
        mp_payer_id: novo.mp_payer_id ?? atual.mp_payer_id,
        sincronizado_em: agora,
        tentativas_sync,
        cancelada_em: novo.status === 'cancelada' ? (atual.cancelada_em ?? agora) : atual.cancelada_em,
        atualizada_em: agora,
      },
    });

    if (comecouOTeste) await registrarTesteConsumido(tx, atual.decorator_id, novo.mp_payer_id);
  });

  if (divergente && tentativas_sync >= LIMITE_DIVERGENCIA) {
    // Dinheiro errado: o MP está cobrando um valor que não é o combinado. Sai com
    // etiqueta buscável; o job de reconciliação transforma isto em falha de CI.
    console.error(
      `[COBRANCA-DIVERGENTE] decorator=${atual.decorator_id} preapproval=${preapprovalId} ` +
      `desejado=${atual.valor_centavos} no_mp=${novo.valor_centavos_mp} tentativas=${tentativas_sync}`,
    );
  }

  return { ok: true, assinaturaId: atual.id, status: novo.status, divergente };
}

// Marca teste grátis como consumido nas âncoras disponíveis. Não falha a
// transação inteira por causa disto: benefício já registrado é o caso NORMAL na
// reexecução (é o que idempotência significa aqui).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function registrarTesteConsumido(tx: Tx, decoratorId: string, payerId: string | null) {
  const pepper = process.env.BENEFICIOS_PEPPER;
  if (!pepper) {
    console.error('[BENEFICIO] BENEFICIOS_PEPPER ausente: o consumo do teste grátis NÃO foi registrado.');
    return;
  }

  const decoradora = await tx.decorator.findUnique({ where: { id: decoratorId }, select: { cnpj: true } });
  const ancoras: { ancora_tipo: 'cnpj' | 'mp_payer'; valor: string }[] = [];
  if (decoradora?.cnpj && ancoraValida('cnpj', decoradora.cnpj)) {
    ancoras.push({ ancora_tipo: 'cnpj', valor: decoradora.cnpj });
  }
  if (payerId && ancoraValida('mp_payer', payerId)) {
    ancoras.push({ ancora_tipo: 'mp_payer', valor: payerId });
  }
  if (!ancoras.length) {
    console.warn(`[BENEFICIO] decorator=${decoratorId} entrou em teste sem âncora utilizável (CNPJ ausente?).`);
    return;
  }

  await tx.beneficioConsumido.createMany({
    data: ancoras.map((a) => ({
      ancora_tipo: a.ancora_tipo,
      ancora_hash: hashAncora(a.ancora_tipo, a.valor, pepper),
      beneficio: 'teste_gratis',
    })),
    skipDuplicates: true, // reexecução não é erro: é o esperado
  });
}

/** Já usou o teste grátis? Consulta as âncoras que sobrevivem à exclusão da conta. */
export async function jaUsouTesteGratis(cnpj: string | null, payerId?: string | null): Promise<boolean> {
  const pepper = process.env.BENEFICIOS_PEPPER;
  if (!pepper) {
    // Sem pepper não dá para responder. Fecha: conceder teste por engano é
    // prejuízo recorrente; recusar por engano é um suporte pontual.
    console.error('[BENEFICIO] BENEFICIOS_PEPPER ausente: negando teste grátis por precaução.');
    return true;
  }
  const hashes: string[] = [];
  if (cnpj && ancoraValida('cnpj', cnpj)) hashes.push(hashAncora('cnpj', cnpj, pepper));
  if (payerId && ancoraValida('mp_payer', payerId)) hashes.push(hashAncora('mp_payer', payerId, pepper));
  if (!hashes.length) return false;

  const achado = await prisma.beneficioConsumido.findFirst({
    where: { beneficio: 'teste_gratis', ancora_hash: { in: hashes } },
    select: { id: true },
  });
  return achado !== null;
}

export type { NovoEstado };
