-- ================================================================
--  Entrada de mercadoria: à vista (mexe no caixa) ou a prazo (título)
-- ================================================================
-- Segue o mesmo princípio já usado no resto do financeiro: documento
-- → título → baixa → movimento. À vista lança a saída direto em
-- movimentos_caixa (na conta financeira escolhida); a prazo NÃO mexe
-- no caixa — só cria o título em contas_pagar (reaproveitando
-- criar_conta_pagar, que a tela de Contas a Pagar já usa), e o caixa
-- só muda quando esse título for baixado depois.
--
-- Adaptado do Noir ERP: sem tamanhos (Barber não tem
-- produto_tamanhos) e sem preço a prazo (Barber não vende produto
-- parcelado) — só preço à vista.
--
-- #variable_conflict use_column logo no início: sem essa diretiva,
-- qualquer coluna cujo nome bata com um parâmetro de saída do
-- RETURNS TABLE (aqui, "nome") vira ambígua dentro da função — foi
-- exatamente esse bug, encontrado e corrigido no Noir, que motiva já
-- nascer com a proteção aqui.

CREATE OR REPLACE FUNCTION public.registrar_entrada_produtos(
  p_itens               JSONB,
  p_frete               NUMERIC DEFAULT 0,
  p_despesas            NUMERIC DEFAULT 0,
  p_margem_vista        NUMERIC DEFAULT 0,
  p_desconto            NUMERIC DEFAULT 0,
  p_a_vista             BOOLEAN DEFAULT true,
  p_conta_financeira_id UUID DEFAULT NULL,
  p_fornecedor_id       UUID DEFAULT NULL,
  p_data_vencimento     DATE DEFAULT NULL,
  p_parcelas            INTEGER DEFAULT 1
)
RETURNS TABLE (
  produto_id     UUID,
  nome           TEXT,
  quantidade     INTEGER,
  custo_unitario NUMERIC,
  preco_venda    NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_empresa           UUID := public.minha_empresa();
  v_item              JSONB;
  v_total_pago        NUMERIC := 0;
  v_proporcao         NUMERIC;
  v_custo_unitario    NUMERIC;
  v_preco_vista       NUMERIC;
  v_produto_id        UUID;
  v_qtd               INTEGER;
  v_valor_pago        NUMERIC;
  v_itens_desc        TEXT[] := ARRAY[]::TEXT[];
  v_total_entrada     NUMERIC(10,2);
  v_descricao         TEXT;
  v_conta_fin         UUID;
  v_categoria_despesa UUID;
BEGIN
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um item na entrada.';
  END IF;

  SELECT COALESCE(SUM((i->>'valor_pago_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total_pago
  FROM jsonb_array_elements(p_itens) i;

  IF v_total_pago <= 0 THEN
    RAISE EXCEPTION 'Informe o valor pago dos itens.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd        := (v_item->>'quantidade')::INTEGER;
    v_valor_pago := (v_item->>'valor_pago_unitario')::NUMERIC;

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_item->>'nome';
    END IF;
    IF v_valor_pago IS NULL OR v_valor_pago < 0 THEN
      RAISE EXCEPTION 'Valor pago inválido para "%".', v_item->>'nome';
    END IF;

    v_proporcao      := (v_valor_pago * v_qtd) / v_total_pago;
    v_custo_unitario := v_valor_pago + (v_proporcao * (COALESCE(p_frete, 0) + COALESCE(p_despesas, 0) - COALESCE(p_desconto, 0))) / v_qtd;

    v_preco_vista := CASE
      WHEN NULLIF(v_item->>'preco_venda', '') IS NOT NULL THEN (v_item->>'preco_venda')::NUMERIC
      ELSE ROUND(v_custo_unitario * (1 + p_margem_vista / 100), 2)
    END;

    v_produto_id := NULLIF(v_item->>'produto_id', '')::UUID;

    IF v_produto_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto_id AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;

      UPDATE public.produtos SET
        preco_custo   = ROUND(v_custo_unitario, 2),
        preco_venda   = v_preco_vista,
        estoque_atual = estoque_atual + v_qtd
      WHERE id = v_produto_id;
    ELSE
      IF NULLIF(trim(v_item->>'nome'), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o nome do produto novo.';
      END IF;

      INSERT INTO public.produtos (nome, categoria, preco_custo, preco_venda, estoque_atual, unidade, empresa_id)
      VALUES (
        trim(v_item->>'nome'),
        COALESCE(NULLIF(v_item->>'categoria', ''), 'outros'),
        ROUND(v_custo_unitario, 2),
        v_preco_vista,
        v_qtd,
        'un',
        v_empresa
      )
      RETURNING id INTO v_produto_id;
    END IF;

    INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, empresa_id)
    VALUES (v_produto_id, 'entrada', v_qtd, 'Entrada de mercadoria', 'entrada_manual', v_empresa);

    v_itens_desc := array_append(v_itens_desc, trim(v_item->>'nome') || ' (' || v_qtd || 'un)');

    produto_id     := v_produto_id;
    nome           := trim(v_item->>'nome');
    quantidade     := v_qtd;
    custo_unitario := ROUND(v_custo_unitario, 2);
    preco_venda    := v_preco_vista;
    RETURN NEXT;
  END LOOP;

  v_total_entrada := ROUND(v_total_pago + COALESCE(p_frete, 0) + COALESCE(p_despesas, 0) - COALESCE(p_desconto, 0), 2);
  v_descricao := 'Entrada de mercadoria: ' || array_to_string(v_itens_desc, ', ')
    || ' — peças ' || to_char(v_total_pago, 'FM999999990.00')
    || ', frete ' || to_char(COALESCE(p_frete, 0), 'FM999999990.00')
    || ', despesas ' || to_char(COALESCE(p_despesas, 0), 'FM999999990.00')
    || ', desconto ' || to_char(COALESCE(p_desconto, 0), 'FM999999990.00');

  IF p_a_vista THEN
    v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());
    INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
    VALUES ('saida', 'compra_mercadoria', v_descricao, v_total_entrada, NULL, v_conta_fin, v_empresa);
  ELSE
    SELECT id INTO v_categoria_despesa
    FROM public.categorias_financeiras
    WHERE empresa_id = v_empresa AND tipo = 'despesa' AND nome = 'Produtos para revenda'
    LIMIT 1;

    PERFORM public.criar_conta_pagar(
      p_fornecedor_id,
      v_categoria_despesa,
      v_descricao,
      v_total_entrada,
      COALESCE(p_data_vencimento, (CURRENT_DATE + INTERVAL '30 days')::DATE),
      GREATEST(1, COALESCE(p_parcelas, 1)),
      NULL
    );
  END IF;
END;
$$;
