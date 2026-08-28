# CAPTCHA no login (Cloudflare Turnstile)

Protege o login/cadastro/recuperação contra brute-force e bots. Necessário porque
o Supabase limita o endpoint de login (`/token`) a **1800/hora por IP e isso NÃO é
ajustável** — o CAPTCHA é o único freio real de força bruta ali. Provedor:
**Cloudflare Turnstile**, modo **managed** (a maioria das pessoas não vê desafio).

## ⚠️ Ordem de operação — NÃO INVERTER (quebra o login de todo mundo)

O CAPTCHA do Supabase é **project-wide**: quando ligado, TODO sign-in/sign-up/
recover passa a **exigir** um token válido. Se o Supabase for ligado antes de o
cliente estar mandando token, o login quebra para todos. A sequência abaixo tem uma
rede de segurança (passo 3) justamente para isso.

1. **Cloudflare** — criar o widget e pegar as chaves.
   - `dash.cloudflare.com → Turnstile → Add widget`.
   - Hostnames: `sbgestor.com` (e `localhost` se for testar local).
   - **Widget Mode: Managed**. Create.
   - Em **Turnstile → seu widget → Settings**:
     - **Site Key** (pública) → front.
     - **Secret Key** (privada) → só no Supabase (passo 4). NUNCA no front nem no repo.

2. **Cliente (já implementado, atrás da flag OFF)** — deploy + configurar a Site Key.
   - Na Netlify: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>`.
   - Flag ainda OFF → **nada muda**, login segue igual.

3. **Ligar a FLAG e VERIFICAR no navegador (a rede de segurança).**
   - Na Netlify: `NEXT_PUBLIC_CAPTCHA_ENABLED=true` + **redeploy** (é `NEXT_PUBLIC`,
     inline no build — precisa de redeploy).
   - Agora o widget aparece e o cliente **manda o token**, mas o Supabase **ainda
     ignora** (não ligado) → login funciona normalmente.
   - **Confirme no navegador**: widget aparece em login/signup/recuperação e os três
     fluxos funcionam. Se o widget NÃO aparecer, a Site Key não chegou — corrija
     antes de seguir (a flag só ativa com a chave presente; sem chave, fail-safe = OFF).

4. **Só então: ligar no Supabase.**
   - `Auth → Settings → Bot and Abuse Protection → Enable CAPTCHA` → Turnstile →
     colar a **Secret Key** → salvar.
   - Agora o token é exigido e validado. Login continua funcionando porque o cliente
     já manda token (confirmado no passo 3).

### O que verificar no passo 4 (recomendado)
- **Duas abas:** uma **logada** (confirmar que a sessão NÃO cai — o refresh de token
  não exige captcha) e uma **anônima** na tela de login (logar na hora, com widget).
- **Signup** e **recuperação de senha** — o widget é project-wide, os três precisam.
- **Erro de captcha** claro: se a verificação falhar, a mensagem é "Verificação de
  segurança falhou. Recarregue a página e tente novamente." — não o erro genérico.
- **Segunda tentativa** de login seguido (o widget reseta a cada envio; token é de
  uso único — sem reset, a 2ª falharia com "token já usado").
- **Mobile** (o managed pode desafiar mais em rede/navegador incomum).

### Superfícies cobertas (todas as que chamam endpoints protegidos pelo captcha)
Além das 3 telas de auth, as duas superfícies internas que também disparam e-mail/
recover **ganharam widget** (senão quebrariam sob CAPTCHA ligado):
- **Reenviar confirmação** (`EmailConfirmationGate`, conta não confirmada) — é onde
  para quem não recebeu o e-mail; agora tem widget antes do reenvio.
- **Redefinir senha pelas Configurações** — o antigo `prompt()` virou um **modal**
  com campo de e-mail + widget.
Ainda vale testar as duas no passo 4, mas já estão implementadas.

## Rollback
- **Instantâneo:** desligar o CAPTCHA no painel do Supabase restaura o login na hora.
- A flag `NEXT_PUBLIC_CAPTCHA_ENABLED=false` (+ redeploy) tira o widget do cliente.

## Ninguém logado é deslogado
O CAPTCHA só atinge requisições **novas** de auth (sign-in/sign-up/recover). Quem
está logado mantém a sessão via **refresh de token**, que **não** exige captcha —
nenhuma sessão é invalidada. A pessoa só vê o widget ao deslogar e logar de novo.

## Feature flag e chaves
- `NEXT_PUBLIC_CAPTCHA_ENABLED` — `'true'` liga; qualquer outro valor/ausente = OFF.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — site key pública.
- `captchaEnabled` (em `src/lib/feature-flags.ts`) só é `true` com a flag ON **e** a
  site key presente — fail-safe: flag ligada sem chave NÃO quebra o login.
- Secret key: só no Supabase, nunca no repo.

## Harness / projeto de teste
O CAPTCHA fica **OFF no projeto de teste** por enquanto. Com ele off, o
`signInWithPassword` do harness (e o `rls-auth-test`) seguem funcionando sem token.
Se um dia ligar no teste, o harness precisará das **chaves de teste** do Turnstile
(sempre-passa) e mandar um token dummy — ou o login programático quebra.

## Onde está no código
- `src/components/auth/CaptchaWidget.tsx` — widget (managed), some quando a flag/chave faltam.
- `src/services/api.ts` — `signUp` / `signIn` / `resetPassword` recebem `captchaToken`;
  `mapAuthError` traduz erro de captcha.
- `src/app/(auth)/{login,signup,forgot-password}/page.tsx` — widget + reset por tentativa.
