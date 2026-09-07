import { describe, it, expect } from 'vitest';
import {
  classeDoToken,
  ambienteEsperado,
  conferirCoerencia,
  redigirSegredos,
} from '@/lib/mercadopago-credencial';

// Provas de COMPORTAMENTO das regras de credencial. Ficam no config estático
// porque são funções puras: não sobem servidor nem tocam banco.

describe('classe do token', () => {
  it('TEST- é sandbox pelo prefixo', () => {
    expect(classeDoToken('TEST-7631234567890-083118-abc')).toBe('teste_pelo_prefixo');
  });

  it('APP_USR- é INDETERMINADO — pode ser produção ou usuário de teste', () => {
    // A lição que custou uma sessão: numa conta de teste, as credenciais
    // "de produção" já SÃO de sandbox e começam com APP_USR-. Só a tag
    // test_user em /users/me distingue.
    expect(classeDoToken('APP_USR-2127748519131286-090408-abc-3660392740')).toBe('indeterminado');
  });
});

describe('ambiente esperado', () => {
  it('MP_AMBIENTE manda quando existe', () => {
    expect(ambienteEsperado({ MP_AMBIENTE: 'producao', NODE_ENV: 'development' })).toBe('producao');
    expect(ambienteEsperado({ MP_AMBIENTE: 'teste', NODE_ENV: 'production' })).toBe('teste');
  });
  it('sem MP_AMBIENTE, vale o NODE_ENV', () => {
    expect(ambienteEsperado({ NODE_ENV: 'production' })).toBe('producao');
    expect(ambienteEsperado({ NODE_ENV: 'development' })).toBe('teste');
    expect(ambienteEsperado({})).toBe('teste');
  });
  it('MP_AMBIENTE com valor inválido é ignorado (não vira produção por acidente)', () => {
    expect(ambienteEsperado({ MP_AMBIENTE: 'prod', NODE_ENV: 'development' })).toBe('teste');
  });
});

describe('coerência entre credencial e ambiente', () => {
  it('TEST- em ambiente de teste: aceita', () => {
    expect(conferirCoerencia('TEST-abc12345', 'teste')).toEqual({ resultado: 'aceita', modo: 'teste' });
  });

  it('APP_USR- em produção: aceita', () => {
    expect(conferirCoerencia('APP_USR-abc12345', 'producao')).toEqual({ resultado: 'aceita', modo: 'producao' });
  });

  it('RECUSA credencial de teste em produção (ninguém seria cobrado, em silêncio)', () => {
    const r = conferirCoerencia('TEST-abc12345', 'producao');
    expect(r.resultado).toBe('recusa');
    if (r.resultado === 'recusa') expect(r.motivo).toContain('TESTE');
  });

  it('APP_USR- em ambiente de teste NÃO é aceito de plano — exige confirmação online', () => {
    // Este é o ponto do desenho: declarar MP_AMBIENTE=teste não pode bastar,
    // senão a variável vira a porta pela qual credencial de produção entra.
    const r = conferirCoerencia('APP_USR-abc12345', 'teste');
    expect(r.resultado).toBe('exige_confirmacao_online');
  });

  it('nenhum caminho aceita APP_USR- em teste sem passar pela confirmação', () => {
    const r = conferirCoerencia('APP_USR-2127748519131286-090408-abc-3660392740', 'teste');
    expect(r.resultado).not.toBe('aceita');
  });
});

describe('redação de segredos', () => {
  it('some com access token e public key', () => {
    const t = redigirSegredos('erro do MP: token=TEST-7631234567890-083118-fbb0abc e pk APP_USR-b8f9d0c1e2');
    expect(t).not.toContain('TEST-763');
    expect(t).not.toContain('APP_USR-b8f');
    expect(t).toContain('[REDIGIDO]');
  });

  it('some com o header Authorization', () => {
    expect(redigirSegredos('Authorization: Bearer qualquercoisa123')).not.toContain('qualquercoisa123');
  });

  it('some com a assinatura secreta do webhook (hex longo)', () => {
    const segredo = '6d668d79'.repeat(8); // 64 hex, o formato do MP_WEBHOOK_SECRET
    expect(redigirSegredos(`v1=${segredo}`)).not.toContain(segredo);
  });

  it('PRESERVA o id da preapproval (32 hex) — log de cobrança tem de ser legível', () => {
    const id = '4f6b7a169a9c4da69c7ef52df623fd2a';
    expect(redigirSegredos(`preapproval ${id} authorized`)).toContain(id);
  });

  it('não estraga texto normal', () => {
    const normal = 'preapproval 4f6b7a authorized valor 149.90 BRL';
    expect(redigirSegredos(normal)).toBe(normal);
  });
});
