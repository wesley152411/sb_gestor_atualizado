import { marketplaceOculto } from '@/lib/feature-flags';

// Quem usa o Marketplace. Com a flag de ocultar DESLIGADA, todo mundo, como
// sempre foi. LIGADA, só contas internas (is_internal — hoje, a Mosaico). Sem o
// perfil carregado, a resposta é "não" enquanto a flag estiver ligada.
//
// Isto decide a INTERFACE: menu, cabeçalho e as telas do Marketplace. A barreira
// que vale de verdade está nas rotas, em src/lib/marketplace-servidor.ts.
export function marketplaceLiberado(conta?: { is_internal?: boolean | null } | null): boolean {
  return !marketplaceOculto || conta?.is_internal === true;
}
