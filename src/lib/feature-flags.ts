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
