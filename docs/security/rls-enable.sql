-- ============================================================================
-- RLS — defesa em profundidade (Item 6)  ·  PROPOSTA — NÃO APLICAR AINDA
-- ============================================================================
-- Contexto:
--   * O app acessa o banco via Prisma, que conecta como `postgres` (dono das
--     tabelas). DONO DE TABELA IGNORA RLS quando NÃO se usa FORCE. Portanto
--     este script NÃO afeta o caminho do app (Prisma). Ele só passa a valer
--     para os roles `anon` e `authenticated` (caminho PostgREST/supabase-js),
--     que hoje o app NÃO usa para ler tabelas (só usa para Auth).
--   * Hoje `anon`/`authenticated` já recebem 401 (sem GRANT nas tabelas). Este
--     RLS é a 2ª camada: se um dia alguém der GRANT a esses roles por engano,
--     as linhas continuam isoladas por auth.uid().
--
-- REGRA DE OURO: usar ENABLE, NUNCA FORCE. Com FORCE, o próprio Prisma
--   (postgres) passaria a ser filtrado por auth.uid() — que é NULL na conexão
--   do Prisma — e TODAS as queries voltariam vazias (app quebra por completo).
--
-- Identidade: decorator.id == auth.uid() (mesmo UUID do Supabase Auth).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CANÁRIO: aplique PRIMEIRO só nesta tabela e valide (ver rls-plan.md) antes
-- de rodar o resto. Se algo der errado, o rollback é imediato.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;   -- (sem FORCE)
DROP POLICY IF EXISTS clients_own ON public.clients;
CREATE POLICY clients_own ON public.clients
  FOR ALL TO authenticated
  USING (decorator_id = auth.uid())
  WITH CHECK (decorator_id = auth.uid());

-- ===========================================================================
-- RESTANTE — só rode depois que o canário passar em todas as validações.
-- ===========================================================================

-- decorators: cada um só enxerga/edita a própria linha pelo PostgREST.
ALTER TABLE public.decorators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS decorators_own ON public.decorators;
CREATE POLICY decorators_own ON public.decorators
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- inventory_items: acervo próprio. (O feed público é servido via Prisma, que
-- ignora RLS — não precisa de policy pública aqui.)
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_own ON public.inventory_items;
CREATE POLICY inventory_own ON public.inventory_items
  FOR ALL TO authenticated
  USING (decorator_id = auth.uid())
  WITH CHECK (decorator_id = auth.uid());

-- kits
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kits_own ON public.kits;
CREATE POLICY kits_own ON public.kits
  FOR ALL TO authenticated
  USING (decorator_id = auth.uid())
  WITH CHECK (decorator_id = auth.uid());

-- party_events
ALTER TABLE public.party_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS party_events_own ON public.party_events;
CREATE POLICY party_events_own ON public.party_events
  FOR ALL TO authenticated
  USING (decorator_id = auth.uid())
  WITH CHECK (decorator_id = auth.uid());

-- consumables
ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consumables_own ON public.consumables;
CREATE POLICY consumables_own ON public.consumables
  FOR ALL TO authenticated
  USING (decorator_id = auth.uid())
  WITH CHECK (decorator_id = auth.uid());

-- forum_posts: autor só mexe no próprio post.
ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forum_posts_own ON public.forum_posts;
CREATE POLICY forum_posts_own ON public.forum_posts
  FOR ALL TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- rental_orders: relação B2B — vale para DONO ou LOCATÁRIO (os dois lados).
ALTER TABLE public.rental_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rental_orders_party ON public.rental_orders;
CREATE POLICY rental_orders_party ON public.rental_orders
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR renter_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR renter_id = auth.uid());

-- rental_order_items: acompanha a ordem a que pertence.
ALTER TABLE public.rental_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rental_order_items_party ON public.rental_order_items;
CREATE POLICY rental_order_items_party ON public.rental_order_items
  FOR ALL TO authenticated
  USING (order_id IN (
    SELECT id FROM public.rental_orders
    WHERE owner_id = auth.uid() OR renter_id = auth.uid()
  ))
  WITH CHECK (order_id IN (
    SELECT id FROM public.rental_orders
    WHERE owner_id = auth.uid() OR renter_id = auth.uid()
  ));

-- chat_messages: só quem participa (remetente OU destinatário).
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_party ON public.chat_messages;
CREATE POLICY chat_messages_party ON public.chat_messages
  FOR ALL TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Nota: NENHUMA policy é criada para o role `anon` — ou seja, anônimo não lê
-- nada por PostgREST (que era o comportamento já observado). O link público de
-- orçamento continua funcionando porque é servido por rota Next via Prisma.
