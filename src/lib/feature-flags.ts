// Flags de funcionalidade centralizadas — NÃO espalhar `process.env` pelos
// componentes. Um único ponto de verdade por flag, usado no cliente e no servidor.

// Reativação promocional por WhatsApp: ativa em desenvolvimento; em produção
// fica desligada (botão "Em breve") até ligarem NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP.
// Ligar = definir a variável como 'true' na Netlify. Desligar explícito = 'false'.
export const promoWhatsappEnabled =
  process.env.NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP === 'true' ||
  (process.env.NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP !== 'false' &&
    process.env.NODE_ENV === 'development');

// Texto do aviso "Em breve" (flag desligada).
export const PROMO_COMING_SOON =
  'Em breve! Estamos preparando o envio de mensagens promocionais direto pelo sistema. Aguarde a próxima atualização.';

// Rate limiting das rotas públicas (proxy). Flag no padrão da promo, MAS com uma
// diferença deliberada: default DESLIGADO — NÃO liga sozinho em desenvolvimento.
// (Se ligasse em dev como a promo, o harness e o dev local seriam limitados sem
// querer, com as credenciais Upstash presentes.) Ligar = 'true' na Netlify.
export const rateLimitEnabled = process.env.NEXT_PUBLIC_RATE_LIMIT_ENABLED === 'true';

// Sub-modo do rollout — só vale quando rateLimitEnabled. RATE_LIMIT_MODE=observe
// loga o IP, a latência do Redis e a decisão QUE TOMARIA, mas NUNCA bloqueia. Use
// no 1º deploy para confirmar o header do IP real e a latência antes de bloquear.
// Qualquer outro valor (ou ausente) = enforce (bloqueia de verdade).
export const rateLimitObserveOnly = (process.env.RATE_LIMIT_MODE || '').toLowerCase() === 'observe';
