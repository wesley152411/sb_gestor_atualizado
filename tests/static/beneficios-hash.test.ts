import { describe, it, expect } from 'vitest';
import { hashAncora, normalizarCnpj, ancoraValida } from '@/lib/beneficios-hash';

// A âncora é o que impede alguém de apagar a conta e ganhar outro mês grátis.
// Ela precisa ser estável (mesma empresa, mesmo hash) e irreversível (o dump não
// pode revelar quem usou o teste).

const PEPPER = 'pepper-de-teste-nao-usar-em-producao';
const CNPJ = '53592299000187';

describe('normalização', () => {
  it('máscara não pode gerar duas âncoras para a mesma empresa', () => {
    expect(normalizarCnpj('53.592.299/0001-87')).toBe(CNPJ);
    expect(hashAncora('cnpj', '53.592.299/0001-87', PEPPER)).toBe(hashAncora('cnpj', CNPJ, PEPPER));
  });

  it('recusa CNPJ com quantidade errada de dígitos', () => {
    expect(ancoraValida('cnpj', '5359229900018')).toBe(false);
    expect(ancoraValida('cnpj', CNPJ)).toBe(true);
  });
});

describe('hash', () => {
  it('não contém o CNPJ em lugar nenhum', () => {
    const h = hashAncora('cnpj', CNPJ, PEPPER);
    expect(h).not.toContain(CNPJ);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pepper diferente dá hash diferente — é o que isola teste de produção', () => {
    expect(hashAncora('cnpj', CNPJ, PEPPER)).not.toBe(hashAncora('cnpj', CNPJ, 'outro-pepper'));
  });

  it('o tipo entra no material assinado: mesmo dígito não colide entre âncoras', () => {
    expect(hashAncora('cnpj', '123456', PEPPER)).not.toBe(hashAncora('mp_payer', '123456', PEPPER));
  });

  it('sem pepper, recusa em vez de gerar hash reversível', () => {
    // O espaço de CNPJs é enumerável: SHA-256 sem pepper cai por força bruta.
    expect(() => hashAncora('cnpj', CNPJ, '')).toThrow(/pepper/i);
  });

  it('é estável entre execuções (a âncora tem de valer daqui a um ano)', () => {
    expect(hashAncora('cnpj', CNPJ, PEPPER)).toBe(hashAncora('cnpj', CNPJ, PEPPER));
  });
});
