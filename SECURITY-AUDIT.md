# Auditoria de Isolamento Multi-Conta (P0)

**Data:** 2026-08-16
**Incidente:** uma conta enxergava dados de outra (Clientes e Eventos).

## Causa raiz

A página **Clientes** chamava `usePartyEvents()` e `useClients()` **sem `decoratorId`**.
Sem o parâmetro, as rotas `GET /api/party-events` e `GET /api/clients` faziam
`findMany()` **sem `where`**, retornando registros de **todas as contas**.

Fator agravante: o `AuthProvider` caía para `decorators[0]` quando não achava o
perfil da sessão — **impersonando outra conta** (nova conta virava a primeira do banco).

Contexto de arquitetura: o Prisma acessa o Postgres com role privilegiada, então o
**RLS do Supabase é ignorado** — o isolamento dependia 100% do `where` de cada query.

## Desde quando

Introduzida em **2026-06-27**, commit `2f49483` ("migrate backend queries to Prisma
ORM"). Antes disso as leituras passavam pelo Supabase client. Janela: 2026-06-27 → 2026-08-16.

## Auditoria das rotas de leitura

| Rota | Antes | Depois |
|------|-------|--------|
| `GET /api/clients` | ❌ retornava TODOS | ✅ exige `decoratorId`, filtra por dono (400 sem ele) |
| `GET /api/party-events` | ⚠️ sem param = TODOS | ✅ exige `decoratorId` (400 sem ele) |
| `GET /api/inventory` | ⚠️ sem param = TODOS (inclui privados) | ✅ sem param = só `status: Público` (feed marketplace) |
| `GET /api/kits` | ⚠️ sem param = TODOS (inclui privados) | ✅ sem param = só `status: Público` |
| `GET /api/calendar` | ✅ exige `decoratorId`; filtra `decorator_id` (eventos) e owner/renter (orders) | mantido |
| `GET /api/orders` | ✅ filtra por `decoratorId` (owner/renter) | mantido |
| `GET /api/chats` | ✅ filtra por participante | mantido |
| `GET /api/decorators` | ⚠️ lista todas as decoradoras (perfil semi-público p/ marketplace) | mantido; ver Pendências |
| `GET /api/public/decorator/[id]` | público por design (só dados públicos) | mantido |
| `GET /api/public/quote/[token]` | público por token | mantido |

### Consumo pelas telas (hooks) — todas passam `decorator?.id`

Dashboard, Meu Acervo, Marketplace, Minha Página, Chat, Calendário, Clientes (corrigido),
Formulário. Confirmado por varredura: nenhuma tela chama os hooks de dados sem o id.

## Correções aplicadas (Fase 1 — estanca o vazamento)

- `clients/page.tsx`: `usePartyEvents(decorator.id)` + `useClients(decorator.id)`.
- `swr-hooks.ts`: `useClients(decoratorId)`; sem id, os hooks **não buscam** (URL nula).
- Rotas `clients` e `party-events`: exigem `decoratorId` (400 sem ele).
- Rotas `inventory` e `kits`: sem `decoratorId` retornam **só públicos**.
- `AuthProvider`: **removida a impersonação** `decorators[0]` (sessão sem perfil => `null`).
- `getClients(decoratorId)` no serviço, blindado.

Validado ao vivo: sem param => 400; cada conta vê só os próprios registros; conta sem
dados vê **0** (nada de terceiros).

## Pendências (Fase 2 — defesa em profundidade, recomendado)

1. **Identidade pela sessão validada no servidor.** Hoje o `decoratorId` vem do cliente
   (param). Isso corrige o vazamento acidental, mas um usuário mal-intencionado poderia
   passar o id de outra conta. Correção: ler o usuário via `@supabase/ssr`
   (`createServerClient` + `auth.getUser()`) dentro de cada rota e derivar o `decoratorId`
   da sessão — nunca do parâmetro. Centralizar numa única camada (`getSessionDecoratorId()`).
2. **RLS no Supabase** como segunda barreira. Como o Prisma usa role privilegiada,
   avaliar: (a) leituras sensíveis via Supabase client (respeita RLS), ou (b) role de
   conexão do Prisma sem bypass de RLS.
3. **Testes automatizados de isolamento** no pipeline: criar 2 contas e validar,
   endpoint a endpoint, que uma não vê registros da outra. (Sem framework de teste no
   projeto ainda — precisa configurar Vitest/Jest.)
4. **Fluxo Marketplace no calendário:** a contraparte de uma locação vê a `RentalOrder`
   (com `total_value`). Definir por regra de negócio se o valor B2B deve aparecer aos dois
   lados ou só a indisponibilidade da peça. Não é vazamento de cliente final (o evento do
   cliente é filtrado por `decorator_id`), mas merece decisão explícita.

## Dados reais x seed

Os registros expostos incluíam massa de teste antiga (seeds já removidos numa tarefa
anterior) e contas reais (SB GESTOR, Mosaico, Bella Fest). O vazamento era real, não só
de demonstração.
