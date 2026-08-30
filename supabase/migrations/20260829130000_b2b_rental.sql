-- Locação B2B: estende rental_orders (retirada/devolução/returned_at) + RLS de
-- DUAS DONAS (primeira tabela do sistema com duas partes). Sem tabela nova.
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK.

-- 1) Colunas novas (aditivo, idempotente). Mantém event_date (legado) por ora.
ALTER TABLE public.rental_orders ADD COLUMN IF NOT EXISTS pickup_date date;
ALTER TABLE public.rental_orders ADD COLUMN IF NOT EXISTS return_date date;
ALTER TABLE public.rental_orders ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- 2) Backfill dos pedidos legados: retirada = devolução = event_date.
UPDATE public.rental_orders SET pickup_date = event_date, return_date = event_date
  WHERE pickup_date IS NULL AND event_date IS NOT NULL;

-- 3) Status legado ('Pendente', pré-B2B) → 'cancelado' (NÃO 'ativo': viraria reserva
--    fantasma — auditoria achou 1 pedido de teste com data futura). Cancelado
--    preserva o histórico e não reserva. Novas locações nascem 'ativo' na criação.
UPDATE public.rental_orders SET status = 'cancelado'
  WHERE status IS NULL OR status NOT IN ('ativo','devolvido','cancelado');

-- 4) RLS de rental_orders — substitui o rental_orders_party (FOR ALL) por policies
--    separadas por comando. Leitura: as duas partes. Escrita: assimétrica.
DROP POLICY IF EXISTS rental_orders_party         ON public.rental_orders;
DROP POLICY IF EXISTS rental_orders_select        ON public.rental_orders;
DROP POLICY IF EXISTS rental_orders_insert        ON public.rental_orders;
DROP POLICY IF EXISTS rental_orders_update        ON public.rental_orders;
DROP POLICY IF EXISTS rental_orders_renter_cancel ON public.rental_orders;

-- Leitura: locadora OU locatária.
CREATE POLICY rental_orders_select ON public.rental_orders
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid()::text OR renter_id = auth.uid()::text);

-- Criação: só a LOCATÁRIA cria a própria locação.
CREATE POLICY rental_orders_insert ON public.rental_orders
  FOR INSERT TO authenticated
  WITH CHECK (renter_id = auth.uid()::text);

-- Alteração (marcar devolvido / cancelar a qualquer momento): só a LOCADORA.
CREATE POLICY rental_orders_update ON public.rental_orders
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()::text)
  WITH CHECK (owner_id = auth.uid()::text);

-- Cancelamento pela LOCATÁRIA: só ativo→cancelado e só com retirada FUTURA.
-- (Row-level. O "só o status muda, nada de datas/itens" é garantido no handler.)
CREATE POLICY rental_orders_renter_cancel ON public.rental_orders
  FOR UPDATE TO authenticated
  USING      (renter_id = auth.uid()::text AND status = 'ativo'     AND pickup_date > current_date)
  WITH CHECK (renter_id = auth.uid()::text AND status = 'cancelado' AND pickup_date > current_date);

-- 5) RLS dos itens — acompanham a ordem, com a mesma assimetria de escrita.
DROP POLICY IF EXISTS rental_order_items_party  ON public.rental_order_items;
DROP POLICY IF EXISTS rental_order_items_select ON public.rental_order_items;
DROP POLICY IF EXISTS rental_order_items_insert ON public.rental_order_items;

CREATE POLICY rental_order_items_select ON public.rental_order_items
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM public.rental_orders
                      WHERE owner_id = auth.uid()::text OR renter_id = auth.uid()::text));

CREATE POLICY rental_order_items_insert ON public.rental_order_items
  FOR INSERT TO authenticated
  WITH CHECK (order_id IN (SELECT id FROM public.rental_orders
                           WHERE renter_id = auth.uid()::text));

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas `--`; copie para reverter):
--   DROP POLICY IF EXISTS rental_orders_select        ON public.rental_orders;
--   DROP POLICY IF EXISTS rental_orders_insert        ON public.rental_orders;
--   DROP POLICY IF EXISTS rental_orders_update        ON public.rental_orders;
--   DROP POLICY IF EXISTS rental_orders_renter_cancel ON public.rental_orders;
--   DROP POLICY IF EXISTS rental_order_items_select   ON public.rental_order_items;
--   DROP POLICY IF EXISTS rental_order_items_insert   ON public.rental_order_items;
--   CREATE POLICY rental_orders_party ON public.rental_orders FOR ALL TO authenticated
--     USING (owner_id = auth.uid()::text OR renter_id = auth.uid()::text)
--     WITH CHECK (owner_id = auth.uid()::text OR renter_id = auth.uid()::text);
--   CREATE POLICY rental_order_items_party ON public.rental_order_items FOR ALL TO authenticated
--     USING (order_id IN (SELECT id FROM public.rental_orders WHERE owner_id = auth.uid()::text OR renter_id = auth.uid()::text))
--     WITH CHECK (order_id IN (SELECT id FROM public.rental_orders WHERE owner_id = auth.uid()::text OR renter_id = auth.uid()::text));
--   ALTER TABLE public.rental_orders DROP COLUMN IF EXISTS returned_at;
--   ALTER TABLE public.rental_orders DROP COLUMN IF EXISTS return_date;
--   ALTER TABLE public.rental_orders DROP COLUMN IF EXISTS pickup_date;
-- (o status legado normalizado para 'cancelado' NÃO é revertido — era dado de teste.)
-- ============================================================================
