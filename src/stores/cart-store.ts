import { create } from 'zustand';
import type { CartItem, InventoryItem } from '@/types';

interface CartState {
  items: CartItem[];
  addItem: (item: InventoryItem) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clear: () => void;
  totalItems: () => number;
  totalPrice: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      const existing = state.items.findIndex((c) => c.item.id === item.id);
      if (existing !== -1) {
        if (state.items[existing].quantity >= item.stock_quantity) return state;
        const updated = [...state.items];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return { items: updated };
      }
      return { items: [...state.items, { item, quantity: 1 }] };
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
  totalItems: () => get().items.reduce((sum, c) => sum + c.quantity, 0),
  totalPrice: () => get().items.reduce((sum, c) => sum + c.item.rental_price * c.quantity, 0),
}));
