-- Migração: ciclo de vida do PartyEvent (5 status) + coluna submitted_at.
-- Rodar UMA vez em produção ANTES de subir o código novo (senão INSERT com os
-- status novos viola a CHECK constraint antiga). Idempotente e seguro.
--
-- Estado antes: status IN ('Pendente','Confirmado','Finalizado'); 34 Pendente.

-- coluna do "enviado em" (já pode ter sido adicionada; IF NOT EXISTS por segurança)
ALTER TABLE party_events ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

-- 1. remove a constraint antiga (só aceitava Pendente/Confirmado/Finalizado)
ALTER TABLE party_events DROP CONSTRAINT IF EXISTS party_events_status_check;

-- 2. migra os registros existentes
--    Pendente sem cliente  -> rascunho de link não preenchido
UPDATE party_events SET status='Aguardando preenchimento'
  WHERE status='Pendente' AND (client_name IS NULL OR btrim(client_name)='');
--    Pendente com dados    -> aguardando a decoradora confirmar
UPDATE party_events SET status='Aguardando confirmação'
  WHERE status='Pendente' AND client_name IS NOT NULL AND btrim(client_name)<>'';
--    rascunhos nunca têm "enviado em"
UPDATE party_events SET submitted_at=NULL WHERE status='Aguardando preenchimento';

-- 3. recria a constraint com os 5 status novos (NULL segue permitido)
ALTER TABLE party_events ADD CONSTRAINT party_events_status_check
  CHECK (status IN ('Aguardando preenchimento','Aguardando confirmação','Confirmado','Finalizado','Cancelado'));
