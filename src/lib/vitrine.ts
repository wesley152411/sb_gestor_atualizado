// Vitrine pública da decoradora: tipos e caminhos compartilhados entre a rota
// /api/public/vitrine/[id] e as telas /vitrine/[id] (grade e detalhe).

export type TipoItemVitrine = 'peca' | 'kit';

export interface ItemVitrine {
  tipo: TipoItemVitrine;
  id: string;
  nome: string;
  descricao: string;
  imagem: string;
  preco: number;
  /** Só em kit: o que vem dentro. */
  pecas: { nome: string; quantidade: number }[];
}

export interface Vitrine {
  nome: string;
  avatar: string;
  /** Foto de capa da Minha Página — fundo do topo da vitrine. */
  capa: string;
  local: string;
  /** Texto "Sobre" da Minha Página. */
  sobre: string;
  itens: ItemVitrine[];
}

export const rotaDaVitrine = (decoradoraId: string) => `/vitrine/${encodeURIComponent(decoradoraId)}`;

export const rotaDoItem = (decoradoraId: string, item: Pick<ItemVitrine, 'tipo' | 'id'>) =>
  `${rotaDaVitrine(decoradoraId)}/${item.tipo}/${encodeURIComponent(item.id)}`;

/** Busca a vitrine. null = não existe, ou a funcionalidade está desligada. */
export async function carregarVitrine(decoradoraId: string): Promise<Vitrine | null> {
  const res = await fetch(`/api/public/vitrine/${encodeURIComponent(decoradoraId)}`);
  if (!res.ok) return null;
  return res.json();
}
