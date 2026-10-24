-- ================================================================
-- Fechamento de comissão por período e vales do profissional
-- ================================================================
-- - vales_profissional: adiantamento dado ao profissional (sai do
--   caixa ou da conta na hora) e descontado no próximo fechamento.
-- - fechamentos_comissao: o "holerite" de um período. Junta as
--   comissões em aberto do profissional, desconta os vales, marca as
--   comissões como pagas e lança o pagamento no financeiro. Se os vales
--   passarem da comissão, o que sobra vira um vale em aberto.
-- - Comissão de um fechamento não pode ser alterada nem apagada (nem
--   pela edição da venda): estorne o fechamento antes.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.fechamentos_comissao (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  profissional_id     UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  inicio              DATE NOT NULL,
  fim                 DATE NOT NULL,
  total_comissoes     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_vales         NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_pago          NUMERIC(10,2) NOT NULL DEFAULT 0,
  movimento_id        UUID REFERENCES public.movimentos_caixa(id) ON DELETE SET NULL,
  observacao          TEXT,
  usuario_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fechamentos_comissao_prof ON public.fechamentos_comissao (empresa_id, profissional_id);

CREATE TABLE IF NOT EXISTS public.vales_profissional (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  profissional_id       UUID NOT NULL REFERENCES public.profissionais(id) ON DELETE CASCADE,
  valor                 NUMERIC(10,2) NOT NULL CHECK (valor > 0),
  data                  DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao             TEXT,
  status                TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'descontado')),
  fechamento_id         UUID REFERENCES public.fechamentos_comissao(id) ON DELETE SET NULL,
  -- Saldo que sobrou de um fechamento (vales maiores que a comissão).
  gerado_por_fechamento UUID REFERENCES public.fechamentos_comissao(id) ON DELETE CASCADE,
  movimento_id          UUID REFERENCES public.movimentos_caixa(id) ON DELETE SET NULL,
  usuario_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vales_profissional_prof ON public.vales_profissional (empresa_id, profissional_id, status);

ALTER TABLE public.comissoes ADD COLUMN IF NOT EXISTS fechamento_id UUID REFERENCES public.fechamentos_comissao(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_comissoes_fechamento ON public.comissoes (fechamento_id);

ALTER TABLE public.fechamentos_comissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vales_profissional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fechamentos_comissao_select" ON public.fechamentos_comissao;
CREATE POLICY "fechamentos_comissao_select" ON public.fechamentos_comissao FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND (public.tem_permissao('comissoes', true) OR profissional_id = public.meu_profissional()));
DROP POLICY IF EXISTS "vales_profissional_select" ON public.vales_profissional;
CREATE POLICY "vales_profissional_select" ON public.vales_profissional FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND (public.tem_permissao('comissoes', true) OR profissional_id = public.meu_profissional()));
GRANT SELECT ON public.fechamentos_comissao, public.vales_profissional TO authenticated;

-- Comissão já fechada: só o estorno do fechamento mexe nela.
CREATE OR REPLACE FUNCTION public.proteger_comissao_fechada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.fechamento_id IS NOT NULL THEN
      RAISE EXCEPTION 'Esta venda tem comissão já paga num fechamento. Estorne o fechamento da comissão antes de alterar a venda.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.fechamento_id IS NOT NULL AND NEW.fechamento_id IS NOT NULL
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.valor_comissao IS DISTINCT FROM OLD.valor_comissao) THEN
    RAISE EXCEPTION 'Esta comissão já foi paga num fechamento. Estorne o fechamento antes.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_proteger_comissao_fechada ON public.comissoes;
CREATE TRIGGER trg_proteger_comissao_fechada
  BEFORE UPDATE OR DELETE ON public.comissoes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_comissao_fechada();

-- ----------------------------------------------------------------
-- Vales
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_vale(
  p_profissional_id UUID, p_valor NUMERIC, p_descricao TEXT DEFAULT NULL,
  p_data DATE DEFAULT NULL, p_do_caixa BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_nome    TEXT;
  v_sessao  UUID;
  v_mov     UUID;
  v_id      UUID;
  v_data    DATE := COALESCE(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::DATE);
BEGIN
  IF NOT public.tem_permissao('comissoes', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para lançar vales.';
  END IF;
  SELECT nome INTO v_nome FROM public.profissionais WHERE id = p_profissional_id AND empresa_id = v_empresa;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Profissional não encontrado.';
  END IF;
  IF COALESCE(p_valor, 0) <= 0 THEN
    RAISE EXCEPTION 'Informe o valor do vale.';
  END IF;
  IF p_do_caixa THEN
    SELECT id INTO v_sessao FROM public.sessoes_caixa WHERE empresa_id = v_empresa AND status = 'aberto';
    IF v_sessao IS NULL THEN
      RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa ou lance o vale saindo da conta.';
    END IF;
  END IF;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('saida', 'vale', 'Vale — ' || v_nome || COALESCE(' · ' || NULLIF(trim(p_descricao), ''), ''),
          ROUND(p_valor, 2), v_data, v_sessao, public.conta_financeira_padrao(), v_empresa)
  RETURNING id INTO v_mov;

  INSERT INTO public.vales_profissional (empresa_id, profissional_id, valor, data, descricao, movimento_id, usuario_id)
  VALUES (v_empresa, p_profissional_id, ROUND(p_valor, 2), v_data, NULLIF(trim(p_descricao), ''), v_mov, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_vale(p_vale_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vale RECORD;
BEGIN
  IF NOT public.tem_permissao('comissoes', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir vales.';
  END IF;
  SELECT * INTO v_vale FROM public.vales_profissional WHERE id = p_vale_id AND empresa_id = public.minha_empresa();
  IF v_vale IS NULL THEN
    RAISE EXCEPTION 'Vale não encontrado.';
  END IF;
  IF v_vale.status <> 'aberto' THEN
    RAISE EXCEPTION 'Este vale já foi descontado num fechamento. Estorne o fechamento antes.';
  END IF;
  IF v_vale.gerado_por_fechamento IS NOT NULL THEN
    RAISE EXCEPTION 'Este saldo veio de um fechamento. Estorne o fechamento para tirá-lo.';
  END IF;
  DELETE FROM public.vales_profissional WHERE id = p_vale_id;
  IF v_vale.movimento_id IS NOT NULL THEN
    DELETE FROM public.movimentos_caixa WHERE id = v_vale.movimento_id;
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- Fechamento
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fechar_comissoes(
  p_profissional_id UUID, p_inicio DATE, p_fim DATE,
  p_observacao TEXT DEFAULT NULL, p_do_caixa BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_nome    TEXT;
  v_id      UUID;
  v_com     NUMERIC(10,2);
  v_vales   NUMERIC(10,2);
  v_pago    NUMERIC(10,2);
  v_sessao  UUID;
  v_mov     UUID;
  v_hoje    DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_periodo TEXT := to_char(p_inicio, 'DD/MM') || ' a ' || to_char(p_fim, 'DD/MM/YYYY');
BEGIN
  IF NOT public.tem_permissao('comissoes', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para fechar comissões.';
  END IF;
  SELECT nome INTO v_nome FROM public.profissionais WHERE id = p_profissional_id AND empresa_id = v_empresa;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Profissional não encontrado.';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'Período inválido.';
  END IF;

  SELECT COALESCE(SUM(valor_comissao), 0) INTO v_com
  FROM public.comissoes
  WHERE empresa_id = v_empresa AND profissional_id = p_profissional_id
    AND status IN ('pendente', 'aprovada') AND fechamento_id IS NULL
    AND (created_at AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(valor), 0) INTO v_vales
  FROM public.vales_profissional
  WHERE empresa_id = v_empresa AND profissional_id = p_profissional_id
    AND status = 'aberto' AND data <= p_fim;

  IF v_com = 0 AND v_vales = 0 THEN
    RAISE EXCEPTION 'Não há comissão nem vale em aberto para % nesse período.', v_nome;
  END IF;

  v_pago := GREATEST(v_com - v_vales, 0);

  IF v_pago > 0 AND p_do_caixa THEN
    SELECT id INTO v_sessao FROM public.sessoes_caixa WHERE empresa_id = v_empresa AND status = 'aberto';
    IF v_sessao IS NULL THEN
      RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa ou pague saindo da conta.';
    END IF;
  END IF;

  INSERT INTO public.fechamentos_comissao (empresa_id, profissional_id, inicio, fim, total_comissoes, total_vales, valor_pago, observacao, usuario_id)
  VALUES (v_empresa, p_profissional_id, p_inicio, p_fim, v_com, LEAST(v_vales, v_com), v_pago, NULLIF(trim(p_observacao), ''), auth.uid())
  RETURNING id INTO v_id;

  UPDATE public.comissoes SET status = 'paga', fechamento_id = v_id
  WHERE empresa_id = v_empresa AND profissional_id = p_profissional_id
    AND status IN ('pendente', 'aprovada') AND fechamento_id IS NULL
    AND (created_at AT TIME ZONE 'America/Sao_Paulo')::DATE BETWEEN p_inicio AND p_fim;

  UPDATE public.vales_profissional SET status = 'descontado', fechamento_id = v_id
  WHERE empresa_id = v_empresa AND profissional_id = p_profissional_id
    AND status = 'aberto' AND data <= p_fim;

  -- Vales maiores que a comissão: o resto fica para o próximo fechamento.
  IF v_vales > v_com THEN
    INSERT INTO public.vales_profissional (empresa_id, profissional_id, valor, data, descricao, gerado_por_fechamento, usuario_id)
    VALUES (v_empresa, p_profissional_id, v_vales - v_com, v_hoje, 'Saldo de vales do fechamento ' || v_periodo, v_id, auth.uid());
  END IF;

  IF v_pago > 0 THEN
    INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, sessao_caixa_id, conta_financeira_id, empresa_id)
    VALUES ('saida', 'comissao', 'Comissão — ' || v_nome || ' (' || v_periodo || ')', v_pago, v_hoje, v_sessao,
            public.conta_financeira_padrao(), v_empresa)
    RETURNING id INTO v_mov;
    UPDATE public.fechamentos_comissao SET movimento_id = v_mov WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.estornar_fechamento_comissao(p_fechamento_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_f RECORD;
BEGIN
  IF NOT public.tem_permissao('comissoes', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para estornar fechamentos.';
  END IF;
  SELECT * INTO v_f FROM public.fechamentos_comissao WHERE id = p_fechamento_id AND empresa_id = public.minha_empresa();
  IF v_f IS NULL THEN
    RAISE EXCEPTION 'Fechamento não encontrado.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vales_profissional WHERE gerado_por_fechamento = p_fechamento_id AND status <> 'aberto') THEN
    RAISE EXCEPTION 'O saldo de vales deste fechamento já foi descontado num fechamento seguinte. Estorne o seguinte primeiro.';
  END IF;

  UPDATE public.comissoes SET fechamento_id = NULL, status = 'pendente' WHERE fechamento_id = p_fechamento_id;
  UPDATE public.vales_profissional SET status = 'aberto', fechamento_id = NULL WHERE fechamento_id = p_fechamento_id;
  DELETE FROM public.vales_profissional WHERE gerado_por_fechamento = p_fechamento_id;
  IF v_f.movimento_id IS NOT NULL THEN
    DELETE FROM public.movimentos_caixa WHERE id = v_f.movimento_id;
  END IF;
  DELETE FROM public.fechamentos_comissao WHERE id = p_fechamento_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_vale(UUID, NUMERIC, TEXT, DATE, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.excluir_vale(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fechar_comissoes(UUID, DATE, DATE, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.estornar_fechamento_comissao(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_vale(UUID, NUMERIC, TEXT, DATE, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_vale(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_comissoes(UUID, DATE, DATE, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.estornar_fechamento_comissao(UUID) TO authenticated;
