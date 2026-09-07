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

---

## Encenar a regressão: confirmar que o build aconteceu é parte da prova

Um teste que nunca falhou não prova nada. A disciplina desta base é **encenar a
regressão**: quebrar de propósito o que o teste deveria pegar e confirmar que ele
fica vermelho. Sem isso, nasce prova decorativa — aconteceu quatro vezes numa
única sessão (dinheiro truncado, rota pública com gate, oferta de retenção,
batimento do job), e em todas o teste passava com o bug aplicado.

**A armadilha que vai voltar.** Encenando contra um build de PRODUÇÃO
(`next build` + `next start`, que é como se testa por túnel), esta sequência
falha em silêncio:

```
1. patch da regressão no fonte      OK
2. npm run build                     -> prisma generate falha com EPERM
                                        (o servidor ANTIGO segura
                                         node_modules/.prisma/client/query_engine-windows.dll.node)
3. next build NUNCA roda             (o script é `prisma generate && next build`)
4. o teste roda contra o ARTEFATO ANTERIOR
5. "passou" — e a conclusão é falsa
```

Pior: `kill %1` **não** encerra o servidor, porque cada invocação do shell é um
processo novo e o job control não alcança o anterior. O servidor sobrevive, o
EPERM se repete, e o erro parece intermitente.

**A ordem que funciona**, uma etapa por vez, verificando cada uma:

```
1. encerrar o servidor POR PID   (Get-NetTCPConnection -LocalPort 3200 -> Stop-Process)
2. confirmar que a porta está livre
3. aplicar o patch e CONFERIR que ele entrou no fonte (grep)
4. build, e CONFERIR "Compiled successfully" (não deixar o grep engolir a saída)
5. subir o servidor e esperar responder
6. rodar o teste
7. restaurar e reconstruir
```

Se o passo 4 não imprimir "Compiled successfully", o resultado do passo 6 não vale
— seja ele verde ou vermelho.

**Sinais de que a edição corrompeu o teste em vez de corrigi-lo.** Escapes
passando por heredoc do shell + Python viram outra coisa: `` chegou a virar o
caractere de **backspace** literal dentro de um regex, que nunca casa com nada.
`grep` não mostra backspace; só apareceu com `cat -A`. Quando um teste
inexplicavelmente não pega a regressão, `cat -A` no trecho é o próximo passo —
e, em asserção de string, `includes()` é preferível a regex justamente por não
ter escape para corromper.
