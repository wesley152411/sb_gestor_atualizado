'use client';

import { useEffect, useState } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface ToastMessage {
  id: number;
  title: string;
  message: string;
  isAlert: boolean;
}

export function ToastProvider() {
  const { notifications } = useNotificationStore();
  const [visibleToasts, setVisibleToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      // Evita duplicar toast já visível
      if (!visibleToasts.find(t => t.id === latest.id)) {
        setVisibleToasts(prev => [...prev, latest]);
        // Auto-dismiss após 4 segundos
        setTimeout(() => {
          setVisibleToasts(prev => prev.filter(t => t.id !== latest.id));
        }, 4000);
      }
    }
  }, [notifications]);

  const dismissToast = (id: number) => {
    setVisibleToasts(prev => prev.filter(t => t.id !== id));
  };

  if (visibleToasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3">
      {visibleToasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 min-w-[320px] max-w-[420px] px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md animate-slide-in-right ${
            toast.isAlert
              ? 'bg-red-50/90 border-red-200 text-red-800'
              : 'bg-white/90 border-slate-200 text-slate-800'
          }`}
        >
          {toast.isAlert ? (
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{toast.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{toast.message}</p>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ))}
    </div>
  );
}
