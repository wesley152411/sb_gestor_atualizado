# Reativação promocional por WhatsApp

Permite à decoradora reativar clientes antigas mandando uma mensagem promocional
pelo WhatsApp, direto da aba **Clientes**. Elegível quando `event_date + 1 mês <
hoje`. Cada clique em "Enviar" registra uma linha em `client_promo_messages`
(rótulo "aberto", não "enviado" — o sistema só sabe que o link foi montado/aberto).

## Feature flag

`NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP` (ver `src/lib/feature-flags.ts`):

- **Ligada** (`'true'`) → funcionalidade ativa.
- **Desligada** (`'false'`) → botão "Em breve"; a rota `/api/promo-messages`
  responde **404** (a guarda de flag roda no servidor, antes da checagem de sessão).
- **Ausente** → ligada só em desenvolvimento (`NODE_ENV === 'development'`), desligada
  em produção.

Em produção a flag está **desligada**.

## Backend / isolamento

- `POST/GET /api/promo-messages` — `decorator_id` SEMPRE vem da sessão do servidor
  (`getSessionDecoratorId()`), nunca do corpo. O POST verifica que o `clientId`
  pertence à decoradora logada (senão 403). Sem sessão / e-mail não confirmado → 401.
- Tabela `client_promo_messages` com RLS ligado + policy `client_promo_messages_own`
  (`decorator_id = auth.uid()::text`) — defesa em profundidade no caminho PostgREST.
- Provas:
  - **Isolamento da aplicação** — `tests/isolation.test.ts`, bloco "reativação
    promocional" (sessão, posse do cliente, corpo forjado ignorado, GET isolado, e
    404 com a flag off). CI: job `isolation` (flag on) + `promo-flag-off` (flag off).
  - **Policy RLS** — `docs/security/rls-auth-test.mjs` (11ª tabela; token de B não lê
    linhas de A pelo PostgREST).

## DDL (migração `supabase/migrations/20260824000100_client_promo_messages.sql`)

Aditiva e idempotente. **Ainda NÃO aplicada em produção** (aguardando revisão/OK).

```sql
ALTER TABLE public.decorators ADD COLUMN IF NOT EXISTS promo_message_template text;

CREATE TABLE IF NOT EXISTS public.client_promo_messages (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id    text NOT NULL REFERENCES public.clients(id)    ON DELETE CASCADE,
  decorator_id text NOT NULL REFERENCES public.decorators(id) ON DELETE CASCADE,
  sent_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  phone        text NOT NULL,
  message      text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_decorator_sent ON public.client_promo_messages (decorator_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_client         ON public.client_promo_messages (client_id);

ALTER TABLE public.client_promo_messages ENABLE ROW LEVEL SECURITY;  -- sem FORCE
DROP POLICY IF EXISTS client_promo_messages_own ON public.client_promo_messages;
CREATE POLICY client_promo_messages_own ON public.client_promo_messages
  FOR ALL TO authenticated
  USING (decorator_id = auth.uid()::text)
  WITH CHECK (decorator_id = auth.uid()::text);
```

## Rollback (escrito ANTES de aplicar)

Reversão completa da migração `20260824000100`. Não toca dado de outras tabelas;
o `DROP TABLE` leva junto os índices e a policy, mas deixo o `DROP POLICY` explícito
no mesmo estilo do `rls-rollback.sql`. Reversível a qualquer momento.

```sql
-- ordem: policy → tabela → coluna
DROP POLICY IF EXISTS client_promo_messages_own ON public.client_promo_messages;
DROP TABLE  IF EXISTS public.client_promo_messages;           -- índices + RLS caem junto
ALTER TABLE public.decorators DROP COLUMN IF EXISTS promo_message_template;
```

## ✅ Checklist de lançamento (NÃO ligar a flag sem cumprir)

> Regra dura: **não** definir `NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP='true'` na Netlify
> (produção) enquanto os itens abaixo não estiverem confirmados. Sem a tabela, o
> INSERT quebra; sem a policy, a RLS não protege o caminho PostgREST.

- [ ] Migração `20260824000100_client_promo_messages.sql` aplicada em **produção**
      (com meu — Wesley — OK explícito antes de qualquer DDL em prod).
- [ ] `client_promo_messages` existe em prod com **RLS ligado** e a policy
      `client_promo_messages_own` ativa (conferir no painel do Supabase ou via
      `rls-auth-test.mjs` apontado ao banco correto).
- [ ] **Grants revogados** de `anon`/`authenticated` em `client_promo_messages`
      (a tabela nasce com grants default do Supabase; sem revogar, fica acessível
      no PostgREST protegida só pela RLS, diferente das outras 10 tabelas). O
      `REVOKE` já está na migração — conferir com uma query read-only aos grants.
- [ ] Coluna `decorators.promo_message_template` existe em prod.
- [ ] `rls-auth-test.mjs` verde para as **11 tabelas** no banco alvo.
- [ ] Só então ligar a flag na Netlify e validar o fluxo com uma conta real.
