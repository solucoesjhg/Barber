-- ================================================================
-- Estoque mínimo/máximo opcional, datas das parcelas editáveis e
-- maquininhas com taxas próprias
--
-- 1) configuracoes.controla_estoque_minimo: a loja escolhe se trabalha
--    com estoque mínimo e máximo (desligado, as telas escondem os campos
--    e os alertas de estoque baixo).
-- 2) Lançamentos parcelados (conta a pagar, conta a receber e entrada
--    de mercadoria a prazo) aceitam a data de cada parcela em
--    p_vencimentos. Sem ela, continua uma parcela por mês a partir do
--    1º vencimento.
-- 3) Maquininhas (seção 3, abaixo).
-- ================================================================

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS controla_estoque_minimo BOOLEAN NOT NULL DEFAULT true;

-- Datas informadas: uma por parcela, sem vazio e em ordem.
CREATE OR REPLACE FUNCTION public.validar_vencimentos(p_vencimentos DATE[], p_parcelas INTEGER)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  i INTEGER;
BEGIN
  IF p_vencimentos IS NULL THEN
    RETURN;
  END IF;
  IF COALESCE(array_length(p_vencimentos, 1), 0) <> p_parcelas THEN
    RAISE EXCEPTION 'Informe a data de vencimento de cada uma das % parcelas.', p_parcelas;
  END IF;
  FOR i IN 1..p_parcelas LOOP
    IF p_vencimentos[i] IS NULL THEN
      RAISE EXCEPTION 'Informe a data de vencimento da parcela %.', i;
    END IF;
    IF i > 1 AND p_vencimentos[i] < p_vencimentos[i - 1] THEN
      RAISE EXCEPTION 'A parcela % vence antes da parcela %. Coloque as datas em ordem.', i, i - 1;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.criar_conta_pagar(UUID, UUID, TEXT, NUMERIC, DATE, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.criar_conta_receber(UUID, UUID, TEXT, NUMERIC, DATE, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.registrar_entrada_produtos(JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, UUID, UUID, DATE, INTEGER);

CREATE OR REPLACE FUNCTION public.criar_conta_pagar(p_fornecedor_id uuid, p_categoria_id uuid, p_descricao text, p_valor_total numeric, p_data_vencimento date, p_total_parcelas integer DEFAULT 1, p_observacao text DEFAULT NULL::text, p_vencimentos date[] DEFAULT NULL::date[])
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
        v_parcela, COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
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
        v_valor_ultima, COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_conta_receber(p_cliente_id uuid, p_categoria_id uuid, p_descricao text, p_valor_total numeric, p_data_vencimento date, p_total_parcelas integer DEFAULT 1, p_observacao text DEFAULT NULL::text, p_vencimentos date[] DEFAULT NULL::date[])
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
        v_parcela, COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
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
        v_valor_ultima, COALESCE(p_vencimentos[i], (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE),
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_entrada_produtos(p_itens jsonb, p_frete numeric DEFAULT 0, p_despesas numeric DEFAULT 0, p_margem_vista numeric DEFAULT 0, p_desconto numeric DEFAULT 0, p_a_vista boolean DEFAULT true, p_conta_financeira_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_data_vencimento date DEFAULT NULL::date, p_parcelas integer DEFAULT 1, p_vencimentos date[] DEFAULT NULL::date[])
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
      p_vencimentos
    );
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.criar_conta_pagar(UUID, UUID, TEXT, NUMERIC, DATE, INTEGER, TEXT, DATE[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_conta_pagar(UUID, UUID, TEXT, NUMERIC, DATE, INTEGER, TEXT, DATE[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.criar_conta_receber(UUID, UUID, TEXT, NUMERIC, DATE, INTEGER, TEXT, DATE[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_conta_receber(UUID, UUID, TEXT, NUMERIC, DATE, INTEGER, TEXT, DATE[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_entrada_produtos(JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, UUID, UUID, DATE, INTEGER, DATE[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada_produtos(JSONB, NUMERIC, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, UUID, UUID, DATE, INTEGER, DATE[]) TO authenticated;

-- ================================================================
-- 3) Maquininhas: cada uma com a sua tabela de taxas
--
-- Substitui a tabela única taxas_pagamento (da migração 20261024000001).
-- A loja cadastra as maquininhas (Stone, Cielo...) e as taxas de cada
-- uma (Pix, débito e crédito de 1x a 12x). Na venda no cartão escolhe-se
-- a maquininha e a taxa vem dela. As taxas que já estavam cadastradas
-- viram a maquininha "Maquininha".
-- ================================================================

CREATE TABLE IF NOT EXISTS public.maquininhas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL CHECK (trim(nome) <> ''),
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE TABLE IF NOT EXISTS public.taxas_maquininha (
  maquininha_id   UUID NOT NULL REFERENCES public.maquininhas(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'debito', 'credito')),
  parcelas        INTEGER NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
  percentual      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentual >= 0 AND percentual < 100),
  PRIMARY KEY (maquininha_id, forma_pagamento, parcelas),
  CHECK (forma_pagamento = 'credito' OR parcelas = 1)
);

ALTER TABLE public.maquininhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxas_maquininha ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['maquininhas', 'taxas_maquininha'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_leitura', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (empresa_id = public.minha_empresa())', t || '_leitura', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao(''configuracoes'', true))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (empresa_id = public.minha_empresa() AND public.tem_permissao(''configuracoes'', true)) WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao(''configuracoes'', true))', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (empresa_id = public.minha_empresa() AND public.tem_permissao(''configuracoes'', true))', t || '_delete', t);
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maquininhas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxas_maquininha TO authenticated;

-- A taxa de uma maquininha não pode apontar para maquininha de outra loja.
CREATE OR REPLACE FUNCTION public.checar_taxa_maquininha()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.maquininhas WHERE id = NEW.maquininha_id AND empresa_id = NEW.empresa_id) THEN
    RAISE EXCEPTION 'Maquininha não encontrada na sua loja.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_checar_taxa_maquininha ON public.taxas_maquininha;
CREATE TRIGGER trg_checar_taxa_maquininha BEFORE INSERT OR UPDATE ON public.taxas_maquininha
  FOR EACH ROW EXECUTE FUNCTION public.checar_taxa_maquininha();

ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS maquininha_id UUID REFERENCES public.maquininhas(id) ON DELETE SET NULL;

-- Taxas já cadastradas na tabela antiga viram a maquininha "Maquininha".
DO $$
BEGIN
  IF to_regclass('public.taxas_pagamento') IS NOT NULL THEN
    INSERT INTO public.maquininhas (empresa_id, nome)
    SELECT DISTINCT empresa_id, 'Maquininha' FROM public.taxas_pagamento WHERE percentual > 0
    ON CONFLICT (empresa_id, nome) DO NOTHING;

    INSERT INTO public.taxas_maquininha (maquininha_id, empresa_id, forma_pagamento, parcelas, percentual)
    SELECT m.id, t.empresa_id, t.forma_pagamento, t.parcelas, t.percentual
    FROM public.taxas_pagamento t
    JOIN public.maquininhas m ON m.empresa_id = t.empresa_id AND m.nome = 'Maquininha'
    WHERE t.percentual > 0
    ON CONFLICT DO NOTHING;

    UPDATE public.comandas c SET maquininha_id = m.id
    FROM public.maquininhas m
    WHERE m.empresa_id = c.empresa_id AND m.nome = 'Maquininha'
      AND c.maquininha_id IS NULL AND c.taxa_valor > 0;

    DROP TABLE public.taxas_pagamento;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.taxa_pagamento(UUID, TEXT, INTEGER);

-- % da maquininha para a forma/parcelas (0 sem maquininha ou sem taxa).
CREATE OR REPLACE FUNCTION public.taxa_maquininha(p_maquininha UUID, p_forma TEXT, p_parcelas INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT percentual FROM public.taxas_maquininha
    WHERE maquininha_id = p_maquininha
      AND forma_pagamento = p_forma
      AND parcelas = CASE WHEN p_forma = 'credito' THEN GREATEST(COALESCE(p_parcelas, 1), 1) ELSE 1 END
  ), 0);
$$;
REVOKE EXECUTE ON FUNCTION public.taxa_maquininha(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- Valida a maquininha da venda: no débito e no crédito é obrigatória
-- quando a loja tem maquininha cadastrada; no Pix é opcional; no
-- dinheiro não existe. Devolve a maquininha a gravar.
CREATE OR REPLACE FUNCTION public.validar_maquininha(p_empresa UUID, p_forma TEXT, p_maquininha UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_forma = 'dinheiro' THEN
    RETURN NULL;
  END IF;
  IF p_maquininha IS NULL THEN
    IF p_forma IN ('debito', 'credito')
       AND EXISTS (SELECT 1 FROM public.maquininhas WHERE empresa_id = p_empresa AND ativo) THEN
      RAISE EXCEPTION 'Escolha a maquininha do cartão.';
    END IF;
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.maquininhas WHERE id = p_maquininha AND empresa_id = p_empresa) THEN
    RAISE EXCEPTION 'Maquininha não encontrada na sua loja.';
  END IF;
  RETURN p_maquininha;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_maquininha(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;


-- Venda e edição recebem a maquininha; a taxa vem da tabela dela.
CREATE OR REPLACE FUNCTION public.lancar_taxa_venda(p_comanda_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comanda RECORD;
  v_conta   UUID;
  v_maq     TEXT;
BEGIN
  SELECT id, empresa_id, data, forma_pagamento, parcelas, taxa_percentual, taxa_valor, maquininha_id
  INTO v_comanda FROM public.comandas WHERE id = p_comanda_id;
  SELECT nome INTO v_maq FROM public.maquininhas WHERE id = v_comanda.maquininha_id;

  DELETE FROM public.movimentos_caixa WHERE comanda_id = p_comanda_id AND categoria = 'taxa_cartao';
  IF COALESCE(v_comanda.taxa_valor, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT conta_financeira_id INTO v_conta FROM public.movimentos_caixa
  WHERE comanda_id = p_comanda_id AND categoria = 'venda' ORDER BY created_at LIMIT 1;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, comanda_id, conta_financeira_id, empresa_id)
  VALUES ('saida', 'taxa_cartao',
          'Taxa ' || COALESCE(v_maq || ' · ', '') || public.rotulo_pagamento(v_comanda.forma_pagamento, v_comanda.parcelas)
            || ' (' || replace(to_char(v_comanda.taxa_percentual, 'FM990.00'), '.', ',') || '%)',
          v_comanda.taxa_valor, v_comanda.data, p_comanda_id,
          COALESCE(v_conta, public.conta_financeira_padrao()), v_comanda.empresa_id);
END;
$$;

DROP FUNCTION IF EXISTS public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome TEXT,
  p_cliente_id UUID,
  p_forma_pagamento TEXT,
  p_itens JSONB,
  p_conta_financeira_id UUID DEFAULT NULL,
  p_parcelas INTEGER DEFAULT 1,
  p_maquininha_id UUID DEFAULT NULL
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

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, parcelas, maquininha_id, taxa_percentual, taxa_valor, empresa_id, usuario_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento,
          v_parcelas, v_maquininha, v_taxa_pct, ROUND(v_total * v_taxa_pct / 100, 2), v_empresa, auth.uid())
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
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total, v_comanda_id, v_sessao_id, v_conta_fin, v_empresa);

  PERFORM public.lancar_taxa_venda(v_comanda_id);

  RETURN v_comanda_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION public.editar_venda(
  p_comanda_id UUID,
  p_cliente_nome TEXT,
  p_forma_pagamento TEXT,
  p_itens JSONB,
  p_sem_comissao BOOLEAN DEFAULT false,
  p_parcelas INTEGER DEFAULT 1,
  p_maquininha_id UUID DEFAULT NULL
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
  v_maquininha     UUID;
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

  UPDATE public.comandas
  SET cliente_nome    = COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão'),
      forma_pagamento = p_forma_pagamento,
      parcelas        = v_parcelas,
      maquininha_id   = v_maquininha,
      taxa_percentual = v_taxa_pct,
      taxa_valor      = ROUND(v_total * v_taxa_pct / 100, 2),
      total           = v_total
  WHERE id = p_comanda_id;

  IF NOT COALESCE(p_sem_comissao, false) THEN
    PERFORM public.gerar_comissoes_venda(p_comanda_id);
  END IF;

  -- Corrige o lançamento que a venda já tinha (nunca cria outro).
  UPDATE public.movimentos_caixa
  SET valor     = v_total,
      descricao = 'Venda — ' || COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão')
  WHERE comanda_id = p_comanda_id AND empresa_id = v_empresa AND categoria = 'venda';

  PERFORM public.lancar_taxa_venda(p_comanda_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER, UUID) TO authenticated;
