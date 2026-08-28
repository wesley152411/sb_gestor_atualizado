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

// Rate limiting das rotas públicas (proxy). Server-only (NÃO NEXT_PUBLIC): o proxy
// roda no servidor e não precisa disto no bundle do cliente. Três estados, via
// RATE_LIMIT_MODE, para permitir o rollout em fases:
//   off     (default) — proxy não faz nada; nenhuma requisição é tocada.
//   observe — loga o IP e a decisão QUE TOMARIA, mas NUNCA bloqueia (429). Use
//             primeiro para confirmar qual header traz o IP real na Netlify.
//   enforce — bloqueia de verdade (429 + Retry-After).
// Assim dá para subir em 'observe', conferir o log do IP e só então 'enforce'.
export type RateLimitMode = 'off' | 'observe' | 'enforce';
export const rateLimitMode: RateLimitMode = (() => {
  const v = (process.env.RATE_LIMIT_MODE || '').toLowerCase();
  return v === 'observe' || v === 'enforce' ? v : 'off';
})();
