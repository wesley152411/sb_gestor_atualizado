'use client';

import { forwardRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { captchaEnabled, TURNSTILE_SITE_KEY } from '@/lib/feature-flags';

interface Props {
  // Recebe o token quando o Turnstile resolve (managed: normalmente sem interação).
  onToken: (token: string) => void;
  // Token expirou/erro: limpa o token no formulário (força nova resolução).
  onExpire?: () => void;
}

// Widget do Cloudflare Turnstile (modo definido no painel: managed). Só renderiza
// com a flag ON e a site key presente; caso contrário não desenha nada e o
// formulário segue sem captcha (fail-safe). O modo (managed/invisible) vem da
// configuração da site key no Cloudflare, não daqui.
//
// A página deve segurar um ref e chamar `.reset()` a CADA tentativa — o token do
// Turnstile é de uso único; sem reset, a 2ª tentativa falha com "token já usado".
export const CaptchaWidget = forwardRef<TurnstileInstance | undefined, Props>(
  function CaptchaWidget({ onToken, onExpire }, ref) {
    if (!captchaEnabled) return null;
    return (
      <div style={{ marginBottom: 16, minHeight: 65 }}>
        <Turnstile
          ref={ref}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={onToken}
          onExpire={() => onExpire?.()}
          onError={() => onExpire?.()}
        />
      </div>
    );
  }
);
