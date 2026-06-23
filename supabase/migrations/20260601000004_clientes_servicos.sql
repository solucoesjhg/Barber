-- BarberOS — Tabelas: clientes e servicos

-- CLIENTES
CREATE TABLE public.clientes (
  id_cl         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empres_cl     UUID NOT NULL REFERENCES public.empresas(id_em),
  nome_cl       TEXT NOT NULL,
  apelid_cl     TEXT,
  fone_cl       TEXT,
  email_cl      TEXT,
  nascim_cl     DATE,
  obs_cl        TEXT,
  criado_cl     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_cl     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem clientes da empresa"
  ON public.clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "autenticados gerenciam clientes"
  ON public.clientes FOR ALL
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_atuali_cl()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_cl = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_cl
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION update_atuali_cl();


-- SERVICOS
CREATE TABLE public.servicos (
  id_sv         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empres_sv     UUID NOT NULL REFERENCES public.empresas(id_em),
  nome_sv       TEXT NOT NULL,
  durac_sv      SMALLINT NOT NULL DEFAULT 30,
  valor_sv      DECIMAL(10,2) NOT NULL DEFAULT 0,
  comiss_sv     DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  ativo_sv      BOOLEAN NOT NULL DEFAULT true,
  criado_sv     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_sv     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem servicos ativos"
  ON public.servicos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin e gerente gerenciam servicos"
  ON public.servicos FOR ALL
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_atuali_sv()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_sv = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_sv
  BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION update_atuali_sv();
