-- ================================================================
-- Repassar a taxa da maquininha ao cliente
--
-- Com o repasse, o cliente paga o valor da venda com a taxa embutida,
-- calculado para a loja receber o valor cheio depois do desconto da
-- maquininha: cobrado = total / (1 - taxa%). comandas.acrescimo guarda
-- o que o cliente pagou a mais; comandas.total continua sendo o valor
-- dos itens (faturamento). A entrada no caixa é o valor cobrado.
-- Com repasse a comissão não desconta a taxa, e a DRE só conta como
-- custo a taxa que a loja absorveu.
-- Configurações: repasse_taxa_padrao (nunca / credito_parcelado /
-- sempre) define se a opção já vem marcada na venda.
-- ================================================================

ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS acrescimo NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS repasse_taxa_padrao TEXT NOT NULL DEFAULT 'nunca';
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_repasse_taxa_padrao_check;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_repasse_taxa_padrao_check
  CHECK (repasse_taxa_padrao IN ('nunca', 'credito_parcelado', 'sempre'));

-- Valor cobrado do cliente, acréscimo e taxa da maquininha.
CREATE OR REPLACE FUNCTION public.calcular_cobranca(p_total NUMERIC, p_taxa_pct NUMERIC, p_repassar BOOLEAN)
RETURNS TABLE(cobrado NUMERIC, acrescimo NUMERIC, taxa_valor NUMERIC)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF COALESCE(p_repassar, false) AND COALESCE(p_taxa_pct, 0) > 0 THEN
    cobrado := ROUND(p_total / (1 - p_taxa_pct / 100), 2);
  ELSE
    cobrado := p_total;
  END IF;
  acrescimo  := cobrado - p_total;
  taxa_valor := ROUND(cobrado * COALESCE(p_taxa_pct, 0) / 100, 2);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.gerar_comissoes_venda(p_comanda_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comanda  RECORD;
  v_item     RECORD;
  v_desconta BOOLEAN;
  v_pct      NUMERIC(5,2);
  v_bruto    NUMERIC(10,2);
  v_taxa     NUMERIC(10,2);
BEGIN
  SELECT id, empresa_id, taxa_percentual, acrescimo INTO v_comanda FROM public.comandas WHERE id = p_comanda_id;
  SELECT COALESCE(comissao_desconta_taxa, true) INTO v_desconta FROM public.configuracoes WHERE empresa_id = v_comanda.empresa_id;
  -- Taxa repassada ao cliente: a loja não perdeu nada, a base fica cheia.
  v_desconta := COALESCE(v_desconta, true) AND COALESCE(v_comanda.acrescimo, 0) = 0;

  FOR v_item IN
    SELECT id, tipo, referencia_id, quantidade, preco_unitario, profissional_id
    FROM public.itens_comanda WHERE comanda_id = p_comanda_id AND profissional_id IS NOT NULL
  LOOP
    v_pct := NULL;
    IF v_item.tipo = 'servico' THEN
      SELECT comissao_percentual INTO v_pct FROM public.servicos WHERE id = v_item.referencia_id AND empresa_id = v_comanda.empresa_id;
    ELSE
      SELECT comissao_percentual INTO v_pct FROM public.produtos WHERE id = v_item.referencia_id AND empresa_id = v_comanda.empresa_id;
    END IF;
    IF v_pct IS NULL THEN
      SELECT comissao_percentual INTO v_pct FROM public.profissionais WHERE id = v_item.profissional_id AND empresa_id = v_comanda.empresa_id;
    END IF;
    CONTINUE WHEN v_pct IS NULL OR v_pct <= 0;

    v_bruto := v_item.preco_unitario * v_item.quantidade;
    v_taxa  := CASE WHEN v_desconta THEN ROUND(v_bruto * v_comanda.taxa_percentual / 100, 2) ELSE 0 END;

    INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, taxa_valor, percentual, valor_comissao, status, empresa_id)
    VALUES (v_item.profissional_id, p_comanda_id, v_item.id, v_bruto - v_taxa, v_taxa, v_pct,
            ROUND((v_bruto - v_taxa) * v_pct / 100, 2), 'pendente', v_comanda.empresa_id);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerar_comissoes_venda(UUID) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome TEXT,
  p_cliente_id UUID,
  p_forma_pagamento TEXT,
  p_itens JSONB,
  p_conta_financeira_id UUID DEFAULT NULL,
  p_parcelas INTEGER DEFAULT 1,
  p_maquininha_id UUID DEFAULT NULL,
  p_repassar_taxa BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa         UUID := public.minha_empresa();
  v_comanda_id      UUID;
  v_sessao_id       UUID;
  v_total           NUMERIC(10,2) := 0;
  v_item            JSONB;
  v_qtd             INTEGER;
  v_custo_unitario  NUMERIC(10,2);
  v_conta_fin       UUID;
  v_parcelas        INTEGER;
  v_taxa_pct        NUMERIC(5,2);
  v_maquininha      UUID;
  v_cobrado         NUMERIC(10,2);
  v_acrescimo       NUMERIC(10,2) := 0;
  v_taxa_valor      NUMERIC(10,2);
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('pix', 'credito', 'debito', 'dinheiro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa ter ao menos um item.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;

  v_parcelas := public.validar_parcelas(v_empresa, p_forma_pagamento, p_parcelas);
  v_maquininha := public.validar_maquininha(v_empresa, p_forma_pagamento, p_maquininha_id);
  v_taxa_pct := CASE WHEN v_maquininha IS NULL THEN 0
                     ELSE public.taxa_maquininha(v_maquininha, p_forma_pagamento, v_parcelas) END;

  PERFORM public.fechar_caixas_vencidos(v_empresa);

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF COALESCE((v_item->>'quantidade')::INTEGER, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_item->>'nome';
    END IF;
    IF COALESCE((v_item->>'preco_unitario')::NUMERIC, -1) < 0 THEN
      RAISE EXCEPTION 'Preço inválido para "%".', v_item->>'nome';
    END IF;
    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
      IF NULLIF(v_item->>'profissional_id', '') IS NULL THEN
        RAISE EXCEPTION 'Escolha o profissional do serviço "%".', v_item->>'nome';
      END IF;
    ELSE
      RAISE EXCEPTION 'Item "%" com tipo inválido.', v_item->>'nome';
    END IF;
    IF NULLIF(v_item->>'profissional_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profissionais
      WHERE id = (v_item->>'profissional_id')::UUID AND empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'Profissional do item "%" não encontrado na sua loja.', v_item->>'nome';
    END IF;
  END LOOP;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  SELECT * INTO v_cobrado, v_acrescimo, v_taxa_valor FROM public.calcular_cobranca(v_total, v_taxa_pct, p_repassar_taxa);

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, parcelas, maquininha_id, taxa_percentual, taxa_valor, acrescimo, empresa_id, usuario_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento,
          v_parcelas, v_maquininha, v_taxa_pct, v_taxa_valor, v_acrescimo, v_empresa, auth.uid())
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd            := (v_item->>'quantidade')::INTEGER;
    v_custo_unitario := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, empresa_id)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd,
            (v_item->>'preco_unitario')::NUMERIC, NULLIF(v_item->>'profissional_id', '')::UUID, v_custo_unitario, v_empresa);

    IF v_item->>'tipo' = 'produto' THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV', 'comanda', v_comanda_id, v_empresa);
    END IF;
  END LOOP;

  PERFORM public.gerar_comissoes_venda(v_comanda_id);

  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());
  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_cobrado, v_comanda_id, v_sessao_id, v_conta_fin, v_empresa);

  PERFORM public.lancar_taxa_venda(v_comanda_id);

  RETURN v_comanda_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER, UUID, BOOLEAN) TO authenticated;

DROP FUNCTION IF EXISTS public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER, UUID);

CREATE OR REPLACE FUNCTION public.editar_venda(
  p_comanda_id UUID,
  p_cliente_nome TEXT,
  p_forma_pagamento TEXT,
  p_itens JSONB,
  p_sem_comissao BOOLEAN DEFAULT false,
  p_parcelas INTEGER DEFAULT 1,
  p_maquininha_id UUID DEFAULT NULL,
  p_repassar_taxa BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa        UUID := public.minha_empresa();
  v_comanda        RECORD;
  v_antigo         RECORD;
  v_item           JSONB;
  v_qtd            INTEGER;
  v_produto_id     UUID;
  v_custo_unitario NUMERIC(10,2);
  v_total          NUMERIC(10,2) := 0;
  v_custos_antigos JSONB := '{}'::jsonb;
  v_parcelas       INTEGER;
  v_taxa_pct       NUMERIC(5,2);
  v_maquininha      UUID;
  v_cobrado         NUMERIC(10,2);
  v_acrescimo       NUMERIC(10,2) := 0;
  v_taxa_valor      NUMERIC(10,2);
BEGIN
  IF NOT (public.pode_gerenciar_equipe() AND public.tem_permissao('pdv', true)) THEN
    RAISE EXCEPTION 'Só administrador ou gerente (com permissão de editar Vendas) pode editar uma venda.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT * INTO v_comanda FROM public.comandas
  WHERE id = p_comanda_id AND empresa_id = v_empresa
  FOR UPDATE;
  IF v_comanda IS NULL THEN
    RAISE EXCEPTION 'Venda não encontrada.';
  END IF;
  IF v_comanda.status <> 'fechada' THEN
    RAISE EXCEPTION 'Só é possível editar vendas fechadas.';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa ter ao menos um item.';
  END IF;
  IF p_forma_pagamento IS NULL OR p_forma_pagamento NOT IN ('pix', 'credito', 'debito', 'dinheiro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.';
  END IF;

  v_parcelas := public.validar_parcelas(v_empresa, p_forma_pagamento, p_parcelas);
  -- Mesma forma, parcelas e maquininha: mantém a taxa da época da venda.
  IF p_forma_pagamento = v_comanda.forma_pagamento AND v_parcelas = COALESCE(v_comanda.parcelas, 1)
     AND p_maquininha_id IS NOT DISTINCT FROM v_comanda.maquininha_id THEN
    v_maquininha := v_comanda.maquininha_id;
    v_taxa_pct := COALESCE(v_comanda.taxa_percentual, 0);
  ELSE
    v_maquininha := public.validar_maquininha(v_empresa, p_forma_pagamento, p_maquininha_id);
    v_taxa_pct := CASE WHEN v_maquininha IS NULL THEN 0
                       ELSE public.taxa_maquininha(v_maquininha, p_forma_pagamento, v_parcelas) END;
  END IF;

  -- Mesmas validações de finalizar_venda.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF COALESCE((v_item->>'quantidade')::INTEGER, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_item->>'nome';
    END IF;
    IF COALESCE((v_item->>'preco_unitario')::NUMERIC, -1) < 0 THEN
      RAISE EXCEPTION 'Preço inválido para "%".', v_item->>'nome';
    END IF;
    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
      IF NULLIF(v_item->>'profissional_id', '') IS NULL THEN
        RAISE EXCEPTION 'Escolha o profissional do serviço "%".', v_item->>'nome';
      END IF;
    ELSE
      RAISE EXCEPTION 'Item "%" com tipo inválido.', v_item->>'nome';
    END IF;
    IF NULLIF(v_item->>'profissional_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profissionais
      WHERE id = (v_item->>'profissional_id')::UUID AND empresa_id = v_empresa
    ) THEN
      RAISE EXCEPTION 'Profissional do item "%" não encontrado na sua loja.', v_item->>'nome';
    END IF;
  END LOOP;

  -- Devolve ao estoque os produtos dos itens antigos e guarda o custo
  -- que cada produto tinha na venda.
  FOR v_antigo IN
    SELECT referencia_id, quantidade, custo_unitario FROM public.itens_comanda
    WHERE comanda_id = p_comanda_id AND tipo = 'produto'
  LOOP
    UPDATE public.produtos SET estoque_atual = estoque_atual + v_antigo.quantidade
    WHERE id = v_antigo.referencia_id AND empresa_id = v_empresa;

    INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
    VALUES (v_antigo.referencia_id, 'devolucao', v_antigo.quantidade, 'Estorno por edição de venda', 'comanda', p_comanda_id, v_empresa);

    IF v_antigo.custo_unitario IS NOT NULL THEN
      v_custos_antigos := v_custos_antigos || jsonb_build_object(v_antigo.referencia_id::TEXT, v_antigo.custo_unitario);
    END IF;
  END LOOP;

  DELETE FROM public.comissoes WHERE comanda_id = p_comanda_id;
  DELETE FROM public.itens_comanda WHERE comanda_id = p_comanda_id;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd            := (v_item->>'quantidade')::INTEGER;
    v_custo_unitario := NULL;
    v_produto_id     := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      v_produto_id := (v_item->>'referencia_id')::UUID;
      IF v_custos_antigos ? v_produto_id::TEXT THEN
        v_custo_unitario := (v_custos_antigos->>v_produto_id::TEXT)::NUMERIC;
      ELSE
        SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = v_produto_id AND empresa_id = v_empresa;
      END IF;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, empresa_id)
    VALUES (p_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd,
            (v_item->>'preco_unitario')::NUMERIC, NULLIF(v_item->>'profissional_id', '')::UUID, v_custo_unitario, v_empresa);

    IF v_produto_id IS NOT NULL THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = v_produto_id AND empresa_id = v_empresa;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES (v_produto_id, 'venda', -v_qtd, 'Venda (edição)', 'comanda', p_comanda_id, v_empresa);
    END IF;
  END LOOP;

  SELECT * INTO v_cobrado, v_acrescimo, v_taxa_valor FROM public.calcular_cobranca(v_total, v_taxa_pct, p_repassar_taxa);

  UPDATE public.comandas
  SET cliente_nome    = COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão'),
      forma_pagamento = p_forma_pagamento,
      parcelas        = v_parcelas,
      maquininha_id   = v_maquininha,
      taxa_percentual = v_taxa_pct,
      taxa_valor      = v_taxa_valor,
      acrescimo       = v_acrescimo,
      total           = v_total
  WHERE id = p_comanda_id;

  IF NOT COALESCE(p_sem_comissao, false) THEN
    PERFORM public.gerar_comissoes_venda(p_comanda_id);
  END IF;

  -- Corrige o lançamento que a venda já tinha (nunca cria outro).
  UPDATE public.movimentos_caixa
  SET valor     = v_cobrado,
      descricao = 'Venda — ' || COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão')
  WHERE comanda_id = p_comanda_id AND empresa_id = v_empresa AND categoria = 'venda';

  PERFORM public.lancar_taxa_venda(p_comanda_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.calcular_dre(p_inicio DATE, p_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_receita_servicos NUMERIC(12,2);
  v_receita_produtos NUMERIC(12,2);
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

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_outras_receitas
  FROM public.contas_receber
  WHERE data_pagamento BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

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
    SELECT COALESCE(pai.nome, cf.nome, 'Sem categoria') AS cat, SUM(cp.valor_pago) AS total
    FROM public.contas_pagar cp
    LEFT JOIN public.categorias_financeiras cf ON cf.id = cp.categoria_id
    LEFT JOIN public.categorias_financeiras pai ON pai.id = cf.categoria_pai_id
    WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim AND cp.empresa_id = v_empresa
    GROUP BY COALESCE(pai.nome, cf.nome, 'Sem categoria')
  ) t;

  v_receita_bruta := v_receita_servicos + v_receita_produtos + v_outras_receitas;
  v_lucro_bruto   := v_receita_bruta - (v_cmv + v_comissoes + v_taxas);

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'receita_servicos', v_receita_servicos,
    'receita_produtos', v_receita_produtos,
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

-- ----------------------------------------------------------------
-- Maquininhas passam para a tela Categorias & Pagamentos: quem edita
-- essa tela (ou Configurações) cadastra maquininhas e taxas.
-- ----------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  pode TEXT := '(public.tem_permissao(''categorias'', true) OR public.tem_permissao(''configuracoes'', true))';
BEGIN
  FOREACH t IN ARRAY ARRAY['maquininhas', 'taxas_maquininha'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id = public.minha_empresa() AND %s)', t || '_insert', t, pode);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (empresa_id = public.minha_empresa() AND %s) WITH CHECK (empresa_id = public.minha_empresa() AND %s)', t || '_update', t, pode, pode);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (empresa_id = public.minha_empresa() AND %s)', t || '_delete', t, pode);
  END LOOP;
END;
$$;

-- Opções de pagamento da loja (ficam em configuracoes, mas são editadas
-- na mesma tela das maquininhas).
CREATE OR REPLACE FUNCTION public.salvar_opcoes_pagamento(p_parcelas_maximas INTEGER, p_desconta_comissao BOOLEAN, p_repasse_padrao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT (public.tem_permissao('categorias', true) OR public.tem_permissao('configuracoes', true)) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar as opções de pagamento.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_parcelas_maximas IS NULL OR p_parcelas_maximas NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'O parcelamento máximo vai de 1x a 12x.';
  END IF;
  IF p_repasse_padrao NOT IN ('nunca', 'credito_parcelado', 'sempre') THEN
    RAISE EXCEPTION 'Opção de repasse inválida.';
  END IF;

  INSERT INTO public.configuracoes (empresa_id) VALUES (v_empresa) ON CONFLICT (empresa_id) DO NOTHING;
  UPDATE public.configuracoes
  SET parcelas_maximas = p_parcelas_maximas,
      comissao_desconta_taxa = COALESCE(p_desconta_comissao, true),
      repasse_taxa_padrao = p_repasse_padrao,
      updated_at = now()
  WHERE empresa_id = v_empresa;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.salvar_opcoes_pagamento(INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.salvar_opcoes_pagamento(INTEGER, BOOLEAN, TEXT) TO authenticated;

-- ----------------------------------------------------------------
-- Os mais vendidos da loja (últimos 90 dias), para os atalhos da tela
-- de Vendas. Conta a loja toda, não só as vendas que o usuário vê.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mais_vendidos(p_limite INTEGER DEFAULT 10)
RETURNS TABLE(tipo TEXT, referencia_id UUID, quantidade BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ic.tipo, ic.referencia_id, SUM(ic.quantidade)::BIGINT AS quantidade
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE c.empresa_id = public.minha_empresa()
    AND c.status = 'fechada'
    AND c.data >= CURRENT_DATE - 90
    AND public.tem_permissao('pdv')
  GROUP BY ic.tipo, ic.referencia_id
  ORDER BY 3 DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 10), 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.mais_vendidos(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mais_vendidos(INTEGER) TO authenticated;
