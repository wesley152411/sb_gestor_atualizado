import { create } from 'zustand';

// Menu lateral NO CELULAR: o painel deslizante (drawer).
//
// Estado global porque as duas pontas moram em componentes diferentes: o botão
// ☰ fica no cabeçalho (Header) e o painel é a própria barra (Sidebar).
//
// No desktop isto não tem efeito: a classe `.open` só age abaixo de 1024px,
// onde a barra sai da tela. Lá em cima a barra é fixa, como sempre foi.
interface MenuState {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  alternar: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  aberto: false,
  abrir: () => set({ aberto: true }),
  fechar: () => set({ aberto: false }),
  alternar: () => set((s) => ({ aberto: !s.aberto })),
}));
