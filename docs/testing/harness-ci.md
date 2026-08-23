# Harness de isolamento — CI contra o banco de TESTE

Esqueleto pronto e **dormant**. Ele só passa a rodar quando o projeto Supabase de
teste existir e a variável `HARNESS_ENABLED` for ligada. Nada aqui toca produção.

## Como ativar (checklist)

1. **Criar o projeto Supabase de teste** com confirmação de e-mail DESLIGADA
   (resolve o rate limit do Auth).
2. **Cadastrar os GitHub Secrets** (Settings → Secrets and variables → Actions → *Secrets*):
   - `TEST_SUPABASE_URL` — `https://<ref-de-teste>.supabase.co`
   - `TEST_SUPABASE_ANON_KEY`
   - `TEST_SUPABASE_SERVICE_ROLE_KEY`
   - `TEST_DATABASE_URL` — string de conexão Postgres do projeto de teste (pooler `:6543`)
3. **Ligar a chave**: criar a *Variable* de repositório `HARNESS_ENABLED = true`
   (Settings → … → *Variables*). Enquanto não existir/`!= true`, os jobs são pulados.
4. **Replicar o schema** (abaixo) no projeto de teste.
5. Abrir um PR — o job **Harness de isolamento** roda contra o banco de teste.

## Replicar o schema com fidelidade (não recriar na mão)

O ponto do harness são as **políticas de RLS**; recriar só as tabelas não basta.
Use o Supabase CLI para gerar as migrations a partir da PRODUÇÃO e aplicá-las no
teste, evitando divergência silenciosa:

```bash
# uma vez, se ainda não houver versionamento de migrations
supabase init

# 1) puxar o schema da PRODUÇÃO para uma migration versionada
#    (traz tabelas, constraints — inclui o CHECK dos 5 status —, índices,
#     policies RLS, triggers e funções)
supabase link --project-ref urvbkfyyvbsahdnkkwed        # produção
supabase db pull                                        # gera supabase/migrations/*.sql

# 2) aplicar a MESMA migration no projeto de TESTE
supabase link --project-ref <ref-de-teste>
supabase db push
```

> **Storage:** `db pull` não traz os buckets. Recrie no teste os buckets usados
> pelo app — `avatars` e `inventory` — (dashboard do Storage ou
> `insert into storage.buckets (id, name, public) values ('avatars','avatars',true), ('inventory','inventory',true);`)
> e replique as policies de Storage se houver.

## Manter os dois em sincronia (a partir de agora)

Toda alteração de schema vira **migration versionada** (em `supabase/migrations/`)
e é aplicada nos DOIS projetos (`db push` em cada). Nada de `ALTER` manual só na
produção — foi assim que a `party_events_status_check` divergiu.
(A migração já aplicada dos 5 status está em `docs/migrations/party-event-status.sql`;
transforme-a em migration versionada no primeiro `db pull`.)

## Regras de segurança embutidas

- **Sem dado real no teste**: só seed fictício criado pelo próprio harness. Nunca
  copiar clientes/eventos/orçamentos de produção.
- **Guarda contra engano** (`tests/guard.ts`): os testes ABORTAM se o alvo for o
  ref de produção (`urvbkfyyvbsahdnkkwed`) ou se `HARNESS_ALLOW_TEST_DB` não for
  `true`. Um `npm test` cru com o `.env` de produção aborta em vez de escrever lá.
- **Keepalive** (`.github/workflows/keepalive-test-db.yml`): consulta semanal para
  o plano gratuito não pausar o projeto de teste por inatividade.

## Rodar localmente contra o teste

```bash
# exporte as variáveis do projeto de TESTE (ver .env.test.example) e:
HARNESS_ALLOW_TEST_DB=true NEXT_PUBLIC_SUPABASE_URL=... DATABASE_URL=... npm run dev &
npm test
```
