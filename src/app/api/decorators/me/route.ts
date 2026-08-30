import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidCnpj, sanitizeCnpjDigits } from '@/lib/utils';

// Perfil COMPLETO da decoradora logada — identidade pela sessão do servidor.
// É por aqui que Configurações e Minha Página leem/gravam os campos privados
// (whatsapp, instagram, about, etc.), sem expô-los na listagem geral.

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  // E-mail NÃO confirmado: não lê e, no POST, NÃO cria o perfil preguiçoso.
  if (!user.email_confirmed_at && !user.confirmed_at) {
    return NextResponse.json({ error: 'E-mail não confirmado' }, { status: 403 });
  }

  const decorator = await prisma.decorator.findUnique({ where: { id: user.id } });
  if (!decorator) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
  return NextResponse.json(decorator);
}

// Upsert do PRÓPRIO perfil. Também cobre a criação preguiçosa no primeiro login
// (o perfil é semeado a partir do metadata do cadastro), então não dependemos de
// criar a linha no signup (que pode não ter sessão com confirmação por e-mail).
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  // E-mail NÃO confirmado: não lê e, no POST, NÃO cria o perfil preguiçoso.
  if (!user.email_confirmed_at && !user.confirmed_at) {
    return NextResponse.json({ error: 'E-mail não confirmado' }, { status: 403 });
  }

  const id = user.id;
  const meta = (user.user_metadata || {}) as Record<string, string>;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const existing = await prisma.decorator.findUnique({ where: { id } });

  // Campos EDITÁVEIS pelo dono. Stats (reach/contact_rate/positive_reviews) e
  // membership_level não são setáveis pelo cliente — preservados.
  const pick = <T,>(key: string, fallback: T): T =>
    (body[key] !== undefined ? (body[key] as T) : ((existing as Record<string, unknown>)?.[key] as T) ?? fallback);

  // CNPJ: normaliza para 14 dígitos e valida NO SERVIDOR (vira dado fiscal — a
  // trava não pode viver só no cliente). Vazio é permitido: contas antigas
  // preenchem depois pelas Configurações; novas já vêm validadas do cadastro.
  const rawCnpj = body.cnpj !== undefined ? body.cnpj : (existing?.cnpj ?? meta.cnpj ?? null);
  const cnpj = rawCnpj ? sanitizeCnpjDigits(String(rawCnpj)) : null;
  if (cnpj && !isValidCnpj(cnpj)) {
    return NextResponse.json({ error: 'CNPJ inválido, verifique os números.' }, { status: 400 });
  }

  const data = {
    cnpj,
    company_name: pick<string | null>('company_name', meta.company_name || null),
    name: pick<string>('name', meta.company_name || meta.name || 'Decoradora'),
    location: pick<string>('location', meta.location || ''),
    avatar_url: pick<string>('avatar_url', ''),
    logo_url: pick<string | null>('logo_url', null),
    phone: pick<string | null>('phone', null),
    whatsapp: pick<string | null>('whatsapp', null),
    instagram: pick<string | null>('instagram', null),
    about: pick<string | null>('about', null),
    cover_url: pick<string | null>('cover_url', null),
    promo_message_template: pick<string | null>('promo_message_template', null),
    membership_level: existing?.membership_level ?? 'Membro',
  };

  const saved = await prisma.decorator.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
  return NextResponse.json(saved);
}
