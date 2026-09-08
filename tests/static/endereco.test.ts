import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import {
  estruturadoCompleto, camposFaltando, enderecoEmLinhas, formatarEndereco,
  mascararCep, cepValido, ufValida, buscarCep, CAMPOS_OBRIGATORIOS,
  type FonteEndereco,
} from '@/lib/endereco';

// POR QUE ESTE TESTE EXISTE
//
// A coluna `address` de texto livre continua existindo para os 20 eventos
// gravados antes da estruturação — e nada foi convertido, de propósito. Então
// existem DOIS formatos vivos ao mesmo tempo, e a pergunta que decide tudo é o
// que a tela faz com uma linha meio preenchida.
//
// A regra é TUDO OU NADA: só usa o formato novo com os seis obrigatórios
// presentes; faltando um, cai inteiro no texto antigo. Nunca metade de cada.

const COMPLETO: FonteEndereco = {
  address: 'Av Paulista 407 Celvia - Vespasiano',
  cep: '33200-610', logradouro: 'Rua Ceará', numero: '407',
  bairro: 'Célvia', cidade: 'Vespasiano', estado: 'MG',
};

describe('tudo ou nada entre os dois formatos', () => {
  it('com os seis campos, usa o formato novo e IGNORA o address antigo', () => {
    const linhas = enderecoEmLinhas(COMPLETO);
    expect(linhas).toEqual(['Rua Ceará, 407', 'Célvia — Vespasiano/MG', 'CEP 33200-610']);
    expect(linhas.join(' '), 'o texto antigo não pode aparecer junto').not.toMatch(/Av Paulista/);
  });

  it('faltando QUALQUER obrigatório, cai inteiro no address', () => {
    // É o coração da regra: um por um, cada ausência derruba o formato novo.
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const parcial = { ...COMPLETO, [campo]: '' };
      expect(estruturadoCompleto(parcial), `sem ${campo} não deveria estar completo`).toBe(false);
      expect(enderecoEmLinhas(parcial), `sem ${campo} deveria cair no antigo`)
        .toEqual(['Av Paulista 407 Celvia - Vespasiano']);
    }
  });

  it('nunca mistura: nenhum traço solto de campo faltando', () => {
    // O sintoma que a regra evita: "Rua Ceará, — — Vespasiano/ — CEP —".
    const semBairro = { ...COMPLETO, bairro: '' };
    expect(formatarEndereco(semBairro)).not.toMatch(/—\s*—/);
    expect(formatarEndereco(semBairro)).not.toMatch(/CEP\s*$/);
  });

  it('campo só com espaços conta como vazio', () => {
    expect(estruturadoCompleto({ ...COMPLETO, numero: '   ' })).toBe(false);
  });

  it('sem os dois formatos, devolve o traço e não string quebrada', () => {
    expect(enderecoEmLinhas({})).toEqual([]);
    expect(formatarEndereco({})).toBe('—');
    expect(formatarEndereco(null)).toBe('—');
    expect(formatarEndereco({ address: '   ' })).toBe('—');
  });

  it('complemento é opcional e não derruba o formato novo', () => {
    expect(estruturadoCompleto({ ...COMPLETO, complemento: '' })).toBe(true);
    expect(enderecoEmLinhas({ ...COMPLETO, complemento: 'Apto 2' })[0]).toBe('Rua Ceará, 407 — Apto 2');
  });

  it('estruturado completo SEM address antigo funciona (o caso novo)', () => {
    const { address, ...semAntigo } = COMPLETO;
    void address;
    expect(enderecoEmLinhas(semAntigo)[2]).toBe('CEP 33200-610');
  });

  it('camposFaltando nomeia exatamente quem falta', () => {
    expect(camposFaltando(COMPLETO)).toEqual([]);
    expect(camposFaltando({ ...COMPLETO, cep: '', cidade: '' })).toEqual(['cep', 'cidade']);
  });
});

describe('máscara e validação do CEP', () => {
  it('mascara enquanto digita, sem atrapalhar', () => {
    expect(mascararCep('3')).toBe('3');
    expect(mascararCep('33200')).toBe('33200');
    expect(mascararCep('332006')).toBe('33200-6');
    expect(mascararCep('33200610')).toBe('33200-610');
  });

  it('descarta o que não é dígito e não deixa passar do tamanho', () => {
    expect(mascararCep('33.200-610')).toBe('33200-610');
    expect(mascararCep('33200610999')).toBe('33200-610');
    expect(mascararCep('abc')).toBe('');
  });

  it('valida o MESMO formato que o CHECK do banco exige', () => {
    // Se divergirem, a tela deixa passar e o banco recusa com erro feio.
    expect(cepValido('33200-610')).toBe(true);
    expect(cepValido('33200610')).toBe(false);
    expect(cepValido('3320-610')).toBe(false);
    expect(cepValido('3320A-610')).toBe(false);
    expect(cepValido('')).toBe(false);
    expect(cepValido(null)).toBe(false);
  });

  it('UF: duas letras maiúsculas', () => {
    expect(ufValida('MG')).toBe(true);
    expect(ufValida('mg')).toBe(true);   // a tela normaliza antes de gravar
    expect(ufValida('M')).toBe(false);
    expect(ufValida('MGX')).toBe(false);
  });
});

describe('ViaCEP preenche, mas nunca manda', () => {
  const resposta = (corpo: unknown, ok = true) =>
    (async () => ({ ok, json: async () => corpo })) as unknown as typeof fetch;

  it('devolve os campos quando o CEP existe', async () => {
    const achado = await buscarCep('33200-610', resposta({
      logradouro: 'Rua Ceará', bairro: 'Célvia', localidade: 'Vespasiano', uf: 'mg',
    }));
    expect(achado).toEqual({ logradouro: 'Rua Ceará', bairro: 'Célvia', cidade: 'Vespasiano', estado: 'MG' });
  });

  it('CEP inexistente devolve null, não erro', () => {
    // A base pública responde 200 com {erro:true} — tratar como falha é o certo.
    return expect(buscarCep('99999-999', resposta({ erro: true }))).resolves.toBeNull();
  });

  it('rede fora devolve null e não derruba a tela', () => {
    const quebrado = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    return expect(buscarCep('33200-610', quebrado)).resolves.toBeNull();
  });

  it('CEP incompleto nem chega a consultar', async () => {
    let chamou = false;
    const espiao = (async () => { chamou = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
    expect(await buscarCep('3320', espiao)).toBeNull();
    expect(chamou, 'não faz requisição com CEP pela metade').toBe(false);
  });

  it('CEP de rua inteira, sem número, ainda preenche o resto', async () => {
    // O caso real que motivou "os campos continuam editáveis": o ViaCEP não
    // devolve número, e isso não pode impedir nada.
    const achado = await buscarCep('30140-071', resposta({
      logradouro: 'Avenida Afonso Pena', bairro: 'Centro', localidade: 'Belo Horizonte', uf: 'MG',
    }));
    expect(achado?.logradouro).toBe('Avenida Afonso Pena');
    expect(estruturadoCompleto({ ...achado, cep: '30140-071', numero: '' }), 'sem número segue incompleto').toBe(false);
  });
});

describe('a mesma regra vale nas telas e no PDF', () => {
  const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

  it('ninguém monta endereço à mão com "||"', () => {
    // O padrão antigo era `evento.address || cliente?.address || '—'`, que não
    // conhece os campos novos. Duas regras de endereço divergiriam na primeira
    // mudança — por isso a decisão vive num lugar só.
    for (const arquivo of [
      'src/app/(dashboard)/clients/page.tsx',
      'src/lib/documento-pdf.ts',
      'src/app/orcamento/[token]/page.tsx',
    ]) {
      const fonte = ler(arquivo);
      expect(fonte, `${arquivo} deveria usar formatarEndereco`).toMatch(/formatarEndereco|enderecoEmLinhas/);
      expect(fonte, `${arquivo} ainda concatena address na mão`)
        .not.toMatch(/\.address \|\| \w+\?\.address \|\| '—'/);
    }
  });

  it('a validação da tela usa o mesmo formato do CHECK do banco', () => {
    const sql = ler('supabase/migrations/20260908220000_endereco_estruturado.sql');
    expect(sql, 'o CHECK do CEP mudou de formato').toMatch(/\^\[0-9\]\{5\}-\[0-9\]\{3\}\$/);
    expect(sql, 'o CHECK da UF mudou de formato').toMatch(/\^\[A-Z\]\{2\}\$/);
    // cepValido/ufValida acima já provam o lado da tela com estes mesmos casos.
    expect(cepValido('33200-610')).toBe(true);
    expect(cepValido('33200610')).toBe(false);
    expect(ufValida('MG')).toBe(true);
  });

  it('o servidor recusa endereço incompleto, não só a tela', () => {
    // Um POST direto no link público não passa pelo formulário.
    const rota = ler('src/app/api/public/quote/[token]/route.ts');
    expect(rota).toMatch(/camposFaltando\(endereco\)/);
    expect(rota).toMatch(/cepValido\(endereco\.cep\)/);
  });
});
