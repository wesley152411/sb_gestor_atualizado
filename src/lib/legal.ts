import 'server-only';

import { prisma } from '@/lib/prisma';
import { getCurrentLegalDocuments, type LegalDocumentKey } from '@/lib/legal-documents';
import { resolveClientIp } from '@/lib/rate-limit';

export type LegalAccess = { accepted: true } | { accepted: false; reason: 'missing' | 'outdated' };

// Cache SÓ do resultado POSITIVO, por processo. O gate roda em toda chamada de
// /api/*, e sem isto seria uma consulta ao banco por requisição.
// Por que só o positivo é seguro: um aceite da versão atual não volta atrás dentro
// do mesmo deploy — a tabela é imutável (sem UPDATE/DELETE) e um bump de versão
// exige novo deploy, ou seja, processo novo e cache vazio. Cachear o NEGATIVO,
// esse sim, deixaria a decoradora presa no gate depois de aceitar (o POST do
// aceite pode cair em outra instância, sem como invalidar).
const aceitesConfirmados = new Set<string>();

export async function currentLegalAccess(decoratorId: string): Promise<LegalAccess> {
  if (aceitesConfirmados.has(decoratorId)) return { accepted: true };
  const documents = getCurrentLegalDocuments();
  const rows = await prisma.legalAcceptance.findMany({
    where: { decorator_id: decoratorId },
    select: { document: true, version: true, content_hash: true },
  });
  const current = documents.every((document) => rows.some((row) =>
    row.document === document.key && row.version === document.version && row.content_hash === document.contentHash
  ));
  if (current) {
    aceitesConfirmados.add(decoratorId);
    return { accepted: true };
  }
  return { accepted: false, reason: rows.length ? 'outdated' : 'missing' };
}

function hasSignupConsent(metadata: Record<string, unknown>) {
  const versions = Object.fromEntries(getCurrentLegalDocuments().map((document) => [document.key, document.version]));
  return metadata.privacy_version === versions.privacy &&
    metadata.terms_version === versions.terms &&
    typeof metadata.legal_consent_at === 'string';
}

// O aceite tem FK para decorators. Existem logins em auth.users SEM linha de
// perfil (cadastro antigo que nunca chegou a criar o perfil preguicoso). Se o
// gate aparecesse para uma dessas contas, o INSERT do aceite quebraria na FK e a
// decoradora ficaria presa: a unica saida da tela e aceitar, e aceitar falha.
// Depender do cliente ter chamado /api/decorators/me antes NAO basta — aquela
// chamada tem timeout e pode falhar. Entao o proprio caminho legal semeia a linha.
export async function ensureDecoratorProfile(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const meta = (user.user_metadata || {}) as Record<string, string>;
  await prisma.decorator.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      // Mesmo fallback de /api/decorators/me: nome nunca fica vazio.
      name: meta.company_name || meta.name || 'Decoradora',
      company_name: meta.company_name || null,
      location: meta.location || '',
    },
  });
}

export async function recordCurrentLegalAcceptance(
  decoratorId: string,
  headers: Headers,
  context: 'signup' | 'retroactive' | 'reaccept',
) {
  const documents = getCurrentLegalDocuments();
  const { ip } = resolveClientIp(headers);
  const userAgent = headers.get('user-agent') || null;
  const existing = await prisma.legalAcceptance.findMany({
    where: { decorator_id: decoratorId },
    select: { document: true, version: true, content_hash: true },
  });
  const missing = documents.filter((document) => !existing.some((row) =>
    row.document === document.key && row.version === document.version && row.content_hash === document.contentHash
  ));
  if (missing.length) {
    await prisma.legalAcceptance.createMany({
      data: missing.map((document) => ({
        decorator_id: decoratorId,
        document: document.key,
        version: document.version,
        content_hash: document.contentHash,
        ip,
        user_agent: userAgent,
        context,
      })),
    });
  }
  return currentLegalAccess(decoratorId);
}

export async function materializeSignupLegalAcceptance(
  decoratorId: string,
  metadata: Record<string, unknown>,
  headers: Headers,
) {
  if (!hasSignupConsent(metadata)) return currentLegalAccess(decoratorId);
  return recordCurrentLegalAcceptance(decoratorId, headers, 'signup');
}

export async function legalContextForAcceptance(decoratorId: string): Promise<'retroactive' | 'reaccept'> {
  const existing = await prisma.legalAcceptance.count({ where: { decorator_id: decoratorId } });
  return existing ? 'reaccept' : 'retroactive';
}

export const legalDocumentKeys: LegalDocumentKey[] = ['privacy', 'terms'];
