-- Aceite de Política de Privacidade / Termos de Uso: registro IMUTÁVEL (quem,
-- quando, versão, hash do conteúdo, IP) + coluna de pedido de exclusão (saída da
-- recusa no gate). Tabela nova nasce com grants default do Supabase → REVOKE
-- (baseline de defesa em camadas). RLS: lê/insere só o PRÓPRIO; sem UPDATE/DELETE
-- (um aceite não se altera). auth.uid()::text porque os ids são text.
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK.

-- 1) Registro de aceites.
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decorator_id  text NOT NULL REFERENCES public.decorators(id) ON DELETE CASCADE,
  document      text NOT NULL,          -- 'privacy' | 'terms'
  version       text NOT NULL,          -- da frontmatter do doc (ex.: '1')
  content_hash  text NOT NULL,          -- SHA-256 do conteúdo aceito (prova exata)
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  ip            text,                   -- capturado no SERVIDOR
  user_agent    text,
  context       text NOT NULL DEFAULT 'signup'  -- 'signup' | 'retroactive' | 'reaccept'
);
CREATE INDEX IF NOT EXISTS idx_legal_acc_lookup ON public.legal_acceptances (decorator_id, document, version);

-- 2) RLS: próprio, imutável.
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_acc_select_own ON public.legal_acceptances;
DROP POLICY IF EXISTS legal_acc_insert_own ON public.legal_acceptances;
CREATE POLICY legal_acc_select_own ON public.legal_acceptances
  FOR SELECT TO authenticated USING (decorator_id = auth.uid()::text);
CREATE POLICY legal_acc_insert_own ON public.legal_acceptances
  FOR INSERT TO authenticated WITH CHECK (decorator_id = auth.uid()::text);
-- sem policy de UPDATE/DELETE → ninguém altera/apaga via PostgREST

-- 3) Grants ao baseline das outras tabelas (anon/authenticated sem acesso PostgREST).
REVOKE ALL ON public.legal_acceptances FROM anon, authenticated;

-- 4) Saída da recusa no gate: pedido de exclusão registrado (processado por Wesley
--    via scripts/delete-decorator.cjs; listado por scripts/pending-deletions.cjs).
ALTER TABLE public.decorators ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_decorators_deletion_requested
  ON public.decorators (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas `--`):
--   DROP POLICY IF EXISTS legal_acc_select_own ON public.legal_acceptances;
--   DROP POLICY IF EXISTS legal_acc_insert_own ON public.legal_acceptances;
--   DROP TABLE IF EXISTS public.legal_acceptances;
--   ALTER TABLE public.decorators DROP COLUMN IF EXISTS deletion_requested_at;
-- ============================================================================
