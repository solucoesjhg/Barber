-- BarberOS — Tabelas: atendimentos, atend_servicos e comissoes

-- ATENDIMENTOS (registro do serviço realizado)
CREATE TABLE public.atendimentos (
  id_at         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agend_at      UUID NOT NULL UNIQUE REFERENCES public.agendamentos(id_ag),
  empres_at     UUID NOT NULL REFERENCES public.empresas(id_em),
  client_at     UUID NOT NULL REFERENCES public.clientes(id_cl),
  funcio_at     UUID NOT NULL REFERENCES public.funcionarios(id_fu),
  total_at      DECIMAL(10,2) NOT NULL DEFAULT 0,
  pgto_at       TEXT NOT NULL
                  CHECK (pgto_at IN ('dinheiro','pix','debito','credito','outro')),
  obs_at        TEXT,
  criado_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_at_empres ON public.atendimentos (empres_at);
CREATE INDEX idx_at_funcio ON public.atendimentos (funcio_at);
CREATE INDEX idx_at_client ON public.atendimentos (client_at);
CREATE INDEX idx_at_criado ON public.atendimentos (criado_at);

ALTER TABLE public.atendimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem atendimentos da empresa"
  ON public.atendimentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "autenticados inserem atendimentos"
  ON public.atendimentos FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- ATEND_SERVICOS (serviços realizados por atendimento — permite adicionar extras)
CREATE TABLE public.atend_servicos (
  id_as         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atend_as      UUID NOT NULL REFERENCES public.atendimentos(id_at) ON DELETE CASCADE,
  servic_as     UUID NOT NULL REFERENCES public.servicos(id_sv),
  valor_as      DECIMAL(10,2) NOT NULL,
  comiss_as     DECIMAL(5,2) NOT NULL,
  criado_as     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.atend_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem servicos do atendimento"
  ON public.atend_servicos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "autenticados inserem servicos do atendimento"
  ON public.atend_servicos FOR ALL
  TO authenticated
  USING (true);


-- COMISSOES (gerada automaticamente ao finalizar atendimento)
CREATE TABLE public.comissoes (
  id_cm         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atend_cm      UUID NOT NULL REFERENCES public.atendimentos(id_at) ON DELETE CASCADE,
  funcio_cm     UUID NOT NULL REFERENCES public.funcionarios(id_fu),
  valor_cm      DECIMAL(10,2) NOT NULL,
  pago_cm       BOOLEAN NOT NULL DEFAULT false,
  dtpago_cm     DATE,
  criado_cm     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_cm     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cm_funcio ON public.comissoes (funcio_cm);
CREATE INDEX idx_cm_pago   ON public.comissoes (pago_cm);

ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "funcionario ve propria comissao"
  ON public.comissoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sistema insere comissoes"
  ON public.comissoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_atuali_cm()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_cm = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_cm
  BEFORE UPDATE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION update_atuali_cm();
