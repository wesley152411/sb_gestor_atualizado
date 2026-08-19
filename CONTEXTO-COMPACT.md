# Contexto da sessão (compact) — SB Gestor

> Arquivo gerado para você copiar o conteúdo. Pode apagar depois (`CONTEXTO-COMPACT.md`).

## 1. Projeto e intenção
"SB Gestor" — Next.js 16.2.9 (Turbopack, App Router), React 19, Prisma 6.19.3 (Supabase Postgres), Zustand, SWR. Marketplace B2B multi-tenant de locação para decoradoras de festa. Deploy no Netlify (sbgestor.netlify.app), branch `fix/inventory-modal-e-calendario-ui`, remote https://github.com/wesley152411/sb_gestor_atualizado.git (deploy = merge para `main`).

**CRÍTICO: o projeto NÃO usa Tailwind** — todo estilo é CSS custom + variáveis em `src/app/globals.css`.

**P0 SEGURANÇA (intenção dominante):** uma conta nova viu dados de Clientes/Agenda da SB GESTOR. Remediação de isolamento multi-tenant, prioridade estrita:
- **Item 1 = identidade por sessão no servidor (TOPO, entregue primeiro)**
- **Item 2 = RLS (segundo)**
- **Item 3 = testes de isolamento (terceiro)**
- **Item 4 = regra do calendário do Marketplace**

Pedido mais recente: priorizar **harness de testes (item 7/3) ANTES do RLS (item 6/2)** — harness que autentica programaticamente contra o Supabase para validar o caminho logado, em branch separada. Mais 3 itens novos: base64→Storage, verificar contas seed antes de reabrir, sanitização de texto no servidor.

## 2. Conceitos técnicos
- Prisma conecta com role privilegiada → **RLS do Supabase é ignorado no caminho Prisma**; isolamento dependia do `where` de cada query.
- Identidade por sessão: `@supabase/ssr` `createServerClient` + `next/headers` cookies() (async no Next 16) + `auth.getUser()` (valida JWT). `decorator.id === auth user.id`.
- Cookies de sessão: `createBrowserClient` grava sessão em cookies (legíveis no servidor). Signup auto-confirma (confirmação de e-mail OFF). Sem `service_role` (só anon key + DATABASE_URL no .env.local).
- Harness: Vitest 4.1.10, padrão cookie-jar (client `@supabase/ssr` com Map, signUp/signIn grava cookies, serializa para header `Cookie:`, fetch no server Next → round-trip real de cookie).

## 3. Arquivos principais
- `src/lib/supabase/server.ts` (NOVO): `createSupabaseServerClient()` e `getSessionDecoratorId()`.
- `src/app/api/whoami/route.ts` (NOVO, diagnóstico temporário): retorna `{ decoratorId, authenticated }`. **Remover após você terminar os testes da Etapa 3.**
- `src/app/api/clients/route.ts` (Etapa 1): GET/POST por sessão, 401 sem sessão, carimba `decorator_id`, 403 ao editar de outro.
- `src/app/api/party-events/route.ts` (Etapa 1): mesmo padrão.
- `src/app/api/calendar/route.ts` (Etapa 1 + Item 4): sessão; payload de locação = `{ id, event_date, status, owner_id, renter_id, total_value (B2B, PERMITIDO), items:[{name,quantity}] }` — sem nome/telefone da contraparte.
- `src/app/api/quote-links/route.ts` (Etapa 1): POST por sessão; checa dono do item/kit (403).
- `src/app/api/inventory/route.ts` e `src/app/api/kits/route.ts` (Etapa 2): `wantsOwn = searchParams.has('decoratorId')` → acervo próprio vs feed público de terceiros; POST carimba dono + 403.
- `src/app/api/inventory/[id]/route.ts` e `src/app/api/kits/[id]/route.ts` (Etapa 2): DELETE **não tinha auth** — agora sessão + dono (401/403/404).
- `src/app/api/orders/route.ts` (Etapa 2): GET por sessão (dono OU locatário); POST checa participante.
- `src/app/api/chats/route.ts` (Etapa 2, crítico): GET conversa exige `sessionId === decoratorA || decoratorB` senão 403; POST força `sender_id: sessionId`.
- `src/app/(dashboard)/chat/page.tsx`: removida auto-resposta falsa.
- `src/app/(dashboard)/calendar/page.tsx`: DetailCard com `amount?` mostrando "Locação B2B"; globals.css `.detail-amount-line`.
- `src/app/api/decorators/route.ts` (Etapa 3): GET com `select` mínimo (id, name, avatar_url, logo_url, location, membership_level); POST authz (id === sessão senão 403).
- `src/app/api/decorators/me/route.ts` (NOVO, Etapa 3): GET perfil próprio completo (404 se não existe); POST upsert com criação preguiçosa (semeia name/location do user_metadata). Stats e membership_level não setáveis pelo cliente.
- `src/services/api.ts`: removido `createDecoratorFromAuth`; mocks localStorage removidos; adicionados `getMyProfile()`, `ensureMyProfile()`, `saveDecoratorProfile()` → POST `/api/decorators/me`.
- `src/components/providers/AuthProvider.tsx`: usa `getMyProfile()` + `ensureMyProfile()` (sem impersonação getDecorators/decorators[0]).
- `SECURITY-AUDIT.md` (NOVO): causa raiz, timeline (vazamento em 2026-06-27 commit 2f49483), tabela de rotas.
- Harness (branch `test/isolation-harness`): `tests/helpers.ts`, `tests/isolation.test.ts` (7 testes), `vitest.config.mts`, `tests/README.md`, `"test": "vitest run"` no package.json (só nessa branch).

## 4. Erros e correções
- Calendário "ainda mostra SB GESTOR": era locação B2B legítima do Mosaico (Mosaico=locatário, SB GESTOR=dono de "Fazendinha rosa", R$1025). Não era vazamento.
- Eu inicialmente ESCONDI o valor B2B do calendário — você refinou o Item 4: valor B2B PODE aparecer dos dois lados, só dado do cliente final nunca pode. Re-adicionei `total_value`.
- DELETE sem autenticação (Etapa 2) — você chamou de "mais grave que o vazamento original". Corrigido.
- Criação preguiçosa de perfil resolvida no AuthProvider (/me), sem depender de sessão no signup.

## 5. Verificações feitas
- Isolamento ao vivo (deslogado): rotas sensíveis 401; `?decoratorId=<id SB GESTOR>` forjado → 401.
- Harness provou o caminho LOGADO: **7/7 testes passaram** (~36s); limpeza verificada (4 decoradoras reais, 0 linhas de teste).
- Sem vazamento via PostgREST anon-key (`GET /rest/v1/clients` → 401 permission denied) → RLS é defesa em profundidade, não buraco ativo.
- Token do link público = `crypto.randomUUID()` (UUIDv4, seguro).
- 4 contas reais (não seed); avatares Unsplash são default antigo do signup.

## 6. Contas em produção (item 2 — falta sua decisão)
| id | nome | cidade | observação |
|---|---|---|---|
| 6bdc87d3 | SB GESTOR | Vespasiano - MG | avatar base64, conta principal |
| 0568c034 | Mosaico | Vespasiano - MG | avatar Unsplash antigo |
| 9d1b572b | Bella Fest | "SSao Paulo - SP" | Unsplash + typo na cidade |
| 398eab4e | " SB Festas" | Vespasiano - MG | nome com espaço à frente, avatar vazio |

Todas são contas reais (Auth UUID), NÃO a massa seed (dec-1/2/3, já removida). **Você precisa dizer quais manter e quais apagar antes de reabrir.**

## 7. Commits
- 97b4bff (P0 branch), 7ced242 (main P0)
- 6831471 (Etapas 1+2 branch), d94a0b5 (main Etapas 1+2)
- 5d3b23f (Etapa 3 branch — AINDA NÃO em main)
- Harness commitado e enviado em `test/isolation-harness`

## 8. Sequência para reabrir cadastros
1. Você valida Etapas 2 e 3 (agora com `npm test`)
2. Eu faço merge da Etapa 3 em main + removo `/api/whoami`
3. Resolver item 2 (contas fictícias)
4. Você repete os testes em produção
5. Você reabre cadastros

## 9. Pendências (sem mudar prioridade)
- Entregue: harness (item 7), 7/7 passando.
- Falta (se sobrar tempo): **Item 6 — script de RLS para revisão** (deny-by-default + plano de rollback + validação do feed público do Marketplace), NÃO aplicado em produção.
- Depois: Item 1 (base64→Supabase Storage + migração, bloquear data: URI, validar/redimensionar upload jpg/png/webp max 2MB ~400x400) e Item 3 (trim/sanitização no servidor de nome/cidade/sobre/whatsapp/instagram + corrigir registros existentes com espaços/typos).

## 10. Perguntas em aberto para você
1. Quais das 4 contas manter vs apagar antes de reabrir?
2. Confirmado: o harness cria a própria conta C para o teste do chat — você NÃO precisa criar manualmente.
3. Próximo passo meu deve ser o **script de RLS para revisão** (com rollback + validação do Marketplace)?
