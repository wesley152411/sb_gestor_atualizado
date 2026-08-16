# ============================================================================
# restore-test.ps1  —  prova que o dump RESTAURA (senão "backup" é fé, não fato).
# ============================================================================
# Sobe um Postgres 17 DESCARTÁVEL em container local (só localhost, nunca
# exposto), restaura o dump do `public`, confere a contagem de linhas por tabela
# e DESTRÓI o container no fim. Não toca o banco de produção.
# ============================================================================
param(
  [Parameter(Mandatory=$true)][string]$PublicDump,   # caminho do <ts>_public.dump
  [int]$Port = 55432
)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent (Resolve-Path $PublicDump)
$file = Split-Path -Leaf $PublicDump
$name = 'sbgestor-restore-test'

Write-Host "==> subindo Postgres 17 descartável (porta $Port, só localhost)..."
docker rm -f $name 2>$null | Out-Null
docker run -d --name $name -e POSTGRES_PASSWORD=throwaway `
  -p "127.0.0.1:${Port}:5432" -v "${dir}:/backup" postgres:17 | Out-Null

Write-Host "==> aguardando o banco ficar pronto..."
$ok = $false
foreach ($i in 1..30) {
  docker exec $name pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ok = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ok) { docker rm -f $name | Out-Null; throw "Postgres do teste não subiu." }

Write-Host "==> restaurando $file ..."
docker exec $name pg_restore -U postgres -d postgres --no-owner --no-acl -n public "/backup/$file"
# pg_restore pode retornar !=0 por warnings benignos; conferimos pelos dados abaixo.

Write-Host ""
Write-Host "==> contagem de linhas restauradas (public):"
$tables = 'decorators','clients','party_events','inventory_items','kits',
          'rental_orders','rental_order_items','chat_messages','consumables','forum_posts'
foreach ($t in $tables) {
  $n = docker exec $name psql -U postgres -d postgres -tAc "SELECT count(*) FROM public.$t" 2>$null
  "  {0,-20} {1}" -f $t, ($n).Trim() | Write-Host
}

Write-Host ""
Write-Host "==> destruindo o container de teste..."
docker rm -f $name | Out-Null
Write-Host "OK. Compare os números acima com a produção. Se baterem, o dump restaura."
