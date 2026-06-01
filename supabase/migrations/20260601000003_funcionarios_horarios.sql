-- BarberOS — Tabelas: funcionarios e horarios

-- FUNCIONARIOS
CREATE TABLE public.funcionarios (
  id_fu         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empres_fu     UUID NOT NULL REFERENCES public.empresas(id_em),
  usuari_fu     UUID REFERENCES public.usuarios(id_us),
  nome_fu       TEXT NOT NULL,
  cpf_fu        TEXT,
  fone_fu       TEXT,
  email_fu      TEXT,
  foto_fu       TEXT,
  cargo_fu      TEXT NOT NULL DEFAULT 'barbeiro',
  admiss_fu     DATE,
  comiss_fu     DECIMAL(5,2) NOT NULL DEFAULT 40.00,
  status_fu     TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status_fu IN ('ativo','inativo','afastado')),
  criado_fu     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_fu     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem funcionarios da empresa"
  ON public.funcionarios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin e gerente gerenciam funcionarios"
  ON public.funcionarios FOR ALL
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_atuali_fu()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_fu = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_fu
  BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION update_atuali_fu();


-- HORARIOS (grade de trabalho por dia da semana)
CREATE TABLE public.horarios (
  id_ho         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funcio_ho     UUID NOT NULL REFERENCES public.funcionarios(id_fu) ON DELETE CASCADE,
  diasem_ho     SMALLINT NOT NULL CHECK (diasem_ho BETWEEN 0 AND 6), -- 0=domingo, 6=sabado
  ativo_ho      BOOLEAN NOT NULL DEFAULT true,
  hrini_ho      TIME NOT NULL,
  hrfim_ho      TIME NOT NULL,
  intini_ho     TIME,
  intfim_ho     TIME,
  criado_ho     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (funcio_ho, diasem_ho)
);

ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem horarios"
  ON public.horarios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin e gerente gerenciam horarios"
  ON public.horarios FOR ALL
  TO authenticated
  USING (true);
