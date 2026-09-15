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

// CAPTCHA (Cloudflare Turnstile) no login/signup/recuperação. Site key é pública
// (front). captchaEnabled só é true com a flag ON *E* a site key presente — assim
// uma flag ligada sem a chave NÃO quebra o login (fail-safe: sem chave, sem captcha).
// Ordem de rollout crítica documentada em docs/features/captcha-turnstile.md.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
export const captchaEnabled =
  process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true' && TURNSTILE_SITE_KEY.length > 0;

// Marketplace OCULTO. Com 'true', o Marketplace some do menu, do cabeçalho e das
// rotas para todas as contas, menos as internas (is_internal — hoje, a Mosaico).
// Default DESLIGADO em todo ambiente, inclusive dev — como o rate limit, e NÃO
// como a promo: o harness da CI exercita o Marketplace com contas comuns em
// `npm run dev`, e quebraria se ele sumisse sozinho. Ligar = 'true' na Netlify.
// Quem decide o acesso é src/lib/marketplace-acesso.ts (tela) e
// src/lib/marketplace-servidor.ts (rotas) — não compare esta flag solta.
export const marketplaceOculto = process.env.NEXT_PUBLIC_FEATURE_OCULTAR_MARKETPLACE === 'true';

// Vitrine pública (Minha Página → compartilhar): link sem login com as peças e
// kits publicados com valor. Padrão da promo: ligada em dev, desligada em
// produção até definirem NEXT_PUBLIC_FEATURE_VITRINE_PUBLICA='true' na Netlify.
export const vitrinePublica =
  process.env.NEXT_PUBLIC_FEATURE_VITRINE_PUBLICA === 'true' ||
  (process.env.NEXT_PUBLIC_FEATURE_VITRINE_PUBLICA !== 'false' &&
    process.env.NODE_ENV === 'development');
