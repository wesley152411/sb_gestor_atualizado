import { NextResponse } from 'next/server';
import { requireDecorator } from '@/lib/api-auth';
import { saudeDoJob } from '@/lib/reconciliacao';

// A faixa do dashboard lê daqui. Camada 1: quem está suspensa também precisa ver
// — e, mais importante, o operador precisa ver de qualquer estado de assinatura.
export async function GET() {
  const acesso = await requireDecorator();
  if (!acesso.ok) return acesso.response;
  return NextResponse.json(await saudeDoJob());
}
