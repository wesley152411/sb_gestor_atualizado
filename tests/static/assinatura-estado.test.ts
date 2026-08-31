import { describe, it, expect } from 'vitest';
import {
  calcularEstado,
  concedeAcesso,
  reaisParaCentavos,
  centavosParaReais,
  type EstadoAnterior,
  type PreapprovalMP,
} from '@/lib/assinatura-estado';

// Esta função decide QUEM TEM ACESSO E ATÉ QUANDO a partir do que o Mercado Pago
// responde. Errar aqui é cortar acesso de quem pagou ou liberar para quem não
// pagou — por isso ela é pura, e por isso cada regra dos Termos tem um caso.

const AGORA = new Date('2026-09-01T12:00:00Z');
const EM_20_DIAS = new Date('2026-09-21T12:00:00Z');
const HA_5_DIAS = new Date('2026-08-27T12:00:00Z');

const zerado: EstadoAnterior = { status: 'pendente', periodo_fim: null, teste_fim: null, vigente: false };

function mp(over: Partial<PreapprovalMP> = {}): PreapprovalMP {
  return {
    id: '4f6b7a169a9c4da69c7ef52df623fd2a',
    status: 'authorized',
    payer_id: 123456,
    next_payment_date: EM_20_DIAS.toISOString(),
    auto_recurring: { transaction_amount: 149.9 },
    summarized: { charged_quantity: 1 },
    ...over,
  };
}

describe('dinheiro em centavos', () => {
  it('nossos dois valores', () => {
    expect(reaisParaCentavos(149.9)).toBe(14990);
    expect(reaisParaCentavos(99.9)).toBe(9990);
  });

  it('ARREDONDA, não trunca — e o caso tem de ser um que distinga os dois', () => {
    // 149.9 * 100 dá 14990.000000000002: truncar acerta por sorte, então usar só
    // ele deixaria a regressão passar. Estes caem para BAIXO do inteiro:
    //   1.15 * 100 = 114.99999999999999  -> trunc 114, round 115
    //   8.29 * 100 = 828.9999999999999   -> trunc 828, round 829
    expect(reaisParaCentavos(1.15)).toBe(115);
    expect(reaisParaCentavos(8.29)).toBe(829);
    expect(reaisParaCentavos(0.29)).toBe(29);
  });
  it('volta para reais sem perder centavo', () => {
    expect(centavosParaReais(14990)).toBe(149.9);
    expect(centavosParaReais(9990)).toBe(99.9);
  });
});

describe('pending — ainda no checkout', () => {
  it('não concede acesso e não vira a linha vigente', () => {
    const e = calcularEstado(mp({ status: 'pending' }), zerado, AGORA);
    expect(e.status).toBe('pendente');
    expect(e.vigente).toBe(false);
    expect(concedeAcesso(e, AGORA)).toBe(false);
  });
});

describe('authorized', () => {
  it('sem cobrança e com free_trial: está EM TESTE', () => {
    const e = calcularEstado(
      mp({ auto_recurring: { transaction_amount: 149.9, free_trial: { frequency: 1, frequency_type: 'months' } }, summarized: { charged_quantity: 0 } }),
      zerado, AGORA,
    );
    expect(e.status).toBe('em_teste');
    expect(e.vigente).toBe(true);
    expect(e.teste_fim?.getTime()).toBe(EM_20_DIAS.getTime());
    expect(concedeAcesso(e, AGORA)).toBe(true);
  });

  it('depois da primeira cobrança: ATIVA, mesmo tendo tido teste', () => {
    const e = calcularEstado(
      mp({ auto_recurring: { transaction_amount: 149.9, free_trial: { frequency: 1, frequency_type: 'months' } }, summarized: { charged_quantity: 1 } }),
      zerado, AGORA,
    );
    expect(e.status).toBe('ativa');
  });

  it('converte o valor do MP para centavos', () => {
    expect(calcularEstado(mp(), zerado, AGORA).valor_centavos_mp).toBe(14990);
    expect(calcularEstado(mp({ auto_recurring: { transaction_amount: 99.9 } }), zerado, AGORA).valor_centavos_mp).toBe(9990);
  });

  it('o período já concedido NUNCA encurta', () => {
    const anterior: EstadoAnterior = { status: 'ativa', periodo_fim: EM_20_DIAS, teste_fim: null, vigente: true };
    const e = calcularEstado(mp({ next_payment_date: HA_5_DIAS.toISOString() }), anterior, AGORA);
    expect(e.periodo_fim?.getTime(), 'acesso já dado não se tira').toBe(EM_20_DIAS.getTime());
  });
});

describe('paused — cobrança falhou (Termos 5.3)', () => {
  it('com período ainda em pé: INADIMPLENTE, e o acesso continua', () => {
    const anterior: EstadoAnterior = { status: 'ativa', periodo_fim: EM_20_DIAS, teste_fim: null, vigente: true };
    const e = calcularEstado(mp({ status: 'paused', next_payment_date: null }), anterior, AGORA);
    expect(e.status).toBe('inadimplente');
    expect(concedeAcesso(e, AGORA), 'ela pagou este mês; o acesso vale até o fim dele').toBe(true);
  });

  it('com o período vencido: SUSPENSA, sem acesso', () => {
    const anterior: EstadoAnterior = { status: 'inadimplente', periodo_fim: HA_5_DIAS, teste_fim: null, vigente: true };
    const e = calcularEstado(mp({ status: 'paused', next_payment_date: null }), anterior, AGORA);
    expect(e.status).toBe('suspensa');
    expect(concedeAcesso(e, AGORA)).toBe(false);
  });
});

describe('cancelled — cancelamento (Termos 6.2)', () => {
  it('NÃO corta na hora: acesso até o fim do período pago', () => {
    const anterior: EstadoAnterior = { status: 'ativa', periodo_fim: EM_20_DIAS, teste_fim: null, vigente: true };
    const e = calcularEstado(mp({ status: 'cancelled', next_payment_date: null }), anterior, AGORA);
    expect(e.status).toBe('cancelada');
    expect(e.vigente).toBe(true);
    expect(concedeAcesso(e, AGORA)).toBe(true);
  });

  it('o MP zera next_payment_date ao cancelar — e isso NÃO pode apagar o período', () => {
    const anterior: EstadoAnterior = { status: 'ativa', periodo_fim: EM_20_DIAS, teste_fim: null, vigente: true };
    const e = calcularEstado(mp({ status: 'cancelled', next_payment_date: null }), anterior, AGORA);
    expect(e.periodo_fim?.getTime(), 'sobrescrever com null cortaria acesso já pago').toBe(EM_20_DIAS.getTime());
    expect(e.proxima_cobranca, 'não há próxima cobrança depois de cancelar').toBeNull();
  });

  it('com o período já vencido: EXPIRADA, sem acesso e sem ser vigente', () => {
    const anterior: EstadoAnterior = { status: 'cancelada', periodo_fim: HA_5_DIAS, teste_fim: null, vigente: true };
    const e = calcularEstado(mp({ status: 'cancelled', next_payment_date: null }), anterior, AGORA);
    expect(e.status).toBe('expirada');
    expect(e.vigente).toBe(false);
    expect(concedeAcesso(e, AGORA)).toBe(false);
  });
});

describe('idempotência', () => {
  it('aplicar a mesma resposta dez vezes dá o mesmo estado', () => {
    const entrada = mp();
    let estado = calcularEstado(entrada, zerado, AGORA);
    const primeiro = JSON.stringify(estado);
    for (let i = 0; i < 9; i++) {
      estado = calcularEstado(entrada, {
        status: estado.status, periodo_fim: estado.periodo_fim, teste_fim: estado.teste_fim, vigente: estado.vigente,
      }, AGORA);
    }
    expect(JSON.stringify(estado)).toBe(primeiro);
  });

  it('a ordem webhook-e-retorno não importa: as duas chegam ao mesmo lugar', () => {
    const entrada = mp();
    const viaRetorno = calcularEstado(entrada, zerado, AGORA);
    const viaWebhook = calcularEstado(entrada, zerado, AGORA);
    const retornoDepois = calcularEstado(entrada, {
      status: viaWebhook.status, periodo_fim: viaWebhook.periodo_fim, teste_fim: viaWebhook.teste_fim, vigente: viaWebhook.vigente,
    }, AGORA);
    expect(JSON.stringify(retornoDepois)).toBe(JSON.stringify(viaRetorno));
  });
});

describe('status desconhecido do MP', () => {
  it('não concede nada (falha fechada para estado que não sabemos ler)', () => {
    const e = calcularEstado(mp({ status: 'inventado_pelo_mp' }), zerado, AGORA);
    expect(e.status).toBe('pendente');
    expect(concedeAcesso(e, AGORA)).toBe(false);
  });
});
