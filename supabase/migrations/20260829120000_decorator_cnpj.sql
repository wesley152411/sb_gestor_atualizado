-- Move CNPJ e company_name do raw_user_meta_data (auth.users) para colunas em
-- public.decorators. Motivo: queryável para cobrança/NF (Mercado Pago) e coberto
-- pela cascata de exclusão (§3 do inventário) — em vez de ficar num canto do Auth
-- que ninguém consulta. Aditiva e idempotente. Inclui backfill do que já existe.
--
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK (regra de sempre).

-- 1) Colunas novas.
ALTER TABLE public.decorators ADD COLUMN IF NOT EXISTS cnpj         text;
ALTER TABLE public.decorators ADD COLUMN IF NOT EXISTS company_name text;

-- 2) Backfill do company_name (string, seguro). CNPJ NÃO é backfillado de
--    propósito: auditoria em 2026-08-29 mostrou que os 3 CNPJs no metadata são
--    TODOS inválidos (dígito verificador/sequência repetida). Copiar valor inválido
--    é pior que nulo — parece confiável e não é. Cada conta preenche um CNPJ VÁLIDO
--    via cadastro (novas) ou Configurações (existentes). decorators.id text; auth uuid → cast.
UPDATE public.decorators d
SET company_name = COALESCE(d.company_name, NULLIF(u.raw_user_meta_data->>'company_name', ''))
FROM auth.users u
WHERE u.id = d.id::uuid
  AND d.company_name IS NULL;

-- ============================================================================
-- ROLLBACK (comentado — apply-sql.cjs ignora linhas `--`, então não roda daqui;
-- copie para rodar manualmente se precisar reverter). Só remove as colunas; o
-- dado original continua intacto no raw_user_meta_data do Auth.
--   ALTER TABLE public.decorators DROP COLUMN IF EXISTS company_name;
--   ALTER TABLE public.decorators DROP COLUMN IF EXISTS cnpj;
-- ============================================================================
