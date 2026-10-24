-- ================================================================
-- Painel ADM (super admin): dados da empresa, bloqueio de acesso,
-- exclusão da empresa e cobrança das mensalidades das lojas.
--
-- - empresas ganha responsável, endereço, observações, motivo do
--   bloqueio e os dados de cobrança (plano, valor, dia de vencimento).
-- - Loja bloqueada (empresas.ativo = false): minha_empresa() deixa de
--   devolver a loja, então os usuários dela não veem nem gravam nada;
--   situacao_minha_loja() diz à tela o motivo.
-- - mensalidades: uma por loja e mês (mais cobranças avulsas), com
--   status pendente / paga / cancelada.
-- ================================================================

ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS responsavel TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS endereco TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS bloqueada_em TIMESTAMPTZ;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS plano TEXT;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS valor_mensalidade NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.empresas ADD COLUMN IF NOT EXISTS cobranca_ativa BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_dia_vencimento_check;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_dia_vencimento_check CHECK (dia_vencimento BETWEEN 1 AND 28);
ALTER TABLE public.empresas DROP CONSTRAINT IF EXISTS empresas_valor_mensalidade_check;
ALTER TABLE public.empresas ADD CONSTRAINT empresas_valor_mensalidade_check CHECK (valor_mensalidade >= 0);

-- ----------------------------------------------------------------
-- 1) Loja bloqueada não acessa nada
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.minha_empresa()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.empresa_id
  FROM public.usuario_perfis up
  JOIN public.empresas e ON e.id = up.empresa_id
  WHERE up.usuario_id = auth.uid() AND up.ativo = true AND e.ativo = true;
$$;

-- Para a tela: ok, bloqueada (com o motivo), sem_loja ou usuario_inativo.
CREATE OR REPLACE FUNCTION public.situacao_minha_loja()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN up.usuario_id IS NULL OR up.papel = 'super_admin' THEN jsonb_build_object('situacao', 'ok')
    WHEN up.empresa_id IS NULL THEN jsonb_build_object('situacao', 'sem_loja')
    WHEN NOT up.ativo THEN jsonb_build_object('situacao', 'usuario_inativo')
    WHEN NOT e.ativo THEN jsonb_build_object('situacao', 'bloqueada', 'loja', e.nome, 'motivo', e.motivo_bloqueio)
    ELSE jsonb_build_object('situacao', 'ok')
  END
  FROM (SELECT auth.uid() AS uid) eu
  LEFT JOIN public.usuario_perfis up ON up.usuario_id = eu.uid
  LEFT JOIN public.empresas e ON e.id = up.empresa_id;
$$;

REVOKE EXECUTE ON FUNCTION public.situacao_minha_loja() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.situacao_minha_loja() TO authenticated;

CREATE OR REPLACE FUNCTION public.definir_acesso_empresa(p_empresa_id UUID, p_ativo BOOLEAN, p_motivo TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma pode bloquear ou liberar uma loja.';
  END IF;
  UPDATE public.empresas
  SET ativo = p_ativo,
      motivo_bloqueio = CASE WHEN p_ativo THEN NULL ELSE NULLIF(trim(COALESCE(p_motivo, '')), '') END,
      bloqueada_em = CASE WHEN p_ativo THEN NULL ELSE now() END
  WHERE id = p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.definir_acesso_empresa(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_acesso_empresa(UUID, BOOLEAN, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- 2) Excluir a empresa (tudo dela, inclusive os logins da equipe)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.excluir_empresa(p_empresa_id UUID, p_confirmacao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma pode excluir uma loja.';
  END IF;
  SELECT nome INTO v_nome FROM public.empresas WHERE id = p_empresa_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF lower(trim(COALESCE(p_confirmacao, ''))) <> lower(trim(v_nome)) THEN
    RAISE EXCEPTION 'Para confirmar, digite o nome da loja exatamente como está: %', v_nome;
  END IF;

  -- Logins da equipe da loja (nunca o de um super admin).
  DELETE FROM auth.users
  WHERE id IN (
    SELECT usuario_id FROM public.usuario_perfis
    WHERE empresa_id = p_empresa_id AND papel <> 'super_admin'
  );
  -- O resto (vendas, caixa, cadastros, mensalidades...) sai em cascata.
  DELETE FROM public.empresas WHERE id = p_empresa_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.excluir_empresa(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_empresa(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- 3) Mensalidades
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mensalidades (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'mensalidade' CHECK (tipo IN ('mensalidade', 'avulsa')),
  competencia     DATE NOT NULL,
  descricao       TEXT,
  valor           NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  vencimento      DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'paga', 'cancelada')),
  pago_em         DATE,
  valor_pago      NUMERIC(10,2),
  forma_pagamento TEXT,
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mensalidades_uma_por_mes ON public.mensalidades (empresa_id, competencia) WHERE tipo = 'mensalidade';
CREATE INDEX IF NOT EXISTS idx_mensalidades_empresa ON public.mensalidades (empresa_id);
CREATE INDEX IF NOT EXISTS idx_mensalidades_vencimento ON public.mensalidades (vencimento);

ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mensalidades_super_admin ON public.mensalidades;
CREATE POLICY mensalidades_super_admin ON public.mensalidades FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mensalidades TO authenticated;

-- Gera a mensalidade do mês para as lojas com cobrança ativa e valor
-- (as que já têm a do mês ficam como estão). Devolve quantas criou.
CREATE OR REPLACE FUNCTION public.gerar_mensalidades(p_competencia DATE DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes DATE := date_trunc('month', COALESCE(p_competencia, (now() AT TIME ZONE 'America/Sao_Paulo')::DATE))::DATE;
  v_qtd INTEGER;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma gera mensalidades.';
  END IF;
  INSERT INTO public.mensalidades (empresa_id, tipo, competencia, valor, vencimento)
  SELECT e.id, 'mensalidade', v_mes, e.valor_mensalidade, v_mes + (e.dia_vencimento - 1)
  FROM public.empresas e
  WHERE e.cobranca_ativa AND e.valor_mensalidade > 0
    AND date_trunc('month', e.created_at)::DATE <= v_mes
  ON CONFLICT (empresa_id, competencia) WHERE tipo = 'mensalidade' DO NOTHING;
  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_mensalidades(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_mensalidades(DATE) TO authenticated;

-- ----------------------------------------------------------------
-- 4) Visão geral das lojas para o painel
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.painel_empresas();
CREATE FUNCTION public.painel_empresas()
RETURNS TABLE(
  id UUID, nome TEXT, codigo TEXT, email TEXT, telefone TEXT, cnpj TEXT, ativo BOOLEAN, created_at TIMESTAMPTZ,
  responsavel TEXT, endereco TEXT, cidade TEXT, observacoes TEXT, motivo_bloqueio TEXT, bloqueada_em TIMESTAMPTZ, plano TEXT, valor_mensalidade NUMERIC, dia_vencimento INTEGER, cobranca_ativa BOOLEAN,
  usuarios_ativos BIGINT, ultimo_acesso TIMESTAMPTZ, vendas_mes BIGINT, faturamento_mes NUMERIC,
  mensalidades_atrasadas BIGINT, valor_atrasado NUMERIC, proximo_vencimento DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_mes  DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::DATE)::DATE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma vê o painel.';
  END IF;
  RETURN QUERY
  SELECT e.id, e.nome, e.codigo, e.email, e.telefone, e.cnpj, e.ativo, e.created_at,
         e.responsavel, e.endereco, e.cidade, e.observacoes, e.motivo_bloqueio, e.bloqueada_em, e.plano, e.valor_mensalidade, e.dia_vencimento, e.cobranca_ativa,
         (SELECT count(*) FROM public.usuario_perfis up WHERE up.empresa_id = e.id AND up.ativo AND up.papel <> 'super_admin'),
         (SELECT max(au.last_sign_in_at) FROM public.usuario_perfis up JOIN auth.users au ON au.id = up.usuario_id
            WHERE up.empresa_id = e.id AND up.papel <> 'super_admin'),
         (SELECT count(*) FROM public.comandas c WHERE c.empresa_id = e.id AND c.status = 'fechada' AND c.data >= v_mes),
         (SELECT COALESCE(sum(c.total), 0) FROM public.comandas c WHERE c.empresa_id = e.id AND c.status = 'fechada' AND c.data >= v_mes),
         (SELECT count(*) FROM public.mensalidades m WHERE m.empresa_id = e.id AND m.status = 'pendente' AND m.vencimento < v_hoje),
         (SELECT COALESCE(sum(m.valor), 0) FROM public.mensalidades m WHERE m.empresa_id = e.id AND m.status = 'pendente' AND m.vencimento < v_hoje),
         (SELECT min(m.vencimento) FROM public.mensalidades m WHERE m.empresa_id = e.id AND m.status = 'pendente' AND m.vencimento >= v_hoje)
  FROM public.empresas e
  ORDER BY e.nome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.painel_empresas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_empresas() TO authenticated;
