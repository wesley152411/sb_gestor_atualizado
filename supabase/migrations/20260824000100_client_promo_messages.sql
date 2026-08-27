-- Reativação promocional por WhatsApp: template no perfil + histórico de envios.
-- Aplicar nos DOIS bancos (teste e produção). Idempotente.

-- 1. Template da mensagem promocional no perfil da decoradora (variável {nome}).
ALTER TABLE public.decorators ADD COLUMN IF NOT EXISTS promo_message_template text;

-- 2. Histórico de mensagens promocionais ABERTAS no WhatsApp (1 linha por clique
--    em Enviar; histórico completo, não só a última).
CREATE TABLE IF NOT EXISTS public.client_promo_messages (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  client_id    text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  decorator_id text NOT NULL REFERENCES public.decorators(id) ON DELETE CASCADE,
  sent_at      timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  phone        text NOT NULL,
  message      text NOT NULL
);
-- O GET filtra por decorator_id e ordena por sent_at DESC → índice composto serve
-- o filtro e a ordenação de uma vez. O de client_id atende consultas por cliente
-- e a FK. DROP do índice antigo de coluna única (idx_promo_decorator, versão
-- inicial da migração) ANTES dos CREATE, para o arquivo convergir ao mesmo estado
-- em qualquer banco — rodou a versão antiga ou não. Idempotente.
DROP INDEX IF EXISTS public.idx_promo_decorator;
CREATE INDEX IF NOT EXISTS idx_promo_decorator_sent ON public.client_promo_messages (decorator_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_client         ON public.client_promo_messages (client_id);

-- 3. RLS no MESMO padrão das outras tabelas (ENABLE, policy própria, auth.uid()::text
--    porque as colunas de id são text). O caminho Prisma (owner) segue passando;
--    a policy protege o caminho PostgREST anon/authenticated.
ALTER TABLE public.client_promo_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_promo_messages_own ON public.client_promo_messages;
CREATE POLICY client_promo_messages_own ON public.client_promo_messages
  FOR ALL TO authenticated
  USING ((decorator_id = (auth.uid())::text))
  WITH CHECK ((decorator_id = (auth.uid())::text));

-- 4. GRANTS: alinha ao baseline das outras 10 tabelas, que NÃO têm grant para
--    anon/authenticated (o PostgREST nega antes mesmo da RLS — defesa em camadas).
--    Toda tabela nova de public nasce com os grants DEFAULT do Supabase (ALTER
--    DEFAULT PRIVILEGES concede tudo a anon/authenticated). Sem revogar, a tabela
--    fica acessível a anon/authenticated no PostgREST, protegida SÓ pela policy —
--    a camada de grant fica faltando. Idempotente. (service_role não é tocado.)
REVOKE ALL ON public.client_promo_messages FROM anon, authenticated;
