-- ============================================================================
-- BATIMENTO DOS JOBS
--
-- Uma linha por job, sobrescrita a cada execução. Existe para responder à
-- pergunta que derrubou o cron anterior: "ele ainda está rodando?".
--
-- O e-mail de falha do GitHub Actions cobre "rodou e deu erro". NÃO cobre
-- "deixou de rodar" — workflow desabilitado, arquivo renomeado, ou a regra do
-- GitHub que suspende agendamentos após 60 dias sem atividade no repositório.
-- Nesses casos não há falha, há AUSÊNCIA, e ausência não dispara nada.
--
-- Por isso o batimento fica no BANCO e o app o mostra: o vigia é a tela que
-- Wesley abre todo dia, não outro processo que também pode morrer calado.
--
-- Tabela nova nasce com os grants default do Supabase → REVOKE (baseline do
-- projeto). RLS ligado sem policy: não tem dono na aplicação, é estado interno.
--
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_execucoes (
  -- Nome do job. PK: uma linha por job, sobrescrita — não é histórico, é estado.
  id                  text PRIMARY KEY,
  ultima_execucao     timestamptz NOT NULL DEFAULT now(),
  -- Último resultado. 'ok' | 'erro' — o texto do erro fica em detalhe.
  ultimo_resultado    text NOT NULL DEFAULT 'ok',
  detalhe             text,
  -- Quantas assinaturas estavam com valor divergente na última passada. Maior
  -- que zero por vários ciclos é dinheiro errado, e vira falha de CI.
  divergencias        integer NOT NULL DEFAULT 0,
  -- Contadores da última passada, para o log e para a faixa do dashboard.
  processadas         integer NOT NULL DEFAULT 0,
  duracao_ms          integer NOT NULL DEFAULT 0,

  CONSTRAINT job_execucoes_resultado_check CHECK (ultimo_resultado IN ('ok', 'erro'))
);

ALTER TABLE public.job_execucoes ENABLE ROW LEVEL SECURITY;
-- SEM policy: estado interno de operação, não pertence a nenhuma decoradora.
REVOKE ALL ON public.job_execucoes FROM anon, authenticated;

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas iniciadas por dois traços):
--   DROP TABLE IF EXISTS public.job_execucoes;
-- ============================================================================
