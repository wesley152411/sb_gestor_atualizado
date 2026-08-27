-- ============================================================================
-- ROLLBACK do RLS (Item 6)  ·  reverte rls-enable.sql
-- ============================================================================
-- Reversão é IMEDIATA e NÃO altera dado nenhum (só liga/desliga a checagem e
-- remove as policies). Como o app usa Prisma (dono, ignora RLS), nem o enable
-- nem o disable mudam o comportamento do app — este rollback existe para
-- limpar o estado caso a revisão decida não seguir.
-- ============================================================================

DROP POLICY IF EXISTS clients_own            ON public.clients;
DROP POLICY IF EXISTS decorators_own         ON public.decorators;
DROP POLICY IF EXISTS inventory_own          ON public.inventory_items;
DROP POLICY IF EXISTS kits_own               ON public.kits;
DROP POLICY IF EXISTS party_events_own       ON public.party_events;
DROP POLICY IF EXISTS consumables_own        ON public.consumables;
DROP POLICY IF EXISTS forum_posts_own        ON public.forum_posts;
DROP POLICY IF EXISTS rental_orders_party    ON public.rental_orders;
DROP POLICY IF EXISTS rental_order_items_party ON public.rental_order_items;
DROP POLICY IF EXISTS chat_messages_party    ON public.chat_messages;

ALTER TABLE public.clients            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.decorators         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kits               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_events       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumables        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_posts        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_orders      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      DISABLE ROW LEVEL SECURITY;

-- Canário isolado (se só o canário foi aplicado):
-- DROP POLICY IF EXISTS clients_own ON public.clients;
-- ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;

-- 11ª tabela — client_promo_messages: NÃO entra na lista acima porque seu RLS
-- nasce com a tabela (migração 20260824000100). "Rollback" dela = reverter a
-- migração (dropar a tabela). Se quiser só desligar o RLS mantendo a tabela:
-- DROP POLICY IF EXISTS client_promo_messages_own ON public.client_promo_messages;
-- ALTER TABLE public.client_promo_messages DISABLE ROW LEVEL SECURITY;
