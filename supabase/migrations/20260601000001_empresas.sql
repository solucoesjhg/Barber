-- BarberOS — Tabela: empresas
CREATE TABLE public.empresas (
  id_em         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_em       TEXT NOT NULL,
  razao_em      TEXT,
  cnpj_em       TEXT,
  fone_em       TEXT,
  email_em      TEXT,
  logo_em       TEXT,
  cep_em        TEXT,
  logra_em      TEXT,
  numero_em     TEXT,
  comple_em     TEXT,
  bairro_em     TEXT,
  cidade_em     TEXT,
  uf_em         TEXT,
  fuso_em       TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  hrini_em      TIME NOT NULL DEFAULT '08:00',
  hrfim_em      TIME NOT NULL DEFAULT '20:00',
  ativo_em      BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios autenticados podem ver empresas"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin pode inserir empresa"
  ON public.empresas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "admin pode atualizar empresa"
  ON public.empresas FOR UPDATE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_atuali_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_em
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION update_atuali_em();
