import { create } from 'zustand';
import type { Notification } from '@/types';

interface NotificationState {
  notifications: Notification[];
  addNotification: (title: string, message: string, isAlert?: boolean) => void;
  markAsRead: (id: number) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  // Sem notificação semeada: o toast de boas-vindas vinha daqui e, como o store
  // reinicia a cada carregamento de página, reaparecia toda vez (ruído). Os
  // demais toasts continuam normais via addNotification.
  notifications: [],
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
