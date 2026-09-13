import { PrismaClient } from '@prisma/client';
import { ajustarUrlDoBanco } from '@/lib/db-url';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// A URL passa pelo ajuste ANTES do cliente existir. Na porta 6543 (pooler de
// transação do Supabase) o `pgbouncer=true` é obrigatório; sem ele, TODA rota que
// lê o banco cai com "prepared statement already exists". Ver src/lib/db-url.ts.
//
// Só sobrescreve a URL quando precisou corrigir: configuração certa segue o
// caminho de sempre, com o Prisma lendo o env sozinho.
const ajuste = ajustarUrlDoBanco(process.env.DATABASE_URL);
if (ajuste.ajustada) {
  // Etiqueta buscável no log da Netlify. O motivo não carrega senha nem usuário.
  console.warn(`[DB-URL] ${ajuste.motivo}`);
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(ajuste.ajustada ? { datasources: { db: { url: ajuste.url } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
