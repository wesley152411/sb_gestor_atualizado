# ============================================================================
# restore-test.ps1  —  prova que o dump RESTAURA (senão "backup" é fé, não fato).
# ============================================================================
# Sobe um Postgres 17 DESCARTÁVEL em container local (só localhost, nunca
# exposto), restaura o dump do `public`, confere a contagem de linhas por tabela
# e DESTRÓI o container no fim. Não toca o banco de produção.
#
# Obs.: NÃO usamos ErrorActionPreference=Stop porque, no PowerShell 5.1,
# redirecionar o stderr de um .exe nativo (docker) vira ErrorRecord e abortaria
# em mensagens benignas. Conferimos os passos críticos pelo $LASTEXITCODE.
# ============================================================================
param(
  [Parameter(Mandatory=$true)][string]$PublicDump,   # caminho do <ts>_public.dump
  [int]$Port = 55432
)
$dir = Split-Path -Parent (Resolve-Path $PublicDump)
$file = Split-Path -Leaf $PublicDump
$name = 'sbgestor-restore-test'

# pré-limpeza: só remove se existir (evita erro em container inexistente)
$existing = docker ps -aq -f "name=^$name$"
if ($existing) { docker rm -f $name | Out-Null }

Write-Host "==> subindo Postgres 17 descartavel (porta $Port, so localhost)..."
docker run -d --name $name -e POSTGRES_PASSWORD=throwaway `
  -p "127.0.0.1:${Port}:5432" -v "${dir}:/backup" postgres:17 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Falha ao subir o container de teste." }

Write-Host "==> aguardando o banco ficar pronto..."
$ok = $false
foreach ($i in 1..30) {
  docker exec $name pg_isready -U postgres *> $null
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ok) { docker rm -f $name | Out-Null; throw "Postgres do teste nao subiu." }

Write-Host "==> restaurando $file ..."
docker exec $name pg_restore -U postgres -d postgres --no-owner --no-acl -n public "/backup/$file" *> $null
# pg_restore pode retornar !=0 por warnings benignos; a prova real e a contagem abaixo.

Write-Host ""
Write-Host "==> contagem de linhas restauradas (public):"
$tables = 'decorators','clients','party_events','inventory_items','kits',
          'rental_orders','rental_order_items','chat_messages','consumables','forum_posts'
foreach ($t in $tables) {
  $n = (docker exec $name psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.$t").Trim()
  "  {0,-20} {1}" -f $t, $n | Write-Host
}

Write-Host ""
Write-Host "==> destruindo o container de teste..."
docker rm -f $name | Out-Null
Write-Host "OK. Compare os numeros acima com a producao. Se baterem, o dump restaura."
