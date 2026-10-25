-- ================================================================
--  Parcelas com valor escolhido (contas a pagar/receber e entrada de
--  mercadoria), além da data
-- ================================================================
-- p_valores: o valor de cada parcela (mesma ordem de p_vencimentos).
-- Sem ele, continua o rateio igual (o arredondamento na última).

CREATE OR REPLACE FUNCTION public.validar_valores_parcelas(p_valores NUMERIC[], p_parcelas INTEGER, p_total NUMERIC)
RETURNS VOID
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE v_soma NUMERIC := 0; i INTEGER;
BEGIN
  IF p_valores IS NULL THEN RETURN; END IF;
  IF COALESCE(array_length(p_valores, 1), 0) <> p_parcelas THEN
    RAISE EXCEPTION 'Informe o valor de todas as parcelas.';
  END IF;
  FOR i IN 1..p_parcelas LOOP
    IF p_valores[i] IS NULL OR p_valores[i] <= 0 THEN
      RAISE EXCEPTION 'Cada parcela precisa ter valor maior que zero.';
    END IF;
    v_soma := v_soma + ROUND(p_valores[i], 2);
  END LOOP;
  IF abs(v_soma - ROUND(p_total, 2)) > 0.009 THEN
    RAISE EXCEPTION 'As parcelas somam R$ % e o total é R$ %. Ajuste os valores.',
      replace(to_char(v_soma, 'FM999999990.00'), '.', ','), replace(to_char(p_total, 'FM999999990.00'), '.', ',');
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.criar_conta_pagar(uuid, uuid, text, numeric, date, integer, text, date[]);
CREATE OR REPLACE FUNCTION public.criar_conta_pagar(p_fornecedor_id uuid, p_categoria_id uuid, p_descricao text, p_valor_total numeric, p_data_vencimento date, p_total_parcelas integer DEFAULT 1, p_observacao text DEFAULT NULL::text, p_vencimentos date[] DEFAULT NULL::date[], p_valores numeric[] DEFAULT NULL::numeric[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.tem_permissao('contas_pagar', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  PERFORM public.validar_vencimentos(p_vencimentos, p_total_parcelas);
  PERFORM public.validar_valores_parcelas(p_valores, p_total_parcelas, p_valor_total);
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        COALESCE(ROUND(p_valores[i], 2), v_parcela), COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        COALESCE(ROUND(p_valores[i], 2), v_valor_ultima), COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.criar_conta_pagar(uuid, uuid, text, numeric, date, integer, text, date[], numeric[]) TO authenticated;

DROP FUNCTION IF EXISTS public.criar_conta_receber(uuid, uuid, text, numeric, date, integer, text, date[]);
CREATE OR REPLACE FUNCTION public.criar_conta_receber(p_cliente_id uuid, p_categoria_id uuid, p_descricao text, p_valor_total numeric, p_data_vencimento date, p_total_parcelas integer DEFAULT 1, p_observacao text DEFAULT NULL::text, p_vencimentos date[] DEFAULT NULL::date[], p_valores numeric[] DEFAULT NULL::numeric[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.tem_permissao('contas_receber', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  PERFORM public.validar_vencimentos(p_vencimentos, p_total_parcelas);
  PERFORM public.validar_valores_parcelas(p_valores, p_total_parcelas, p_valor_total);
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        COALESCE(ROUND(p_valores[i], 2), v_parcela), COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        COALESCE(ROUND(p_valores[i], 2), v_valor_ultima), COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.criar_conta_receber(uuid, uuid, text, numeric, date, integer, text, date[], numeric[]) TO authenticated;

DROP FUNCTION IF EXISTS public.registrar_entrada_produtos(jsonb, numeric, numeric, numeric, numeric, boolean, uuid, uuid, date, integer, date[]);
CREATE OR REPLACE FUNCTION public.registrar_entrada_produtos(p_itens jsonb, p_frete numeric DEFAULT 0, p_despesas numeric DEFAULT 0, p_margem_vista numeric DEFAULT 0, p_desconto numeric DEFAULT 0, p_a_vista boolean DEFAULT true, p_conta_financeira_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_data_vencimento date DEFAULT NULL::date, p_parcelas integer DEFAULT 1, p_vencimentos date[] DEFAULT NULL::date[], p_valores numeric[] DEFAULT NULL::numeric[])
 RETURNS TABLE(produto_id uuid, nome text, quantidade integer, custo_unitario numeric, preco_venda numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (public.tem_permissao('produtos', true) AND public.pode_ver_custo_produtos()) THEN
    RAISE EXCEPTION 'Você não tem permissão para dar entrada de mercadoria (precisa editar Produtos e ver o custo).';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
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
      NULL,
      p_vencimentos,
      p_valores
    );
  END IF;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_produtos(jsonb, numeric, numeric, numeric, numeric, boolean, uuid, uuid, date, integer, date[], numeric[]) TO authenticated;
