import 'server-only';

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

export type LegalDocumentKey = 'privacy' | 'terms';

type LegalDocumentConfig = { key: LegalDocumentKey; title: string; file: string; href: string };

const DOCUMENTS: LegalDocumentConfig[] = [
  { key: 'privacy', title: 'Política de Privacidade', file: 'politica_privacidade.md', href: '/privacidade' },
  { key: 'terms', title: 'Termos de Uso', file: 'termo_de_uso.md', href: '/termos' },
];

export type LegalDocument = LegalDocumentConfig & { content: string; version: string; contentHash: string };

function repositoryDocument(file: string) {
  return readFileSync(path.join(process.cwd(), 'docs', 'politicas', file), 'utf8');
}

// O conteudo e imutavel dentro de um deploy (vem do repositorio), e o gate roda em
// TODA chamada de /api/*. Ler o arquivo e refazer o SHA-256 a cada requisicao
// seria desperdicio puro — memoiza por processo.
const cache = new Map<LegalDocumentKey, LegalDocument>();

function documentVersion(content: string, file: string) {
  const version = content.match(/^\*\*Versão:\*\*\s*([^\r\n]+)/m)?.[1]?.trim();
  if (!version) throw new Error(`Documento legal sem "Versão": ${file}`);
  return version;
}

export function getLegalDocument(key: LegalDocumentKey): LegalDocument {
  const cached = cache.get(key);
  if (cached) return cached;
  const config = DOCUMENTS.find((document) => document.key === key);
  if (!config) throw new Error(`Documento legal desconhecido: ${key}`);
  const content = repositoryDocument(config.file);
  const document: LegalDocument = {
    ...config,
    content,
    version: documentVersion(content, config.file),
    contentHash: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
  cache.set(key, document);
  return document;
}

export function getCurrentLegalDocuments() {
  return DOCUMENTS.map((document) => getLegalDocument(document.key));
}

export function getPublicLegalVersions() {
  return Object.fromEntries(getCurrentLegalDocuments().map((document) => [document.key, document.version])) as {
    privacy: string;
    terms: string;
  };
}
