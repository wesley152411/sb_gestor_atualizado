'use client';

import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores/notification-store';
import { rotaDaVitrine } from '@/lib/vitrine';

// Compartilhar a vitrine pública, na Minha Página. Só o ícone, como pedido — o
// nome do botão vem do aria-label e do title. No celular abre a folha de
// compartilhar do sistema (WhatsApp, Instagram…); onde ela não existe, copia o link.
export function CompartilharVitrine({ decoradoraId, nome }: { decoradoraId: string; nome: string }) {
  const { addNotification } = useNotificationStore();

  const compartilhar = async () => {
    const url = `${window.location.origin}${rotaDaVitrine(decoradoraId)}`;

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: nome, url });
        return;
      } catch (erro) {
        // Fechou a folha sem escolher: não é erro, não avisa nada.
        if (erro instanceof DOMException && erro.name === 'AbortError') return;
        // Qualquer outra falha cai na cópia do link.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      addNotification('Link copiado', 'Envie para quem quiser ver suas peças e kits.');
    } catch {
      addNotification('Não foi possível copiar', url, true);
    }
  };

  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={compartilhar}
      aria-label="Compartilhar minha página"
      title="Compartilhar minha página"
    >
      <Share2 className="w-4 h-4" aria-hidden="true" />
    </Button>
  );
}
