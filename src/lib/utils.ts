// ==================== FORMATAÇÃO ====================

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR');
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

// ==================== MÁSCARAS ====================

export function cnpjMask(value: string): string {
  const digits = value.replace(/\D/g, '');
  const match = digits.match(/(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})/);
  if (!match) return value;
  return !match[2]
    ? match[1]
    : match[1] + '.' + match[2] + (match[3] ? '.' + match[3] : '') + (match[4] ? '/' + match[4] : '') + (match[5] ? '-' + match[5] : '');
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

// ==================== MISC ====================

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
