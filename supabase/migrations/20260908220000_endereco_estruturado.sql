-- ============================================================================
-- ENDEREÇO ESTRUTURADO em party_events e clients
--
-- HOJE: uma coluna `address` de texto livre. O resultado real em produção:
--   "Av.Paulista407 Celvia - Vespasiano"
--   "Av Paulista"                          <- sem número, sem bairro
--   "Rua Bahia 407 Vespasiano"
-- Nenhum dos 20 endereços gravados tem CEP. A decoradora precisa disso
-- estruturado para se deslocar até o local da montagem.
--
-- REGRA FIRME DESTA MIGRAÇÃO: **NÃO CONVERTE NADA**.
-- Sem backfill, sem tentativa de separar o texto antigo em campos. Endereço
-- inventado é pior que endereço bagunçado, porque parece confiável — e não há
-- como derivar CEP e bairro de "Av Paulista" sem chutar. Os 20 registros antigos
-- ficam exatamente como estão e continuam sendo exibidos do jeito que são hoje.
--
-- `address` PERMANECE, e não é depreciada: é o fallback de exibição. As telas
-- leem os campos novos quando existem e caem no `address` quando não existem.
-- Só o que for criado daqui em diante usa os campos estruturados.
--
-- Colunas separadas, e não um jsonb: são campos que se vai querer filtrar e
-- ordenar ("todos os eventos em Vespasiano"), e JSON tira isso sem devolver
-- nada em troca.
--
-- NULLABLE no banco, obrigatório na TELA. O banco tem de aceitar as 20 linhas
-- antigas sem endereço estruturado; quem exige os seis campos é o formulário,
-- para o que é novo. NOT NULL aqui exigiria inventar valor para o passado.
--
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK explícito.
-- ============================================================================

-- ---------- party_events: o endereço DA MONTAGEM ----------
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS cep         varchar(9);
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS logradouro  text;
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS numero      varchar(20);
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS bairro      text;
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS cidade      text;
ALTER TABLE public.party_events ADD COLUMN IF NOT EXISTS estado      char(2);

-- ---------- clients: o endereço de cadastro da cliente ----------
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cep         varchar(9);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logradouro  text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS numero      varchar(20);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS complemento text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS bairro      text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cidade      text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS estado      char(2);

-- ---------- FORMATO ----------
-- Só valida o que FOI preenchido: NULL passa, porque as linhas antigas não têm.
-- CEP guardado COM máscara (00000-000), que é como a pessoa lê e como o ViaCEP
-- devolve. Guardar sem máscara obrigaria a formatar em toda exibição.
ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_cep_formato;
ALTER TABLE public.party_events ADD CONSTRAINT party_events_cep_formato
  CHECK (cep IS NULL OR cep ~ '^[0-9]{5}-[0-9]{3}$');

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_cep_formato;
ALTER TABLE public.clients ADD CONSTRAINT clients_cep_formato
  CHECK (cep IS NULL OR cep ~ '^[0-9]{5}-[0-9]{3}$');

-- UF em maiúsculas, duas letras. Mesmo critério: NULL passa.
ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_estado_formato;
ALTER TABLE public.party_events ADD CONSTRAINT party_events_estado_formato
  CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$');

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_estado_formato;
ALTER TABLE public.clients ADD CONSTRAINT clients_estado_formato
  CHECK (estado IS NULL OR estado ~ '^[A-Z]{2}$');

-- ---------- ÍNDICE ----------
-- A consulta que motiva a estruturação é "onde vou montar esta semana".
-- Parcial: só as linhas que já têm cidade — hoje, nenhuma.
CREATE INDEX IF NOT EXISTS idx_party_events_cidade
  ON public.party_events (cidade) WHERE cidade IS NOT NULL;

-- ---------- GRANTS ----------
-- Colunas em tabela existente herdam os grants da tabela; nada de novo a
-- REVOGAR. Registrado para a conferência não ficar em aberto na revisão.

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas iniciadas por dois traços):
--   DROP INDEX IF EXISTS idx_party_events_cidade;
--   ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_cep_formato;
--   ALTER TABLE public.party_events DROP CONSTRAINT IF EXISTS party_events_estado_formato;
--   ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_cep_formato;
--   ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_estado_formato;
--   ALTER TABLE public.party_events DROP COLUMN IF EXISTS cep, DROP COLUMN IF EXISTS logradouro,
--     DROP COLUMN IF EXISTS numero, DROP COLUMN IF EXISTS complemento,
--     DROP COLUMN IF EXISTS bairro, DROP COLUMN IF EXISTS cidade, DROP COLUMN IF EXISTS estado;
--   ALTER TABLE public.clients DROP COLUMN IF EXISTS cep, DROP COLUMN IF EXISTS logradouro,
--     DROP COLUMN IF EXISTS numero, DROP COLUMN IF EXISTS complemento,
--     DROP COLUMN IF EXISTS bairro, DROP COLUMN IF EXISTS cidade, DROP COLUMN IF EXISTS estado;
-- Nenhum dado é perdido no rollback: as colunas novas só têm o que for criado
-- depois da migração, e `address` nunca foi tocada.
-- ============================================================================
