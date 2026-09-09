import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import { desenharDocumento, nomeDoArquivo, type PDFMinimo } from '@/lib/documento-pdf';
import type { PartyEvent, Client, Decorator } from '@/types';

// POR QUE ESTE TESTE EXISTE
//
// Existiam DOIS geradores de PDF (quote-pdf e pdf-generator) chamados de QUATRO
// lugares: o mesmo evento saía com aparências diferentes conforme o botão
// apertado. Um dos quatro disparos era AUTOMÁTICO ao confirmar — a pessoa
// clicava em Confirmar e o navegador baixava um arquivo que ela não pediu.
//
// Estas provas guardam as três decisões que resolveram isso: um gerador só,
// duas variantes com fronteira clara, e nenhum download que ninguém pediu.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');

describe('existe UM gerador de PDF', () => {
  it('os dois antigos não existem mais', () => {
    for (const antigo of ['src/lib/quote-pdf.ts', 'src/lib/pdf-generator.ts']) {
      expect(existsSync(path.join(RAIZ, antigo)), `${antigo} deveria ter sido removido`).toBe(false);
    }
  });

  it('nenhuma tela importa um gerador que não seja o unificado', () => {
    for (const tela of [
      'src/app/(dashboard)/clients/page.tsx',
      'src/app/(dashboard)/calendar/page.tsx',
      'src/app/(dashboard)/party-form/page.tsx',
    ]) {
      const fonte = ler(tela);
      expect(fonte, `${tela} ainda aponta para um gerador antigo`).not.toMatch(/quote-pdf|pdf-generator/);
      if (/PDF/.test(fonte)) expect(fonte).toMatch(/gerarDocumentoPDF/);
    }
  });
});

describe('a variante de equipe não vaza dinheiro', () => {
  // Dublê do jsPDF: registra TUDO que seria escrito. Prova de comportamento, não
  // de texto-fonte — a primeira versão deste teste era textual e reprovava o
  // código correto, porque o preço do item vive no `else` de `if (equipe)` e a
  // busca por "if (!equipe)" não o reconhecia.
  function papel() {
    const escrito: string[] = [];
    const doc: PDFMinimo = {
      setFillColor: () => {}, setTextColor: () => {}, setDrawColor: () => {},
      setLineWidth: () => {}, setFont: () => {}, setFontSize: () => {},
      rect: () => {}, roundedRect: () => {}, triangle: () => {}, line: () => {},
      splitTextToSize: (t: string) => [t],
      addPage: () => {}, getNumberOfPages: () => 1,
      text: (t: string | string[]) => { escrito.push(...(Array.isArray(t) ? t : [t])); },
    };
    return { doc, escrito };
  }

  const EVENTO = {
    id: 'e1', client_name: 'Maria', phone: '31999999999',
    address: 'Rua Ceara 407, Celvia - Vespasiano',
    setup_time: '08:00', start_time: '12:00', theme: 'Safari',
    total_value: 1234.56, event_date: '2026-10-15', status: 'Confirmado',
    items: [
      { id: 'i1', name: 'Painel redondo', quantity: 2, price: 500 },
      { id: 'i2', name: 'Mesa acrílica', quantity: 1, price: 234.56 },
    ],
  } as unknown as PartyEvent;
  const CLIENTE = { id: 'c1', name: 'Maria', phone: '31999999999', email: 'm@x.com', cpf: '123' } as Client;
  const DECORADORA = { id: 'd1', name: 'SB Festas' } as Decorator;

  it('nenhum valor em dinheiro chega ao papel da equipe', () => {
    const { doc, escrito } = papel();
    desenharDocumento(doc, EVENTO, CLIENTE, DECORADORA, 'equipe');
    const comDinheiro = escrito.filter((t) => /R\$|1\.?234|500,00|234,56/.test(t));
    expect(comDinheiro, `a equipe veria: ${comDinheiro.join(' | ')}`).toEqual([]);
  });

  it('o contrato mostra o total e os valores por peça', () => {
    const { doc, escrito } = papel();
    desenharDocumento(doc, EVENTO, CLIENTE, DECORADORA, 'contrato');
    const tudo = escrito.join(' ');
    expect(tudo, 'o contrato precisa do total').toMatch(/1\.234,56/);
    expect(tudo).toMatch(/VALOR TOTAL/);
  });

  it('a equipe recebe o checklist; o contrato, não', () => {
    const eq = papel(); desenharDocumento(eq.doc, EVENTO, CLIENTE, DECORADORA, 'equipe');
    const ct = papel(); desenharDocumento(ct.doc, EVENTO, CLIENTE, DECORADORA, 'contrato');
    expect(eq.escrito.join(' ')).toMatch(/carregado/);
    expect(ct.escrito.join(' '), 'contrato não é folha de conferência').not.toMatch(/carregado/);
  });

  it('a equipe não vê dados pessoais da cliente', () => {
    const { doc, escrito } = papel();
    desenharDocumento(doc, EVENTO, CLIENTE, DECORADORA, 'equipe');
    expect(escrito.join(' '), 'CPF não é assunto de quem carrega o caminhão').not.toMatch(/CPF/);
  });

  it('os dois trazem a mesma marca e o endereço da montagem', () => {
    for (const v of ['equipe', 'contrato'] as const) {
      const { doc, escrito } = papel();
      desenharDocumento(doc, EVENTO, CLIENTE, DECORADORA, v);
      const tudo = escrito.join(' ');
      expect(tudo, `${v} sem a marca`).toMatch(/SB GESTOR/);
      expect(tudo, `${v} sem o endereço`).toMatch(/Rua Ceara 407/);
      expect(tudo, `${v} sem a assinatura do produto`).toMatch(/Gerado pelo SB Gestor/);
    }
  });

  it('o nome do arquivo diz qual documento é', () => {
    expect(nomeDoArquivo(EVENTO, 'equipe')).toMatch(/^MONTAGEM_Maria_2026-10-15\.pdf$/);
    expect(nomeDoArquivo(EVENTO, 'contrato')).toMatch(/^ORCAMENTO_Maria_2026-10-15\.pdf$/);
  });

  it('a variante é explícita na assinatura, não adivinhada', () => {
    const fonte = ler('src/lib/documento-pdf.ts');
    expect(fonte).toMatch(/export type VarianteDocumento = 'contrato' \| 'equipe'/);
  });

  it('cada tela pede a variante que corresponde ao seu público', () => {
    expect(ler('src/app/(dashboard)/calendar/page.tsx')).toMatch(/gerarDocumentoPDF\([^)]*'equipe'\)/);
    expect(ler('src/app/(dashboard)/party-form/page.tsx')).toMatch(/gerarDocumentoPDF\([^)]*'equipe'\)/);
    expect(ler('src/app/(dashboard)/clients/page.tsx')).toMatch(/previewOwner, 'contrato'\)/);
  });
});

describe('confirmar um evento não baixa arquivo', () => {
  const fonte = ler('src/app/(dashboard)/clients/page.tsx');
  const handleConfirm = fonte.slice(fonte.indexOf('const handleConfirm'), fonte.indexOf('const handleCancel'));

  it('handleConfirm não gera PDF', () => {
    expect(handleConfirm, 'baixar sem pedir é comportamento surpreendente')
      .not.toMatch(/gerarDocumentoPDF/);
  });

  it('o download continua alcançável, pela pré-visualização', () => {
    // A garantia é "nada baixa sozinho", não "existe um item de menu": o item
    // dedicado foi removido por ser redundante — o botão de folha já abre a
    // pré-visualização, e é de lá que sai o PDF. O que não pode é o caminho
    // sumir junto com o download automático.
    expect(fonte).toMatch(/handleDownloadFromPreview/);
    expect(fonte).toMatch(/Baixar PDF/);
    expect(fonte, 'a pré-visualização é o que abre antes de gerar').toMatch(/setPreviewEvent/);
  });
});

describe('a pré-visualização mostra o que o PDF vai conter', () => {
  const tela = ler('src/app/(dashboard)/clients/page.tsx');

  it('as duas seções redundantes viraram uma, nos dois', () => {
    // "Dados do cliente" repetia Cliente e Telefone de "Informações gerais".
    // Duas seções dizendo o mesmo fazem procurar diferença onde não há.
    expect(ler('src/lib/documento-pdf.ts')).not.toMatch(/secao\('Dados do cliente'\)/);
    expect(tela, 'a prévia não pode mostrar seção que o PDF não tem')
      .not.toMatch(/>Dados do cliente</);
  });

  it('a prévia usa a mesma primeira seção do documento', () => {
    expect(tela).toMatch(/>Informações gerais do contrato</);
    expect(ler('src/lib/documento-pdf.ts')).toMatch(/secao\('Informações gerais do contrato'\)/);
  });

  it('a prévia não usa mais a paleta do gerador antigo', () => {
    // Terracota veio do quote-pdf, que não existe mais. Prévia com cor de
    // documento morto é a pior pista possível sobre o que vai sair.
    const css = ler('src/app/globals.css');
    const bloco = css.slice(css.indexOf('.quote-doc {'), css.indexOf('.quote-doc-box'));
    for (const antiga of ['#b85450', '#fbf7f2', '#8a8078', '#2f2a26', '#e4d5cd']) {
      expect(bloco, `a prévia ainda usa ${antiga}`).not.toMatch(new RegExp(antiga, 'i'));
    }
    expect(bloco, 'a marca é petróleo').toMatch(/#0088B0/i);
  });
});

describe('o fluxo de orçamento diz montagem, não entrega', () => {
  it('nenhuma tela do orçamento fala em entrega', () => {
    // A decoradora não entrega material: ela vai ao local e monta.
    for (const tela of [
      'src/app/orcamento/[token]/page.tsx',
      'src/app/(dashboard)/clients/page.tsx',
      'src/lib/documento-pdf.ts',
    ]) {
      const fonte = ler(tela)
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
        .join('\n');
      expect(fonte, `${tela} ainda usa "entrega" no fluxo de orçamento`)
        .not.toMatch(/Informações de entrega|Endereço de entrega|Entrega no endereço|logística de entrega/);
    }
  });

  it('"Finalizado / Entregue" continua intacto', () => {
    // Ali "entregue" é conclusão do serviço, não logística — trocar seria errado.
    expect(ler('src/app/(dashboard)/party-form/page.tsx')).toMatch(/Finalizado \/ Entregue/);
  });
});
