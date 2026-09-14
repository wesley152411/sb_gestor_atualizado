import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { RAIZ } from './grafo';
import { sanitizeInstagramHandle, sanitizePhoneDigits } from '@/lib/utils';

// POR QUE ESTE TESTE EXISTE
//
// Configurações e Minha Página editavam os mesmos campos (Sobre, WhatsApp,
// Instagram). Duas telas gravando o mesmo dado: a que salvasse por último
// sobrescrevia a outra com uma cópia antiga. A dona decidiu: esses três ficam
// SÓ na Minha Página; Configurações fica com Nome da Empresa, CNPJ e
// Cidade/Estado.
//
// Junto saíram três coisas que não faziam nada de novo: a câmera sobreposta ao
// avatar (repetia o botão "Alterar foto"), os dois ícones da Minha Página (sem
// onClick nenhum) e a "resposta automática" do chat, que respondia em nome da
// parceira sem ela ter escrito nada.

const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8');
const config = ler('src/app/(dashboard)/settings/page.tsx');
const minhaPagina = ler('src/app/(dashboard)/marketplace/my-page/page.tsx');
const css = ler('src/app/globals.css');

const trecho = (fonte: string, de: string, ate: string) => {
  const i = fonte.indexOf(de);
  const j = fonte.indexOf(ate, i);
  expect(i, `âncora "${de}" sumiu`).toBeGreaterThan(-1);
  expect(j, `âncora "${ate}" sumiu`).toBeGreaterThan(i);
  return fonte.slice(i, j);
};

describe('Configurações: só os três campos da conta', () => {
  it('Nome da Empresa, CNPJ e Cidade/Estado continuam', () => {
    for (const rotulo of ['Nome da Empresa', 'CNPJ', 'Cidade / Estado']) {
      expect(config).toContain(`label="${rotulo}"`);
    }
  });

  it('Sobre, WhatsApp e Instagram não estão mais no formulário', () => {
    expect(config).not.toMatch(/label="WhatsApp"/);
    expect(config).not.toMatch(/label="Instagram"/);
    expect(config).not.toMatch(/>Sobre<\/label>/);
    expect(config).not.toMatch(/profile\.(about|whatsapp|instagram)/);
  });

  it('salvar envia só o que esta tela edita — não sobrescreve a Minha Página', () => {
    const salvar = trecho(config, 'const handleSaveProfile', 'const processAvatarUpload');
    expect(salvar, 'espalhar o perfil inteiro reenvia Sobre/WhatsApp/Instagram antigos').not.toMatch(/\.\.\.profile/);
    expect(salvar).not.toMatch(/about|whatsapp|instagram/);
    expect(salvar).toMatch(/name: profile\.name/);
    expect(salvar).toMatch(/location: profile\.location/);
  });

  it('trocar a foto grava só a foto', () => {
    expect(config).toMatch(/saveDecoratorProfile\(\{ avatar_url \}\)/);
  });
});

describe('Configurações: avatar sem a câmera sobreposta', () => {
  it('o botão redundante e o estilo dele saíram', () => {
    expect(config).not.toMatch(/settings-avatar-btn/);
    expect(css).not.toMatch(/\.settings-avatar-btn/);
  });

  it('"Alterar foto" continua sendo o jeito de trocar a foto', () => {
    expect(config).toMatch(/>\s*Alterar foto\s*</);
    expect(config).toMatch(/onClick=\{\(\) => fileInputRef\.current\?\.click\(\)\}/);
  });
});

describe('Minha Página: a única tela que edita Sobre, WhatsApp e Instagram', () => {
  it('o Editar Perfil tem os três campos', () => {
    const modal = trecho(minhaPagina, 'title="Editar Perfil da Decoradora"', '{/* Import Inventory Modal */}');
    expect(modal).toMatch(/label="Instagram"/);
    expect(modal).toMatch(/label="WhatsApp"/);
    expect(modal).toMatch(/Sobre a Empresa/);
    expect(minhaPagina).toMatch(/onClick=\{handleOpenEditProfile\}/);
  });

  it('salvar limpa os campos como Configurações fazia, e só envia o formulário', () => {
    const salvar = trecho(minhaPagina, 'const handleSaveProfile', '// Import Items Toggle Handler');
    expect(salvar).toMatch(/sanitizeInstagramHandle\(editProfileForm\.instagram\) \|\| null/);
    expect(salvar).toMatch(/sanitizePhoneDigits\(editProfileForm\.whatsapp\) \|\| null/);
    expect(salvar).toMatch(/editProfileForm\.about\.trim\(\) \|\| null/);
    expect(salvar, 'espalhar o perfil inteiro reenvia a capa em base64 e campos que não são desta tela').not.toMatch(/\.\.\.decorator/);
  });

  it('a limpeza gera o formato que os links da página pública esperam', () => {
    expect(sanitizePhoneDigits('(31) 99999-8888')).toBe('31999998888');
    expect(sanitizeInstagramHandle('@sb.gestor')).toBe('sb.gestor');
    expect(sanitizeInstagramHandle('https://instagram.com/sb.gestor/')).toBe('sb.gestor');
    expect(sanitizePhoneDigits('   ') || null, 'apagar o campo tem de gravar null').toBeNull();
  });

  it('os dois ícones sem função saíram', () => {
    // Procura o BOTÃO (title="..."), não a palavra: o comentário que explica a
    // remoção cita os dois nomes, e isso não é o ícone voltando.
    expect(minhaPagina).not.toMatch(/ToggleLeft/);
    expect(minhaPagina).not.toMatch(/title="Alternar Visualização"/);
    expect(minhaPagina).not.toMatch(/title="Visualizar como Lista"/);
  });
});

describe('Chat: nenhuma mensagem automática', () => {
  const arquivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|mjs|cjs|js)$/.test(n) ? [p] : [];
    });

  it('o texto da resposta automática não existe em lugar nenhum do app', () => {
    for (const f of arquivos(path.join(RAIZ, 'src'))) {
      const fonte = readFileSync(f, 'utf8');
      expect(fonte, path.relative(RAIZ, f)).not.toMatch(/resposta automática do SB GESTOR/i);
      expect(fonte, path.relative(RAIZ, f)).not.toMatch(/responderá em breve/i);
    }
  });

  it('o chat não envia nada em nome da parceira', () => {
    const chat = ler('src/app/(dashboard)/chat/page.tsx');
    expect(chat).not.toMatch(/sendChatMessage\(\s*activeContact/);
    expect(chat).not.toMatch(/setTimeout/);
  });
});
