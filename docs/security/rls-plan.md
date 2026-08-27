# RLS — plano de aplicação, validação e rollback (Item 6)

**Status (2026-08-16): RLS APLICADO E VALIDADO NAS 10 TABELAS.**
Canário `clients` + Lote 1 (`party_events, rental_orders, rental_order_items, chat_messages`)
+ Lote 2 (`decorators, inventory_items, kits, consumables, forum_posts`). Todas: RLS on,
force off, 1 policy cada. Arquivos: `rls-enable.sql`, `rls-rollback.sql`, `rls-auth-test.mjs`.

Provas finais: teste autenticado 32/32 (as 10 tabelas, cada token vê só a própria linha),
harness 8/8, PostgREST anônimo 401 em todas, vitrine/Prisma intacta.

**Atualização (2026-08-26): 11ª tabela — `client_promo_messages`.** A reativação
promocional por WhatsApp adicionou a tabela `client_promo_messages`, que segue o MESMO
padrão (`ENABLE`, sem `FORCE`, 1 policy `client_promo_messages_own` com `decorator_id =
auth.uid()::text`). Diferença: o RLS dela nasce na própria migração de criação
(`supabase/migrations/20260824000100_client_promo_messages.sql`), não no `rls-enable.sql`.
O `rls-auth-test.mjs` já cobre as **11 tabelas**. A feature está atrás da flag
`NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP` (off em prod). A migração precisa estar aplicada e a
policy ativa ANTES de ligar a flag (ver `docs/features/promo-whatsapp.md`).

> **Achado (2026-08-27): grants default em tabela nova.** Toda tabela criada em `public`
> nasce com os grants DEFAULT do Supabase (`ALTER DEFAULT PRIVILEGES` concede tudo a
> `anon`/`authenticated`). As 10 tabelas antigas foram endurecidas (sem esses grants), mas
> a `client_promo_messages` nasceu com eles — ficava acessível a anon/authenticated no
> PostgREST, protegida só pela RLS (faltando a camada de grant). Corrigido com
> `REVOKE ALL ON public.client_promo_messages FROM anon, authenticated;` na própria
> migração. **Regra para QUALQUER tabela nova:** revogar os grants de anon/authenticated
> para bater com o baseline, senão a defesa em camadas fica incompleta.

**Validação por lote (4 provas):** (1) Prisma/app lê e grava normal; (2) PostgREST anônimo
401; (3) **teste autenticado** `node docs/security/rls-auth-test.mjs` — token real vê SÓ as
próprias linhas (concede SELECT temporário a `authenticated`, testa, revoga); (4) harness 8/8.
O teste (3) é o que prova a policy CORRETA, não só ligada — o 401 anônimo sozinho não prova.

> **Achado ao aplicar:** as colunas de id são `text` e `auth.uid()` é `uuid`. Todas as
> policies usam `auth.uid()::text` (senão erro `42883: operator does not exist: text = uuid`).
> Validação do canário: RLS on/force off, policy `clients_own` criada, Prisma continua lendo
> as 6 linhas (dono ignora RLS), e PostgREST anônimo segue 401 (permission denied, sem grant).

## Por que isto é seguro (e por que o Marketplace não quebra)

O app fala com o banco via **Prisma**, que conecta como `postgres.<ref>` (pooler do
Supabase) — role **dono das tabelas**. No Postgres, **o dono ignora RLS quando não se
usa `FORCE`**. Então:

- Todo o app (Prisma) continua exatamente como está: leituras, escritas, e o **feed
  público do Marketplace** (`/api/inventory`, `/api/kits`) — que é servido por Prisma —
  **não são tocados pelo RLS**.
- O RLS passa a valer só para os roles `anon` e `authenticated`, que são o caminho
  **PostgREST/supabase-js direto**. Hoje o app usa esse caminho **apenas para Auth**,
  nunca para ler tabelas. E `anon`/`authenticated` já recebem 401 (sem GRANT). O RLS é a
  **2ª camada**: se um dia alguém der GRANT por engano, as linhas seguem isoladas.

**Regra inegociável:** `ENABLE`, **nunca `FORCE`**. Com `FORCE`, o Prisma também seria
filtrado por `auth.uid()` (que é NULL na conexão dele) e **todas as queries voltariam
vazias** — o app quebraria por inteiro. O script usa só `ENABLE`.

## Pré-checagem (antes de aplicar)

Confirmar que o role do Prisma realmente é dono e ignora RLS. Rodar no SQL editor:

```sql
-- 1) Quem é o dono das tabelas? (esperado: postgres)
SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public';

-- 2) O role atual tem BYPASSRLS ou é o dono? (esperado: dono = postgres)
SELECT current_user, session_user;
```

Se por acaso o dono **não** for o mesmo role que o Prisma usa, PARAR e revisar — o
pressuposto de "dono ignora RLS" não valeria e o app poderia ser filtrado.

## Aplicação faseada (com canário)

1. **Canário:** aplicar só o bloco de `public.clients` do `rls-enable.sql`.
2. **Validar canário** (checklist abaixo).
3. Se tudo passar, aplicar o **restante** do `rls-enable.sql`.
4. **Validar completo** (mesmo checklist, agora cobrindo todas as tabelas).

## Checklist de validação

Caminho do **app (Prisma)** — tem que continuar 100%:

- [ ] `npm run dev` + `npm test` (harness) → **7/7 verdes** (prova leitura/escrita logada e isolamento).
- [ ] Logar no app e abrir **Clientes** e **Agenda** → dados aparecem normalmente.
- [ ] Abrir o **Marketplace** logado → itens/kits de OUTRAS decoradoras ainda aparecem no feed público.
- [ ] Abrir um **link público de orçamento** → carrega normalmente.

Caminho **PostgREST (defesa em profundidade)** — tem que continuar barrado:

- [ ] `GET https://<ref>.supabase.co/rest/v1/clients` com a **anon key** → 401/vazio (como hoje).
- [ ] (se algum dia houver GRANT a `authenticated`) uma sessão de conta A não lê linha de B por PostgREST.

Rodar o harness também **contra produção** depois do deploy:

- [ ] `TEST_BASE_URL=https://sbgestor.netlify.app npm test` → 7/7.

## Rollback

Imediato e sem perda de dados: rodar `rls-rollback.sql` (dá `DROP POLICY` e
`DISABLE ROW LEVEL SECURITY` em todas as tabelas). Como o app (Prisma) nunca dependeu do
RLS, o rollback não muda o comportamento do app — serve só para limpar o estado.

## Fora de escopo deliberadamente

- Nenhuma policy para `anon` (anônimo não lê tabela por PostgREST — comportamento atual).
- `FORCE ROW LEVEL SECURITY`: **não usar** (quebraria o Prisma).
- O marcador `is_internal` (conta de teste oculta) **não** vira exceção de RLS — é só
  filtro de vitrine na camada de aplicação. Ver nota no item 2.
