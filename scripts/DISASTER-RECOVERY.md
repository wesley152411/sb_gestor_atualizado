# Recuperação de desastre — banco SB Gestor

> Você está lendo isto num dia ruim e com pressa. Vai dar certo. Siga na ordem.

## O que temos de backup

Gerado por [`backup-db.ps1`](backup-db.ps1) em `~\sbgestor-backups\` (fora do repo):

| arquivo | conteúdo | formato |
|---|---|---|
| `<ts>_public.dump` | schema `public` completo (estrutura + dados do app) | pg_dump custom (`-Fc`) |
| `<ts>_auth.dump` | **dados** de `auth.users` e `auth.identities` (os logins) | pg_dump custom, data-only |
| `<ts>_META.txt` | versão do servidor e do `auth.schema_migrations` | texto |

**Pré-requisito:** Docker. Servidor de produção é **PostgreSQL 17.6** → sempre use imagem `postgres:17`.

**NÃO coberto ainda:** arquivos do Storage (imagens). Enquanto as imagens forem base64 no banco, elas entram no `public.dump`. Quando migrarem para o Storage, **é preciso uma rotina separada de export do bucket** — senão este backup fica com um furo. (amarrado ao item do Storage.)

## Restaurar os DADOS DO APP (`public`) — o caminho crítico

Num alvo Postgres 17 (projeto novo do Supabase, ou container local):

```powershell
# alvo local descartável (ou aponte para o novo projeto)
docker run -d --name sbrestore -e POSTGRES_PASSWORD=x -p 127.0.0.1:55432:5432 `
  -v "$HOME\sbgestor-backups:/backup" postgres:17
docker exec sbrestore pg_restore -U postgres -d postgres --no-owner --no-acl `
  -n public "/backup/<ts>_public.dump"
```

Conferir contagem de linhas (comparar com o esperado) — ou usar [`restore-test.ps1`](restore-test.ps1),
que faz isso e **destrói o container** no fim.

## Restaurar os LOGINS (`auth`) — a parte delicada

O schema `auth` é gerido pelo **GoTrue** (serviço de Auth do Supabase). O dump é
**data-only** (só as linhas de `auth.users`/`auth.identities`), então o alvo precisa
já ter o schema `auth` **na mesma versão** de migrations registrada no `_META.txt`:

- **`auth_schema_migrations` esperado: `20260625000000`** (confira o `_META.txt` do dump).
- Restaurar num **projeto Supabase novo**: funciona se a versão do GoTrue do projeto
  novo bater com a do `_META.txt`. Se o Supabase já tiver avançado a versão, importe as
  linhas de `auth.users`/`auth.identities` para as tabelas correspondentes manualmente
  (as colunas essenciais — `id`, `email`, `encrypted_password` — são estáveis).
- **Não temos `service_role`** neste projeto, então a API admin de export de usuários
  **não** é uma opção; este `pg_dump` do `auth` é o nosso único mecanismo de preservar login.
- Comando de restauração dos dados de auth:
  ```powershell
  docker exec sbrestore pg_restore -U postgres -d postgres --no-owner --no-acl `
    --data-only "/backup/<ts>_auth.dump"
  ```
- **Casamento com o `public`:** `decorators.id == auth.users.id` (mesmo UUID). Se restaurar
  `public` sem `auth`, você terá decoradoras sem login — restaure os dois.

## Ordem recomendada num desastre real

1. Criar/eleger o alvo (projeto Supabase novo em Postgres 17).
2. Restaurar `public` → validar contagens.
3. Restaurar `auth` (data-only) → validar `select count(*) from auth.users`.
4. Conferir que `decorators.id` casa com `auth.users.id`.
5. Repontar o app (`DATABASE_URL`, chaves) para o novo projeto.
6. Login de fumaça com uma conta real.

## Higiene do backup

- Arquivos ficam **só** na máquina local, em `~\sbgestor-backups\`. Nunca no repo
  (`.gitignore`: `*.dump`), nunca em nuvem compartilhada, nunca por chat.
- Apagar os dumps após a limpeza das contas estar concluída e validada (prazo a combinar).
- Backup é fé até ser restaurado uma vez — rodar `restore-test.ps1` sempre.
