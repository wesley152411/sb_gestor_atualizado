import { NextResponse } from 'next/server';
import { getSessionDecoratorId } from '@/lib/supabase/server';

// DIAGNÓSTICO (temporário): devolve APENAS o id derivado da sessão no servidor.
// Serve para comparar "quem a sessão diz que você é" com o que a tela mostra.
// Remover depois de validado o isolamento.
export async function GET() {
  const decoratorId = await getSessionDecoratorId();
  return NextResponse.json({ decoratorId, authenticated: !!decoratorId });
}
