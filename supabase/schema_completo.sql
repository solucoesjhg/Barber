-- ============================================================
-- 20260601000001_empresas.sql
-- ============================================================
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


-- ============================================================
-- 20260601000002_perfis_usuarios.sql
-- ============================================================
-- BarberOS — Tabelas: perfis e usuarios

-- PERFIS (espelha auth.users do Supabase)
CREATE TABLE public.perfis (
  id_pe         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuari_pe     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_pe       TEXT,
  avatar_pe     TEXT,
  fone_pe       TEXT,
  criado_pe     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_pe     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qualquer autenticado pode ver perfis"
  ON public.perfis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "usuario pode inserir proprio perfil"
  ON public.perfis FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuari_pe);

CREATE POLICY "usuario pode atualizar proprio perfil"
  ON public.perfis FOR UPDATE
  TO authenticated
  USING (auth.uid() = usuari_pe);

CREATE OR REPLACE FUNCTION update_atuali_pe()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_pe = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_pe
  BEFORE UPDATE ON public.perfis
  FOR EACH ROW EXECUTE FUNCTION update_atuali_pe();

-- Cria perfil automaticamente ao cadastrar usuário no Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.perfis (usuari_pe, nome_pe)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- USUARIOS (papel/role no sistema)
CREATE TABLE public.usuarios (
  id_us         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  perfil_us     UUID NOT NULL REFERENCES public.perfis(id_pe) ON DELETE CASCADE,
  empres_us     UUID NOT NULL REFERENCES public.empresas(id_em),
  papel_us      TEXT NOT NULL DEFAULT 'recepcionista'
                  CHECK (papel_us IN ('admin','gerente','recepcionista','barbeiro')),
  status_us     TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status_us IN ('ativo','pendente','inativo')),
  criado_us     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atuali_us     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario ve seu proprio registro"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (
    perfil_us IN (
      SELECT id_pe FROM public.perfis WHERE usuari_pe = auth.uid()
    )
  );

CREATE POLICY "admin e gerente veem todos os usuarios da empresa"
  ON public.usuarios FOR SELECT
  TO authenticated
  USING (
    empres_us IN (
      SELECT empres_us FROM public.usuarios u
      JOIN public.perfis p ON p.id_pe = u.perfil_us
      WHERE p.usuari_pe = auth.uid()
      AND u.papel_us IN ('admin','gerente')
    )
  );

CREATE OR REPLACE FUNCTION update_atuali_us()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atuali_us = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atuali_us
  BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION update_atuali_us();


-- ============================================================
-- 20260601000003_funcionarios_horarios.sql
-- ============================================================
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


-- ============================================================
-- 20260601000004_clientes_servicos.sql
-- ============================================================
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


-- ============================================================
-- 20260601000005_agendamentos.sql
-- ============================================================
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


-- ============================================================
-- 20260601000006_atendimentos_comissoes.sql
-- ============================================================
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


-- ============================================================
-- 20260601000007_caixas_movimentos.sql
-- ============================================================
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



