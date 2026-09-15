-- ============================================================================
-- LINK DE ALUGUEL em party_events
--
-- HOJE: todo link enviado à cliente é de DECORAÇÃO — a decoradora monta a festa
-- no endereço da cliente, na data do evento.
--
-- NOVO: ao gerar o link, a decoradora escolhe DECORAÇÃO ou ALUGUEL. No aluguel,
-- a cliente leva o kit/peça e devolve depois, e é a DECORADORA quem define, ao
-- gerar o link, a data e hora de RETIRADA e de DEVOLUÇÃO. A cliente vê esses
-- horários (não edita) e, depois de enviar o formulário, o resumo mostra quando
-- retirar e quando devolver. O formulário da cliente é o mesmo nos dois casos,
-- e a data do evento continua sendo preenchida por ela.
--
-- DEPOIS DE "CONFIRMADO": retirada e devolução entram no Calendário, e a peça ou
-- kit fica bloqueada no Acervo durante TODO o período retirada → devolução —
-- não só no dia do evento. As duas regras são de código; esta migração só guarda
-- os dados de que elas precisam.
--
-- REGRA FIRME DESTA MIGRAÇÃO: **NÃO CONVERTE NADA**. Toda linha existente vira
-- 'decoracao', que é exatamente o que ela é hoje. Nenhuma data é inventada.
--
-- DATA E HORA num timestamptz só (e não date + time separados): a pergunta que
-- o sistema faz é "a peça está fora entre estes dois instantes?", e isso é uma
-- comparação de instantes. O app grava e lê no fuso America/Sao_Paulo (-03:00
-- fixo, sem horário de verão), o mesmo critério da finalização automática.
--
-- Nomes em português, como na migração do endereço estruturado.
--
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK explícito.
-- ============================================================================

-- ---------- tipo do link ----------
-- NOT NULL com DEFAULT constante: no Postgres 11+ isto é só metadado — não
-- reescreve a tabela e as linhas existentes já nascem 'decoracao'.
ALTER TABLE public.party_events
  ADD COLUMN IF NOT EXISTS tipo_link text NOT NULL DEFAULT 'decoracao';

ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_tipo_link_valido;
ALTER TABLE public.party_events ADD CONSTRAINT party_events_tipo_link_valido
  CHECK (tipo_link IN ('decoracao', 'aluguel'));

-- ---------- retirada e devolução (só no aluguel) ----------
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS retirada_em  timestamptz;
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS devolucao_em timestamptz;

-- A regra inteira no banco, e não só na tela: um POST direto não passa pelo
-- formulário. Aluguel tem as DUAS datas, com a devolução depois da retirada;
-- decoração não tem NENHUMA. Linhas existentes (decoração, sem datas) passam.
ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_aluguel_periodo;
ALTER TABLE public.party_events ADD CONSTRAINT party_events_aluguel_periodo
  CHECK (
    (tipo_link = 'decoracao' AND retirada_em IS NULL AND devolucao_em IS NULL)
    OR
    (tipo_link = 'aluguel' AND retirada_em IS NOT NULL AND devolucao_em IS NOT NULL
      AND devolucao_em > retirada_em)
  );

-- ---------- ÍNDICE ----------
-- As duas consultas novas são por período, da mesma decoradora: "o que retira
-- ou devolve este mês" (Calendário) e "esta peça está fora entre X e Y" (Acervo).
-- Parcial: só aluguel — hoje, nenhuma linha.
CREATE INDEX IF NOT EXISTS idx_party_events_aluguel_periodo
  ON public.party_events (decorator_id, retirada_em, devolucao_em)
  WHERE tipo_link = 'aluguel';

-- ---------- GRANTS / RLS ----------
-- Colunas em tabela existente herdam os grants e as policies de party_events;
-- nada de novo a REVOGAR. Registrado para a conferência não ficar em aberto.

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas iniciadas por dois traços):
--   DROP INDEX IF EXISTS idx_party_events_aluguel_periodo;
--   ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_aluguel_periodo;
--   ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_tipo_link_valido;
--   ALTER TABLE public.party_events DROP COLUMN IF EXISTS devolucao_em,
--     DROP COLUMN IF EXISTS retirada_em, DROP COLUMN IF EXISTS tipo_link;
-- Perda no rollback: SÓ o tipo e as datas dos links de aluguel criados depois
-- da migração (eles voltariam a parecer links de decoração). Nenhuma coluna
-- antiga é tocada.
-- ============================================================================
