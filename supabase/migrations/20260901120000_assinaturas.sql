-- ============================================================================
-- ASSINATURA RECORRENTE (Mercado Pago — Checkout Pro / Preapproval)
--
-- Três tabelas, com papéis deliberadamente diferentes:
--   subscriptions          — o estado da assinatura de cada decoradora. Espelho
--                            LOCAL do que o Mercado Pago diz; a verdade é sempre
--                            relida da API deles, nunca do corpo do webhook.
--   billing_events         — tudo que o webhook recebeu, cru. Chave = id da
--                            notificação do MP, então a mesma notificação
--                            repetida não processa duas vezes (idempotência).
--   beneficios_consumidos  — quem já usou teste grátis / oferta de retenção.
--                            NÃO tem FK para decorators de PROPÓSITO: precisa
--                            sobreviver à exclusão da conta, senão apagar e
--                            recriar a conta devolve o benefício.
--
-- Dinheiro em CENTAVOS (integer). Nunca float, nunca Decimal chegando como string.
--
-- Baseline de defesa em camadas do projeto: RLS ligado + REVOKE dos grants
-- default do Supabase em toda tabela nova.
--
-- APLICAR: banco de TESTE primeiro; PRODUÇÃO só após dump + OK.
-- ============================================================================

-- 1) Assinaturas -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  decorator_id          text NOT NULL REFERENCES public.decorators(id) ON DELETE CASCADE,
  -- id da preapproval no Mercado Pago. Único: uma preapproval nunca pertence a
  -- duas linhas. É por ele que o webhook encontra a assinatura.
  mp_preapproval_id     text NOT NULL UNIQUE,
  -- id do pagador no MP. Vira âncora de benefício (tabela 3) quando conhecido.
  mp_payer_id           text,

  status                text NOT NULL DEFAULT 'pendente',
  -- 'mensal' (149,90) | 'retencao' (99,90 por 3 cobranças, depois volta a mensal)
  plano                 text NOT NULL DEFAULT 'mensal',
  valor_centavos        integer NOT NULL,

  -- Fim do teste grátis (NULL = não teve teste).
  teste_fim             timestamptz,
  -- ACESSO VALE ATÉ AQUI. É o campo que o gate lê: cancelar não corta na hora.
  periodo_fim           timestamptz,
  proxima_cobranca      timestamptz,

  -- Cobranças já feitas DENTRO do plano atual. Conta as 3 da oferta de retenção
  -- para saber quando voltar ao valor cheio.
  cobrancas_no_plano    integer NOT NULL DEFAULT 0,
  -- Primeira cobrança paga: abre a janela de reembolso integral (Termos 6.4).
  primeira_cobranca_em  timestamptz,
  oferta_retencao_em    timestamptz,

  cancelada_em          timestamptz,
  motivo_cancelamento   text,
  criada_em             timestamptz NOT NULL DEFAULT now(),
  atualizada_em         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscriptions_status_check CHECK (status IN (
    'pendente',      -- preapproval criada, decoradora ainda não concluiu no MP
    'em_teste',      -- teste grátis correndo, acesso liberado
    'ativa',         -- pagando em dia
    'inadimplente',  -- cobrança falhou; acesso segue até periodo_fim (Termos 5.3)
    'cancelada',     -- cancelada; acesso segue até periodo_fim (Termos 6.2)
    'suspensa',      -- inadimplência vencida: sem acesso
    'expirada'       -- período acabou; dados guardados 90 dias (Termos 6.3)
  )),
  CONSTRAINT subscriptions_plano_check CHECK (plano IN ('mensal', 'retencao')),
  CONSTRAINT subscriptions_valor_check CHECK (valor_centavos > 0)
);

-- UMA assinatura viva por decoradora. 'pendente' fica FORA do índice de propósito:
-- tentativas abandonadas no checkout do MP acumulam sem travar uma nova tentativa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_viva
  ON public.subscriptions (decorator_id)
  WHERE status IN ('em_teste', 'ativa', 'inadimplente', 'cancelada', 'suspensa');

CREATE INDEX IF NOT EXISTS idx_subscriptions_decorator ON public.subscriptions (decorator_id);
-- Varredura do job de reconciliação (vencer período, suspender, expirar).
CREATE INDEX IF NOT EXISTS idx_subscriptions_periodo ON public.subscriptions (periodo_fim)
  WHERE status IN ('em_teste', 'ativa', 'inadimplente', 'cancelada');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subs_select_own ON public.subscriptions;
-- Só leitura da PRÓPRIA assinatura. Escrita é exclusiva do servidor (Prisma, role
-- dona): nenhuma policy de INSERT/UPDATE/DELETE, ninguém se dá acesso via PostgREST.
CREATE POLICY subs_select_own ON public.subscriptions
  FOR SELECT TO authenticated USING (decorator_id = auth.uid()::text);
REVOKE ALL ON public.subscriptions FROM anon, authenticated;

-- 2) Eventos do webhook ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_events (
  -- id da NOTIFICAÇÃO no Mercado Pago. PK = idempotência: a retentativa do MP
  -- traz o mesmo id, o INSERT conflita e o processamento não repete.
  id                 text PRIMARY KEY,
  tipo               text NOT NULL,
  acao               text,
  recurso_id         text,
  mp_preapproval_id  text,
  payload            jsonb NOT NULL,
  -- Registra se a assinatura do header x-signature CONFERIU. Evento com
  -- assinatura inválida é recusado com 401 e nem chega aqui; a coluna existe
  -- para o caso de a validação virar modo observação numa investigação.
  assinatura_ok      boolean NOT NULL DEFAULT true,
  recebido_em        timestamptz NOT NULL DEFAULT now(),
  processado_em      timestamptz,
  tentativas         integer NOT NULL DEFAULT 0,
  erro               text
);
CREATE INDEX IF NOT EXISTS idx_billing_events_preapproval ON public.billing_events (mp_preapproval_id);
-- Fila do job de reconciliação: o que entrou e ainda não foi processado.
CREATE INDEX IF NOT EXISTS idx_billing_events_pendentes ON public.billing_events (recebido_em)
  WHERE processado_em IS NULL;

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
-- SEM policy nenhuma: é log interno de cobrança, não tem dono na aplicação.
REVOKE ALL ON public.billing_events FROM anon, authenticated;

-- 3) Benefícios já consumidos ------------------------------------------------
-- SEM FK para decorators. É o ponto inteiro da tabela: apagar a conta NÃO pode
-- devolver o teste grátis. Guarda HASH (HMAC-SHA256 com pepper do ambiente), não
-- o CNPJ em claro: o espaço de CNPJs é enumerável, então sem o pepper secreto o
-- hash seria decorativo. O pepper vive em variável de ambiente, NUNCA no banco.
CREATE TABLE IF NOT EXISTS public.beneficios_consumidos (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ancora_tipo   text NOT NULL,
  ancora_hash   text NOT NULL,
  beneficio     text NOT NULL,
  consumido_em  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT beneficios_ancora_check CHECK (ancora_tipo IN ('cnpj', 'mp_payer')),
  CONSTRAINT beneficios_tipo_check CHECK (beneficio IN ('teste_gratis', 'oferta_retencao'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficios_ancora
  ON public.beneficios_consumidos (ancora_tipo, ancora_hash, beneficio);

ALTER TABLE public.beneficios_consumidos ENABLE ROW LEVEL SECURITY;
-- SEM policy: não há "dono" — a linha existe justamente depois que a conta some.
REVOKE ALL ON public.beneficios_consumidos FROM anon, authenticated;

-- ============================================================================
-- ROLLBACK (comentado — apply-sql ignora linhas iniciadas por dois traços):
--   DROP POLICY IF EXISTS subs_select_own ON public.subscriptions;
--   DROP TABLE IF EXISTS public.billing_events;
--   DROP TABLE IF EXISTS public.beneficios_consumidos;
--   DROP TABLE IF EXISTS public.subscriptions;
-- ============================================================================
