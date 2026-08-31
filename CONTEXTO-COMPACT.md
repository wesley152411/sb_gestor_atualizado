# Contexto da sessão (compact) — SB Gestor

> Arquivo gerado para você copiar o conteúdo. Pode apagar depois (`CONTEXTO-COMPACT.md`).

## 1. Projeto e intenção
"SB Gestor" — Next.js 16.2.9 (Turbopack, App Router), React 19, Prisma 6.19.3 (Supabase Postgres). **NÃO usa Tailwind** — CSS custom + variáveis em `src/app/globals.css` (embora classes utilitárias tipo `w-4 h-4`, `bg-slate-100` apareçam e funcionem). Marketplace B2B multi-tenant de locação para decoradoras de festa. Deploy = push para `main` → build automático no Netlify; produção https://sbgestor.com. Supabase prod ref `urvbkfyyvbsahdnkkwed`.

## 2. Pedidos entregues nesta sessão
1. **Link de confirmação quebrado (`token_hash=pkce_...`)** — em qualquer navegador/dispositivo a conta devia confirmar e entrar.
2. **Meu Acervo — foto de capa do kit sendo replicada em todas as peças** — capa só do kit; peças nascem sem imagem (placeholder); editar capa não propaga; apagar kit não apaga peças.
3. **Meu Acervo — miniatura no modal mostrava capa + estoque/preço inventados** — miniatura = foto própria ou placeholder; peça nasce com estoque/preço vazios ("A definir"); seletor de quantidade do modal = composição do kit (não estoque); valor do kit obrigatório; bloquear "Adicionar ao formulário" sem preço.
4. **Semear estoque** — quantidade do modal semeia estoque inicial só para peças NOVAS.
5. **Trava de preço no backend** — peça sem preço = rascunho, não publica, não entra em pedido/formulário, validado no servidor (não só no `disabled`).
6. **Mensagem de erro do valor do kit** — validação on-submit; texto curto "Informe o valor do kit".
7. **Página pública da parceira (Marketplace)** — Foto de perfil (avatar_url), Sobre, Localização, WhatsApp (wa.me clicável), Instagram (clicável); campos vazios omitidos; contas is_internal excluídas; links externos `target="_blank" rel="noopener noreferrer"`.
8. **Ciclo de vida do orçamento (5 status)** — Aguardando preenchimento / Aguardando confirmação / Confirmado / Finalizado / Cancelado; helper único; front+back; confirmar irreversível também na API; PDF gerado na confirmação; token novo a cada clique; auto-finaliza por data (America/Sao_Paulo, sem cron).
9. **CI harness na main + projeto Supabase de teste** — workflow em PR+push; var de ambiente do banco de teste; guarda contra rodar em produção; keepalive p/ free-tier; réplica de schema (RLS, constraints, triggers, buckets); sem dados reais; segredos no GitHub Secrets.
10. **Limpeza de rascunhos** — 26 rascunhos "(link não preenchido)" apagados; rascunhos escondidos por padrão (atrás de filtro).
11. **claude-seo instalado** (github.com/AgriciDaniel/claude-seo).
12. **Reativação promocional por WhatsApp** — botão de mensagem na coluna Ações de Clientes; elegível quando eventDate+1mês < hoje; desabilitado sem telefone válido; modal com telefone editável + template {nome} + wa.me; tabela `client_promo_messages` com RLS; badge "aberto" com data; template configurável em Configurações. **Com feature flag** (ativa só em dev, "Em breve" em produção, checada no servidor) e **máscara de telefone + validação de DDD** (11-99, 10/11 dígitos).
13. **emilkowalski/skills instalado** (12 skills de design/animação) — em `.agents/skills/`, gitignorado.

## 3. Conceitos técnicos-chave
- `@supabase/ssr` `createBrowserClient` FORÇA `flowType:"pkce"` (não dá pra sobrescrever) → `{{ .TokenHash }}` vira `pkce_...` que `verifyOtp` não processa. **Solução:** client `@supabase/supabase-js` separado com `flowType:'implicit'` só para chamadas que disparam e-mail.
- Colunas Decimal do Prisma chegam como STRING via API (ex. "0.00"); `!value`/`=== 0` falham → usar `Number(x) > 0` (helper `hasPrice`).
- RLS: `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY <t>_own ON public.<t> TO authenticated USING ((decorator_id = (auth.uid())::text))`. Prisma (owner role) ignora RLS; policy protege caminho PostgREST anon/authenticated. Todos os ids são `text` → `auth.uid()::text`.
- PartyEvent.status é `String?` (não enum) com CHECK `party_events_status_check`. Orçamento = uma linha PartyEvent (public_token UUID v4).
- Finalização derivada na leitura (sem cron): Confirmado + event_date passado → Finalizado. America/Sao_Paulo fixo -03:00.
- Netlify: `NEXT_PUBLIC_*` inlined no build; `NODE_ENV=production` em prod. Flag: `process.env.NEXT_PUBLIC_FEATURE_PROMO_WHATSAPP === 'true' || (!== 'false' && NODE_ENV === 'development')` — funciona client e server.
- Supabase direct connection é IPv6-only (inacessível do Docker IPv4) → usar session pooler `aws-0-us-east-2.pooler.supabase.com:5432` user `postgres.<ref>`. Projeto de teste em us-east-2.

## 4. Arquivos principais tocados
- `src/lib/supabase/client.ts`: `getSupabaseMailerClient()` (implicit).
- `src/lib/event-status.ts` (NOVO): `EVENT_STATUS`, helpers (`effectiveStatus`, `isDraftLink`, `countsAsRevenue`, `showsInCalendar`, `blocksStock`, `reservesStock`, `isLinkOpenForClient`, `statusBadge`).
- `src/lib/utils.ts`: `hasPrice`, `formatPriceLabel`, `sanitizePhoneDigits`, `sanitizeInstagramHandle`, `whatsappUrl`, `instagramUrl`, `promoWhatsappUrl`, `defaultPromoTemplate`, `fillPromoTemplate`, `formatPhoneMask`, `isValidBrPhone`.
- `src/lib/feature-flags.ts` (NOVO): `promoWhatsappEnabled`, `PROMO_COMING_SOON`.
- `src/components/ui/PhoneInput.tsx` (NOVO): input mascarado, guarda só dígitos.
- `src/app/(dashboard)/inventory/page.tsx`, `marketplace/my-page/page.tsx`, `clients/page.tsx`, `settings/page.tsx`, `calendar/page.tsx`, `analytics/page.tsx`, `party-form/page.tsx`, `components/layout/Header.tsx`.
- `src/app/orcamento/[token]/page.tsx`: telas read-only de agradecimento/cancelado; PhoneInput + validação.
- APIs: `quote-links/route.ts`, `public/quote/[token]/route.ts`, `party-events/[id]/route.ts` (NOVO: confirm/cancel/discard), `promo-messages/route.ts` (NOVO, flagGuard 404), `decorators/me/route.ts`.
- `prisma/schema.prisma`: PartyEvent `submitted_at`; Decorator `promo_message_template`; modelo `ClientPromoMessage`.
- Migrations: `docs/migrations/party-event-status.sql`, `supabase/migrations/20260823211705_baseline.sql`, `.../20260824000100_client_promo_messages.sql`.
- CI: `.github/workflows/harness.yml`, `keepalive-test-db.yml`, `tests/guard.ts` (aborta se apontar p/ prod `urvbkfyyvbsahdnkkwed`, exige `HARNESS_ALLOW_TEST_DB=true`), `tests/setup.ts`, `.env.test.example`, `docs/testing/harness-ci.md`.
- `.gitignore`: `.agents/` e `skills-lock.json`.

## 5. Estado / verificações
- Todas as features deployadas e verificadas (fingerprint de bundle nas páginas públicas).
- Ciclo de orçamento com migração aplicada em prod E teste.
- Harness verde (15/15, 1 skip) contra banco de teste us-east-2. Projeto de teste provisionado (10 tabelas, 10 RLS, bucket festora, ledger de migração).
- 26 rascunhos órfãos apagados da prod.
- Promo com flag: "Em breve" em produção.
- Skills instaladas e gitignoradas.

## 6. Segurança (intenção preservada)
- Nunca gravar segredos em arquivos/repo — ler do GitHub Secrets.
- Você colou service_role key de teste e senha do banco `WeSlEy1-@3f4` no chat → **recomendei rotacionar após o setup**.
- Guarda do harness aborta se apontar para prod. Sem dados reais no banco de teste. Não rodar `supabase db pull`/`migration repair` contra produção.

## 7. Pendências / itens oferecidos (não aprovados)
- Nenhuma tarefa explícita pendente.
- Oferecido (aguardando ok): rodar monitor de deploy; adicionar teste de regressão RLS da tabela promo ao harness; você rotacionar a service_role key + senha do banco de teste.

## 8. Nota sobre as skills recém-instaladas
As 12 skills do emilkowalski (`emil-design-eng`, `animate`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`, `apple-design`, `write-swift`, `pick-ui-library`, `prototype`, `ask-sonner`, `animate-expo`) e as do claude-seo só ficam invocáveis **após reiniciar o Claude Code** (a lista de skills é fixada no início da sessão).
