-- Coluna is_internal em decorators.
-- Aditiva e retrocompatível: NOT NULL com DEFAULT false, então o app já
-- deployado (que não conhece a coluna) continua funcionando; e nenhuma linha
-- existente vira interna por acidente.
--
-- Aplicar UMA vez no banco (SQL editor do Supabase ou `prisma db execute`).
-- A flag só pode ser ligada por UPDATE direto no banco — nenhuma rota escreve.

ALTER TABLE public.decorators
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- Para marcar a conta de teste interna (exemplo — trocar pelo id real):
-- UPDATE public.decorators SET is_internal = true WHERE id = '<uuid-da-conta-de-teste>';
