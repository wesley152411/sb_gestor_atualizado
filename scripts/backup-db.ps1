# ============================================================================
# backup-db.ps1  —  dump lógico do banco de produção (via Docker, sem instalar
#                   nada). Servidor: PostgreSQL 17.6 -> imagem postgres:17.
# ============================================================================
# O QUE GERA (dois arquivos .dump, formato custom do pg_dump):
#   1) <ts>_public.dump  — schema `public` COMPLETO (estrutura + dados do app).
#   2) <ts>_auth.dump    — DADOS de auth.users e auth.identities (os logins),
#                          data-only (o schema `auth` é recriado pelo GoTrue).
#   + <ts>_META.txt      — versão do servidor e do auth.schema_migrations, para
#                          uma restauração fiel do `auth`.
#
# ONDE GRAVA: fora do repositório. Padrão: $HOME\sbgestor-backups\
#   (troque com -OutDir). A extensão .dump está no .gitignore.
#
# NÃO sobe para nuvem compartilhada, não vai por chat. É dado real de cliente.
# ============================================================================
param(
  [string]$OutDir = (Join-Path $HOME 'sbgestor-backups'),
  [string]$EnvFile = '.env.local',
  # Trava opcional: aborta se o DATABASE_URL não contiver este ref de projeto.
  # Evita dump do banco errado. Prod: -ExpectRef urvbkfyyvbsahdnkkwed
  [string]$ExpectRef = ''
)
$ErrorActionPreference = 'Stop'

# ---- lê DATABASE_URL do .env.local ----
$line = Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL não encontrado em $EnvFile" }
$url = ($line -replace '^DATABASE_URL=', '').Trim().Trim('"').Trim("'")

# postgresql://USER:PASS@HOST:PORT/DB?...
if ($url -notmatch '^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') {
  throw "DATABASE_URL em formato inesperado."
}
$user = $Matches[2]
$pass = [System.Uri]::UnescapeDataString($Matches[3])
$hostname = $Matches[4]
$db   = $Matches[6]
# pg_dump precisa do modo SESSÃO (porta 5432), não do pooler de transação (6543).
$port = '5432'

# Trava de alvo (opcional): o ref aparece no usuário do pooler (postgres.<ref>).
if ($ExpectRef -and ($url -notlike "*$ExpectRef*")) {
  throw "Alvo nao contem o ref esperado '$ExpectRef' (host=$hostname user=$user). Nada foi feito."
}

if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$pubFile  = "${ts}_public.dump"
$authFile = "${ts}_auth.dump"
$metaFile = Join-Path $OutDir "${ts}_META.txt"

Write-Host "Servidor : $hostname (sessão :$port) / db=$db / user=$user"
Write-Host "Destino  : $OutDir"
Write-Host ""

$common = @('--rm', '-v', "${OutDir}:/backup", '-e', "PGPASSWORD=$pass", 'postgres:17')

# 1) public — completo (-Fc custom), sem dono/ACL para restaurar em qualquer alvo
Write-Host "==> dump do schema public..."
docker run @common pg_dump -h $hostname -p $port -U $user -d $db `
  --no-owner --no-acl -Fc -n public -f "/backup/$pubFile"
if ($LASTEXITCODE -ne 0) { throw "pg_dump (public) falhou." }

# 2) auth — só DADOS de users e identities
Write-Host "==> dump dos logins (auth.users, auth.identities)..."
docker run @common pg_dump -h $hostname -p $port -U $user -d $db `
  --no-owner --no-acl -Fc --data-only -t auth.users -t auth.identities -f "/backup/$authFile"
if ($LASTEXITCODE -ne 0) { throw "pg_dump (auth) falhou." }

# META
"server_version=17.6"                         | Out-File -Encoding utf8 $metaFile
"auth_schema_migrations=20260625000000"       | Out-File -Encoding utf8 -Append $metaFile
"gerado_em=$ts"                               | Out-File -Encoding utf8 -Append $metaFile

Write-Host ""
Write-Host "OK. Arquivos:"
Get-ChildItem $OutDir -Filter "${ts}_*" | ForEach-Object {
  "  {0}  ({1:N0} bytes)" -f $_.Name, $_.Length | Write-Host
}
Write-Host ""
Write-Host "LEMBRETE: valide com restore-test.ps1 ANTES de confiar. Combine um"
Write-Host "prazo para apagar estes arquivos depois que a limpeza das contas"
Write-Host "estiver concluída e validada."
