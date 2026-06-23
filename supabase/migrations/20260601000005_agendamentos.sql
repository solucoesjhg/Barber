-- BarberOS — Tabela: agendamentos

CREATE TABLE public.agendamentos (
  id_ag         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empres_ag     UUID NOT NULL REFERENCES public.empresas(id_em),
  client_ag     UUID NOT NULL REFERENCES public.clientes(id_cl),
  funcio_ag     UUID NOT NULL REFERENCES public.funcionarios(id_fu),
  servic_ag     UUID NOT NULL REFERENCES public.servicos(id_sv),
  dtini_ag      TIMESTAMPTZ NOT NULL,
  dtfim_ag      TIMESTAMPTZ NOT NULL,
  status_ag     TEXT NOT NULL DEFAULT 'agendado'
                  CHECK (status_ag IN (
                    'agendado',
                    'confirmado',
                    'em_atendimento',
                    'finalizado',
                    'cancelado',
                    'nao_compareceu'
                  )),
  motivo_ag     TEXT,
  obs_ag        TEXT,
  criado_ag     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_ag     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_datas_ag CHECK (dtfim_ag > dtini_ag)
);

-- Índices para performance na agenda
CREATE INDEX idx_ag_empres_dtini ON public.agendamentos (empres_ag, dtini_ag);
CREATE INDEX idx_ag_funcio_dtini ON public.agendamentos (funcio_ag, dtini_ag);
CREATE INDEX idx_ag_status       ON public.agendamentos (status_ag);

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem agendamentos da empresa"
  ON public.agendamentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "autenticados gerenciam agendamentos"
  ON public.agendamentos FOR ALL
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_atuali_ag()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_ag = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_ag
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION update_atuali_ag();

-- Função: verifica conflito de horário para o mesmo funcionário
CREATE OR REPLACE FUNCTION check_conflito_agendamento()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.agendamentos
    WHERE funcio_ag = NEW.funcio_ag
      AND id_ag != COALESCE(NEW.id_ag, gen_random_uuid())
      AND status_ag NOT IN ('cancelado', 'nao_compareceu')
      AND (NEW.dtini_ag, NEW.dtfim_ag) OVERLAPS (dtini_ag, dtfim_ag)
  ) THEN
    RAISE EXCEPTION 'Conflito de horário: funcionário já possui agendamento neste período.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_conflito_ag
  BEFORE INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION check_conflito_agendamento();
