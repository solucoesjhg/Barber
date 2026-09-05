-- ================================================================
--  Agenda — regra fundamental: sem conflito de horário
-- ================================================================
-- Cada agendamento passa a guardar sua própria duração e valor
-- (snapshot no momento da criação, não depende do serviço mudar de
-- preço/duração depois). Com isso, um EXCLUDE constraint no banco
-- impede fisicamente que o mesmo profissional tenha dois
-- agendamentos com horários sobrepostos — a validação não fica só
-- na interface.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS duracao_minutos INTEGER,
  ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2);

UPDATE public.agendamentos a
SET duracao_minutos = COALESCE(a.duracao_minutos, s.duracao_minutos, 30),
    valor            = COALESCE(a.valor, s.preco)
FROM public.servicos s
WHERE a.servico_id = s.id AND (a.duracao_minutos IS NULL OR a.valor IS NULL);

UPDATE public.agendamentos SET duracao_minutos = 30 WHERE duracao_minutos IS NULL;

ALTER TABLE public.agendamentos
  ALTER COLUMN duracao_minutos SET DEFAULT 30,
  ALTER COLUMN duracao_minutos SET NOT NULL;

-- Expande os status (em_atendimento, nao_compareceu)
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_status_check;
ALTER TABLE public.agendamentos ADD CONSTRAINT agendamentos_status_check
  CHECK (status IN ('pendente','confirmado','em_atendimento','concluido','cancelado','nao_compareceu'));

-- Impede sobreposição de horário por profissional (ignora
-- agendamentos cancelados/não compareceu, que não ocupam agenda).
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_sem_conflito;
ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_sem_conflito
  EXCLUDE USING gist (
    profissional_id WITH =,
    tstzrange(data_hora, data_hora + (duracao_minutos * interval '1 minute')) WITH &&
  )
  WHERE (status NOT IN ('cancelado', 'nao_compareceu'));
