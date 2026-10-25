-- ================================================================
--  Lembrete no WhatsApp opcional + conta analítica nos lançamentos
-- ================================================================

-- ── 1) Configuração: a loja usa (ou não) o lembrete no WhatsApp ──
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS usar_whatsapp BOOLEAN NOT NULL DEFAULT true;

-- ── 2) Lançamento avulso (Financeiro / sangria / suprimento) com a
--    conta analítica do plano de contas (Água, Luz, Aluguel...) ───
ALTER TABLE public.movimentos_caixa
  ADD COLUMN IF NOT EXISTS categoria_id UUID REFERENCES public.categorias_financeiras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_movimentos_caixa_categoria ON public.movimentos_caixa(categoria_id);

-- Mesma trava das contas a pagar/receber: só conta analítica da loja.
DROP TRIGGER IF EXISTS trg_valida_categoria_analitica ON public.movimentos_caixa;
CREATE TRIGGER trg_valida_categoria_analitica
  BEFORE INSERT OR UPDATE OF categoria_id ON public.movimentos_caixa
  FOR EACH ROW EXECUTE FUNCTION public.valida_categoria_analitica();

-- Saída só em conta de despesa; entrada só em conta de receita.
CREATE OR REPLACE FUNCTION public.validar_conta_movimento(p_tipo TEXT, p_categoria_id UUID)
RETURNS VOID
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE v_tipo TEXT;
BEGIN
  IF p_categoria_id IS NULL THEN RETURN; END IF;
  SELECT tipo INTO v_tipo FROM public.categorias_financeiras
  WHERE id = p_categoria_id AND empresa_id = public.minha_empresa();
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Conta do plano de contas não encontrada na sua loja.';
  END IF;
  IF (p_tipo = 'saida' AND v_tipo <> 'despesa') OR (p_tipo = 'entrada' AND v_tipo <> 'receita') THEN
    RAISE EXCEPTION 'Saída vai numa conta de despesa e entrada numa conta de receita.';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.registrar_movimento_caixa(TEXT, TEXT, TEXT, NUMERIC, UUID);
CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(
  p_tipo TEXT, p_categoria TEXT, p_descricao TEXT, p_valor NUMERIC,
  p_conta_financeira_id UUID DEFAULT NULL, p_categoria_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sessao_id UUID;
  v_empresa   UUID := public.minha_empresa();
  v_conta     UUID;
  v_id        UUID;
BEGIN
  IF NOT (public.tem_permissao('caixa', true) OR public.tem_permissao('financeiro', true)) THEN
    RAISE EXCEPTION 'Você não tem permissão para lançar movimentos no caixa.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_categoria IN ('transferencia', 'taxa_cartao') THEN
    RAISE EXCEPTION 'Categoria reservada: use a transferência entre contas.';
  END IF;
  PERFORM public.validar_conta_movimento(p_tipo, p_categoria_id);

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;

  PERFORM public.fechar_caixas_vencidos(v_empresa);

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE empresa_id = public.minha_empresa() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de lançar movimentos.';
  END IF;

  v_conta := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id, categoria_id)
  VALUES (p_tipo, p_categoria, p_descricao, p_valor, v_sessao_id, v_conta, v_empresa, p_categoria_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.registrar_movimento_caixa(TEXT, TEXT, TEXT, NUMERIC, UUID, UUID) TO authenticated;

-- Classificar (ou trocar a conta de) um lançamento avulso já feito.
-- Movimentos gerados pelo sistema (venda, baixa de conta, comissão,
-- vale, taxa, transferência) não mudam por aqui.
CREATE OR REPLACE FUNCTION public.classificar_movimento(p_movimento_id UUID, p_categoria_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_mov RECORD;
BEGIN
  IF NOT public.tem_permissao('financeiro', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar lançamentos.';
  END IF;
  SELECT * INTO v_mov FROM public.movimentos_caixa
  WHERE id = p_movimento_id AND empresa_id = public.minha_empresa();
  IF v_mov IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado.';
  END IF;
  IF v_mov.comanda_id IS NOT NULL OR v_mov.transferencia_id IS NOT NULL
     OR v_mov.categoria IN ('venda', 'taxa_cartao', 'transferencia', 'conta_a_pagar', 'conta_a_receber',
                            'comissao', 'vale', 'compra_mercadoria', 'capital_inicial') THEN
    RAISE EXCEPTION 'Esse lançamento é gerado pelo sistema e já tem a sua classificação.';
  END IF;
  PERFORM public.validar_conta_movimento(v_mov.tipo, p_categoria_id);
  UPDATE public.movimentos_caixa SET categoria_id = p_categoria_id WHERE id = p_movimento_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.classificar_movimento(UUID, UUID) TO authenticated;

-- ── 3) DRE: lançamentos avulsos classificados entram — saídas nas
--    despesas da conta (agrupadas pela sintética), entradas em
--    outras receitas ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_dre(p_inicio DATE, p_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_receita_servicos NUMERIC(12,2);
  v_receita_produtos NUMERIC(12,2);
  v_descontos        NUMERIC(12,2);
  v_outras_receitas  NUMERIC(12,2);
  v_cmv              NUMERIC(12,2);
  v_comissoes        NUMERIC(12,2);
  v_taxas            NUMERIC(12,2);
  v_despesas         JSONB;
  v_total_despesas   NUMERIC(12,2);
  v_receita_bruta    NUMERIC(12,2);
  v_lucro_bruto      NUMERIC(12,2);
BEGIN
  IF NOT public.tem_permissao('dre') THEN
    RAISE EXCEPTION 'Você não tem permissão para ver a DRE.';
  END IF;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_servicos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'servico' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_produtos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(desconto), 0) INTO v_descontos
  FROM public.comandas
  WHERE status = 'fechada' AND data BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_outras_receitas
  FROM public.contas_receber
  WHERE data_pagamento BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa
    AND comanda_id IS NULL; -- fiado de venda já entrou como receita da venda

  v_outras_receitas := v_outras_receitas + COALESCE((
    SELECT SUM(valor) FROM public.movimentos_caixa
    WHERE tipo = 'entrada' AND categoria_id IS NOT NULL
      AND data BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa
  ), 0);

  SELECT COALESCE(SUM(ic.quantidade * COALESCE(ic.custo_unitario, 0)), 0) INTO v_cmv
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(co.valor_comissao), 0) INTO v_comissoes
  FROM public.comissoes co
  JOIN public.comandas c ON c.id = co.comanda_id
  WHERE c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND co.status <> 'cancelada' AND c.empresa_id = v_empresa;

  -- Só a taxa que a loja absorveu (a repassada o cliente pagou no acréscimo).
  SELECT COALESCE(SUM(GREATEST(taxa_valor - acrescimo, 0)), 0) INTO v_taxas
  FROM public.comandas
  WHERE status = 'fechada' AND data BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'valor', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(SUM(total), 0)
  INTO v_despesas, v_total_despesas
  FROM (
    SELECT COALESCE(pai.nome, cf.nome, 'Sem categoria') AS cat, SUM(d.valor) AS total
    FROM (
      SELECT cp.categoria_id, cp.valor_pago AS valor
      FROM public.contas_pagar cp
      WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim AND cp.empresa_id = v_empresa
      UNION ALL
      SELECT m.categoria_id, m.valor
      FROM public.movimentos_caixa m
      WHERE m.tipo = 'saida' AND m.categoria_id IS NOT NULL
        AND m.data BETWEEN p_inicio AND p_fim AND m.empresa_id = v_empresa
    ) d
    LEFT JOIN public.categorias_financeiras cf ON cf.id = d.categoria_id
    LEFT JOIN public.categorias_financeiras pai ON pai.id = cf.categoria_pai_id
    GROUP BY COALESCE(pai.nome, cf.nome, 'Sem categoria')
  ) t;

  v_receita_bruta := v_receita_servicos + v_receita_produtos - v_descontos + v_outras_receitas;
  v_lucro_bruto   := v_receita_bruta - (v_cmv + v_comissoes + v_taxas);

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'receita_servicos', v_receita_servicos,
    'receita_produtos', v_receita_produtos,
    'descontos', v_descontos,
    'outras_receitas', v_outras_receitas,
    'receita_bruta', v_receita_bruta,
    'cmv', v_cmv,
    'comissoes', v_comissoes,
    'taxas_pagamento', v_taxas,
    'custos_total', v_cmv + v_comissoes + v_taxas,
    'lucro_bruto', v_lucro_bruto,
    'despesas_por_categoria', v_despesas,
    'despesas_total', v_total_despesas,
    'resultado_operacional', v_lucro_bruto - v_total_despesas
  );
END;
$$;
