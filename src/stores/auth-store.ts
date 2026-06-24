import { create } from 'zustand';
import type { Decorator } from '@/types';

interface AuthState {
  decorator: Decorator | null;
  isLoading: boolean;
  setDecorator: (decorator: Decorator | null) => void;
  updateDecorator: (partial: Partial<Decorator>) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  decorator: null,
  isLoading: true,
  setDecorator: (decorator) => set({ decorator, isLoading: false }),
  updateDecorator: (partial) =>
    set((state) => ({
      decorator: state.decorator ? { ...state.decorator, ...partial } : null,
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
