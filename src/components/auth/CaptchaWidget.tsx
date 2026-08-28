'use client';

import { forwardRef, useState } from 'react';
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
//
// Se o script do Turnstile NÃO carregar (bloqueador de anúncio/privacidade, rede
// restritiva, firewall), o `onError` mostra uma mensagem com saída — em vez de um
// botão que não responde, a pessoa entende e resolve sozinha.
export const CaptchaWidget = forwardRef<TurnstileInstance | undefined, Props>(
  function CaptchaWidget({ onToken, onExpire }, ref) {
    const [errored, setErrored] = useState(false);
    if (!captchaEnabled) return null;
    return (
      <div style={{ marginBottom: 16, minHeight: 65 }}>
        <Turnstile
          ref={ref}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => { setErrored(false); onToken(token); }}
          onExpire={() => onExpire?.()}
          onError={() => { setErrored(true); onExpire?.(); }}
        />
        {errored && (
          <p style={{
            marginTop: 8, marginBottom: 0, fontSize: 13, fontWeight: 600,
            color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: 8, padding: '8px 12px', lineHeight: 1.5,
          }}>
            A verificação de segurança não carregou. Desative bloqueadores de anúncio/
            privacidade para este site, ou tente outra rede ou navegador.
          </p>
        )}
      </div>
    );
  }
);
