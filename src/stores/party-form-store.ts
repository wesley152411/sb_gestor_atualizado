import { create } from 'zustand';
import type { InventoryItem, PartyFormItem } from '@/types';

interface PartyFormState {
  items: PartyFormItem[];
  addItem: (item: InventoryItem, qty?: number) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clear: () => void;
}

export const usePartyFormStore = create<PartyFormState>((set) => ({
  items: [],
  addItem: (item, qty = 1) =>
    set((state) => {
      const existing = state.items.findIndex((p) => p.item.id === item.id);
      if (existing !== -1) {
        const updated = [...state.items];
        updated[existing] = {
          ...updated[existing],
          quantity: updated[existing].quantity + qty,
        };
        return { items: updated };
      }
      return { items: [...state.items, { item, quantity: qty }] };
    }),
  removeItem: (index) =>
    set((state) => ({ items: state.items.filter((_, i) => i !== index) })),
  updateQuantity: (index, quantity) =>
    set((state) => {
      const updated = [...state.items];
      updated[index] = { ...updated[index], quantity };
      return { items: updated };
    }),
  clear: () => set({ items: [] }),
}));
