'use client';

import { useEffect, useState } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToastProvider() {
  const { notifications, markAsRead } = useNotificationStore();
  const [toasts, setToasts] = useState<any[]>([]);

  useEffect(() => {
    // Pegar apenas os não lidos recentes (limitado aos 3 últimos)
    const unread = notifications.filter((n) => n.unread).slice(0, 3);
    setToasts(unread);

    // Auto-remover após 5 segundos
    unread.forEach((t) => {
      setTimeout(() => {
        markAsRead(t.id);
      }, 5000);
    });
  }, [notifications, markAsRead]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'toast',
            toast.isAlert ? 'toast-error' : 'toast-success' // Simple mapped styles for now
          )}
        >
          {toast.isAlert ? (
            <XCircle className="w-5 h-5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          )}
          <div className="flex-1">
            <h4 className="toast-title">{toast.title}</h4>
            <p className="toast-message">{toast.message}</p>
          </div>
          <button
            onClick={() => markAsRead(toast.id)}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
