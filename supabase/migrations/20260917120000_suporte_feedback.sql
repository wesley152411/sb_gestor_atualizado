-- Aba Suporte: o que a decoradora escreve de volta para nós — avaliação por
-- carinha, opinião livre ("o que podemos melhorar") e interesse no assistente
-- de IA que ainda não existe. UMA tabela para os três: são a mesma coisa (um
-- recado dela, com data e autoria), e três tabelas com duas colunas cada só
-- dariam três lugares para esquecer de olhar.
--
-- POR QUE GRAVAR, e não abrir o e-mail: um formulário que só monta um mailto
-- perde tudo que a pessoa escreveu se ela não tiver cliente de e-mail
-- configurado — e, no celular, a maioria não tem. O card de e-mail direto
-- continua existindo ao lado, para quem prefere falar.
--
-- Tabela nova nasce com grants default do Supabase → REVOKE + RLS sem policy
-- (baseline de defesa em camadas). Aqui NÃO há policy nenhuma de propósito: o
-- acesso é só pelo Prisma, na rota autenticada; PostgREST não tem o que fazer
-- com esta tabela. auth.uid()::text seria a regra se um dia precisar.
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK.

CREATE TABLE IF NOT EXISTS public.support_feedback (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decorator_id text NOT NULL REFERENCES public.decorators(id) ON DELETE CASCADE,
  -- 'avaliacao'    = clique na carinha (grava sozinho, na hora)
  -- 'opiniao'      = texto livre do "o que podemos melhorar" (+ assuntos, + nota atual)
  -- 'ia_interesse' = "avise-me quando lançar" do card do assistente de IA
  tipo         text NOT NULL,
  nota         smallint,                      -- 1=Péssimo … 5=Incrível; nulo em ia_interesse
  assuntos     text[] NOT NULL DEFAULT '{}',  -- chips escolhidos ("Acervo de Peças" etc.)
  mensagem     text,                          -- texto livre, teto de 1000 no app
  criado_em    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT support_feedback_tipo_chk CHECK (tipo IN ('avaliacao', 'opiniao', 'ia_interesse')),
  -- A nota é opcional, mas quando existe tem de ser uma das cinco carinhas.
  CONSTRAINT support_feedback_nota_chk CHECK (nota IS NULL OR (nota BETWEEN 1 AND 5))
);

-- A leitura que existe é sempre "o que chegou, mais novo primeiro" (script
-- ver-feedback.cjs) e "qual a nota atual DESTA decoradora" (a tela).
CREATE INDEX IF NOT EXISTS idx_support_feedback_recente
  ON public.support_feedback (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_support_feedback_decorator
  ON public.support_feedback (decorator_id, tipo, criado_em DESC);

ALTER TABLE public.support_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_feedback FROM anon, authenticated;

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas `--`):
--   DROP TABLE IF EXISTS public.support_feedback;
-- ============================================================================
