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

## Replicar o schema com fidelidade

O ponto do harness são as **políticas de RLS**; recriar só as tabelas não basta.
O baseline **já está versionado** em `supabase/migrations/*_baseline.sql`, gerado
por um `pg_dump --schema-only` **read-only da produção** (o `supabase db pull`
falhou porque a prod nunca teve histórico de migrations — este projeto está
adotando migrations agora). Ele traz tabelas, constraints (inclui o CHECK dos 5
status), índices, **10 políticas RLS**, e a semente do bucket de Storage
`festora`.

Aplicar no projeto de TESTE:

```bash
supabase link --project-ref <ref-de-teste>
supabase db push        # aplica supabase/migrations/*_baseline.sql no teste
```

> **Produção:** NÃO rodar `supabase db pull` nem `migration repair` contra a prod
> por ora — ela não tem tabela de histórico e a adoção do ledger na prod é um
> passo separado (opcional). O baseline veio de leitura pura; a produção não foi
> tocada.
> **Storage:** os buckets são DADOS (não vêm no dump do schema). O baseline já
> semeia `festora`; se criar novos buckets, replique nos dois.

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
