import { create } from 'zustand';
import type { Notification } from '@/types';

interface NotificationState {
  notifications: Notification[];
  addNotification: (title: string, message: string, isAlert?: boolean) => void;
  markAsRead: (id: number) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [
    {
      id: 1,
      title: 'Boas-vindas ao SB GESTOR',
      message: 'Comece cadastrando suas peças e explorando o catálogo de parcerias B2B.',
      isAlert: false,
      unread: true,
      time: 'Agora',
    },
  ],
  addNotification: (title, message, isAlert = false) =>
    set((state) => ({
      notifications: [
        {
          id: Date.now(),
          title,
          message,
          isAlert,
          unread: true,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        },
        ...state.notifications,
      ],
    })),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, unread: false } : n
      ),
    })),
  clearAll: () => set({ notifications: [] }),
}));
