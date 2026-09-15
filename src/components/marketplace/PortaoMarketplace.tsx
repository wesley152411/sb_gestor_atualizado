'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { marketplaceLiberado } from '@/lib/marketplace-acesso';

// Portão das telas do Marketplace (vitrine B2B e página da parceira). Com a flag
// de ocultar ligada, só conta interna entra; as demais voltam ao Dashboard.
//
// Espera o perfil carregar antes de decidir: sem isso, a conta interna seria
// mandada embora nos instantes em que o perfil ainda não chegou.
//
// Cortesia de interface. A barreira de verdade está nas rotas da API
// (src/lib/marketplace-servidor.ts): sem ela, bastaria chamar a API direto.
export function PortaoMarketplace({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { decorator } = useAuthStore();
  const liberado = marketplaceLiberado(decorator);
  const recusado = !!decorator && !liberado;

  useEffect(() => {
    if (recusado) router.replace('/analytics');
  }, [recusado, router]);

  if (!liberado) return null;
  return <>{children}</>;
}
