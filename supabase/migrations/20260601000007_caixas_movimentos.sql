-- BarberOS — Tabelas: caixas e movimentos

-- CAIXAS (um por dia por empresa)
CREATE TABLE public.caixas (
  id_cx         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empres_cx     UUID NOT NULL REFERENCES public.empresas(id_em),
  usuari_cx     UUID NOT NULL REFERENCES public.usuarios(id_us),
  dtaber_cx     DATE NOT NULL DEFAULT CURRENT_DATE,
  slini_cx      DECIMAL(10,2) NOT NULL DEFAULT 0,
  slfim_cx      DECIMAL(10,2),
  status_cx     TEXT NOT NULL DEFAULT 'aberto'
                  CHECK (status_cx IN ('aberto','fechado')),
  obs_cx        TEXT,
  criado_cx     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_cx     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empres_cx, dtaber_cx)
);

ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem caixas da empresa"
  ON public.caixas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "autenticados gerenciam caixa"
  ON public.caixas FOR ALL
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION update_atuali_cx()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_cx = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_cx
  BEFORE UPDATE ON public.caixas
  FOR EACH ROW EXECUTE FUNCTION update_atuali_cx();


-- MOVIMENTOS (entradas e saídas do caixa)
CREATE TABLE public.movimentos (
  id_mv         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caixa_mv      UUID NOT NULL REFERENCES public.caixas(id_cx),
  atend_mv      UUID REFERENCES public.atendimentos(id_at),
  tipo_mv       TEXT NOT NULL CHECK (tipo_mv IN ('entrada','saida')),
  valor_mv      DECIMAL(10,2) NOT NULL,
  descri_mv     TEXT,
  pgto_mv       TEXT,
  criado_mv     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mv_caixa ON public.movimentos (caixa_mv);
CREATE INDEX idx_mv_tipo  ON public.movimentos (tipo_mv);

ALTER TABLE public.movimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticados veem movimentos do caixa"
  ON public.movimentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "autenticados inserem movimentos"
  ON public.movimentos FOR INSERT
  TO authenticated
  WITH CHECK (true);


-- Função: registra movimento automaticamente ao finalizar atendimento
CREATE OR REPLACE FUNCTION registrar_movimento_atendimento()
RETURNS TRIGGER AS $$
DECLARE
  v_caixa_id UUID;
BEGIN
  -- Busca o caixa aberto da empresa
  SELECT id_cx INTO v_caixa_id
  FROM public.caixas
  WHERE empres_cx = NEW.empres_at
    AND status_cx = 'aberto'
    AND dtaber_cx = CURRENT_DATE
  LIMIT 1;

  IF v_caixa_id IS NOT NULL THEN
    INSERT INTO public.movimentos (caixa_mv, atend_mv, tipo_mv, valor_mv, pgto_mv, descri_mv)
    VALUES (v_caixa_id, NEW.id_at, 'entrada', NEW.total_at, NEW.pgto_at, 'Atendimento finalizado');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_mv_atendimento
  AFTER INSERT ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION registrar_movimento_atendimento();
