// ==================== FORMATAÇÃO ====================

export function formatCurrency(value: number | string): string {
  // Campos Decimal do Prisma chegam como string via API (ex: "35.00"); Number()
  // normaliza antes de formatar, já que string.toLocaleString ignora as opções de moeda.
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Preço de item para EXIBIÇÃO: mostra "A definir" quando o preço ainda não foi
// informado (zero/vazio), para não exibir "R$ 0,00" como se fosse o valor real
// da locação. Use em cards e vitrines; NÃO em cálculos/subtotais.
export function formatPriceLabel(value: number | string | null | undefined): string {
  return hasPrice(value) ? formatCurrency(Number(value)) : 'A definir';
}

// Regra de negócio: um valor de locação/kit só é "definido" se for um número
// MAIOR que zero. IMPORTANTE: campos Decimal do Prisma chegam como STRING via API
// (ex.: "0.00"); por isso NUNCA use `!value` ou `value === 0` — "0.00" é truthy e
// != 0. Sempre passe por esta checagem, no front e no back.
// Aceita unknown de propósito: além de number/string, recebe Prisma.Decimal
// (objeto) vindo direto do banco nas rotas de API. Number() coage os três.
export function hasPrice(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return !Number.isNaN(n) && n > 0;
}

// ==================== CONTATO (WhatsApp / Instagram) ====================

// Só dígitos (remove máscara, espaços, +, traços).
export function sanitizePhoneDigits(raw?: string | null): string {
  return (raw || '').replace(/\D/g, '');
}

// Handle do Instagram SEM @, sem URL, sem espaços — forma de armazenamento.
export function sanitizeInstagramHandle(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .replace(/\/+$/, '')
    .replace(/\s+/g, '');
}

// Link clicável do WhatsApp (https://wa.me/<digitos>). Se vier número BR local
// (10–11 dígitos, DDD+numero) sem DDI, prefixa 55. Vazio => '' (linha omitida).
export function whatsappUrl(raw?: string | null): string {
  let d = sanitizePhoneDigits(raw);
  if (!d) return '';
  if (d.length <= 11 && !d.startsWith('55')) d = `55${d}`;
  return `https://wa.me/${d}`;
}

// Link clicável do perfil no Instagram, aceitando salvo com ou sem @.
export function instagramUrl(raw?: string | null): string {
  const h = sanitizeInstagramHandle(raw);
  return h ? `https://instagram.com/${h}` : '';
}

// ==================== MENSAGEM PROMOCIONAL (WhatsApp) ====================

// Telefone VÁLIDO para o disparo promocional: após normalização, a parte local
// (sem DDI) tem 10 ou 11 dígitos. Cobre registros antigos sem telefone.
export function isValidPromoPhone(raw?: string | null): boolean {
  const d = sanitizePhoneDigits(raw);
  if (!d) return false;
  const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  return local.length === 10 || local.length === 11;
}

// Máscara progressiva BR: (DD) XXXX-XXXX (10) ou (DD) XXXXX-XXXX (11). Aceita
// qualquer entrada (extrai dígitos), trata colagem de número já formatado.
export function formatPhoneMask(raw?: string | null): string {
  const d = sanitizePhoneDigits(raw).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  // Ponto de quebra do traço: 4 dígitos finais (celular 11 dígitos → 5+4).
  const cut = rest.length <= 8 ? 4 : 5;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

// Validação do formulário/modal: DDD obrigatório (2 dígitos, 11–99) e total de
// 10 ou 11 dígitos. SEM DDI aqui (a normalização com 55 acontece só no link).
export function isValidBrPhone(raw?: string | null): boolean {
  const d = sanitizePhoneDigits(raw);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

// Monta o link wa.me com a mensagem já codificada. Acrescenta 55 se não houver DDI.
export function promoWhatsappUrl(rawPhone: string | null | undefined, message: string): string {
  let d = sanitizePhoneDigits(rawPhone);
  if (d.length <= 11 && !d.startsWith('55')) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(message)}`;
}

// Template promocional padrão, já com o nome da empresa preenchido. A ÚNICA
// variável do template é {nome} (nome da cliente), trocada na hora de montar o link.
export function defaultPromoTemplate(empresa: string): string {
  const nomeEmpresa = (empresa || 'nossa equipe').trim();
  return `Oi, {nome}! Aqui é a ${nomeEmpresa}. Foi um prazer decorar sua festa 💐 Estamos com condições especiais esse mês — se estiver planejando alguma comemoração, fala com a gente!`;
}

// Substitui {nome} pela cliente. Não altera o template salvo.
export function fillPromoTemplate(template: string, nomeCliente: string): string {
  return (template || '').replace(/\{nome\}/g, (nomeCliente || '').trim() || 'você');
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(datePart + 'T00:00:00').toLocaleDateString('pt-BR');
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ==================== BANCO DE DADOS ====================

// Normaliza uma data 'YYYY-MM-DD' (vinda de <input type="date">) para um Date
// UTC meia-noite, formato exigido pelo Prisma para colunas @db.Date.
export function toDbDate(dateStr?: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  return new Date(`${datePart}T00:00:00.000Z`);
}

// ==================== MÁSCARAS ====================

export function cnpjMask(value: string): string {
  const digits = value.replace(/\D/g, '');
  const match = digits.match(/(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})/);
  if (!match) return value;
  return !match[2]
    ? match[1]
    : match[1] + '.' + match[2] + (match[3] ? '.' + match[3] : '') + (match[4] ? '/' + match[4] : '') + (match[5] ? '-' + match[5] : '');
}

// Só os 14 dígitos do CNPJ (forma normalizada de armazenamento).
export function sanitizeCnpjDigits(value?: string | null): string {
  return String(value || '').replace(/\D/g, '').slice(0, 14);
}

// Validação LOCAL do CNPJ pelo dígito verificador — pega erro de digitação sem
// depender de serviço externo. Rejeita também as sequências repetidas
// (00000000000000, 11111111111111…), que passam no cálculo mas não são reais.
export function isValidCnpj(value?: string | null): boolean {
  const c = sanitizeCnpjDigits(value);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string): number => {
    let pos = base.length - 7;
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (dv(c.slice(0, 12)) !== Number(c[12])) return false;
  if (dv(c.slice(0, 13)) !== Number(c[13])) return false;
  return true;
}

export function phoneMask(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

// ==================== SENHA ====================

export type PasswordStrength = 'none' | 'weak' | 'medium' | 'strong';

export function checkPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'none';
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
  if (password.length >= 10 && /[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return 'weak';
  if (score === 2) return 'medium';
  return 'strong';
}

// ==================== VALIDAÇÃO DE E-MAIL ====================

// Formato prático (não RFC completo): um @, sem espaços, domínio com ponto e TLD
// de 2+ letras. Barra lixo óbvio ("foo", "foo@bar"). NÃO valida se o e-mail
// existe — isso só a confirmação por e-mail resolve (ver captcha-turnstile.md e a
// limpeza de não confirmadas).
export function isValidEmailFormat(email?: string | null): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || '').trim());
}

// Domínios de e-mail descartável/temporário conhecidos. Lista NÃO exaustiva (há
// milhares) — cobre os mais comuns. Bloqueia cadastro de lixo em série que
// consome o limite de e-mail do Supabase.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'tempmailo.com',
  'yopmail.com', 'throwawaymail.com', 'getnada.com', 'nada.email', 'trashmail.com',
  'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mailnesia.com', 'mintemail.com',
  'emailondeck.com', 'moakt.com', '33mail.com', 'mailcatch.com', 'spam4.me',
  'tempr.email', 'discard.email', 'mailexpire.com', '1secmail.com', '1secmail.org',
  '1secmail.net', 'inboxbear.com', 'tmail.ws', 'burnermail.io', 'mohmal.com',
]);

export function isDisposableEmailDomain(email?: string | null): boolean {
  const clean = (email || '').trim().toLowerCase();
  const at = clean.lastIndexOf('@');
  if (at < 0) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(clean.slice(at + 1));
}

// ==================== PLACEHOLDER DE IMAGEM ====================

export function getPlaceholderImage(name: string): string {
  const cleanName = name.toLowerCase();
  if (cleanName.includes('cadeira') || cleanName.includes('poltrona') || cleanName.includes('sofá')) {
    return 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=400&q=80';
  }
  if (cleanName.includes('mesa') || cleanName.includes('aparador') || cleanName.includes('banco')) {
    return 'https://images.unsplash.com/photo-1530018607912-eff2df114fbe?w=400&q=80';
  }
  if (cleanName.includes('vaso') || cleanName.includes('murano') || cleanName.includes('arranjo')) {
    return 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?w=400&q=80';
  }
  if (cleanName.includes('lustre') || cleanName.includes('luz') || cleanName.includes('iluminação')) {
    return 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80';
  }
  return 'https://images.unsplash.com/photo-1513151233558-d860c5398176?w=400&q=80';
}

// Iniciais para o placeholder de avatar (mesmo resultado em todas as telas:
// sidebar, configurações e Minha Página). Sem foto => mostramos estas iniciais.
export function getInitials(name?: string): string {
  if (!name) return 'SB';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SB';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ==================== MISC ====================

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
