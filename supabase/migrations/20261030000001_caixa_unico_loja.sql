-- ================================================================
-- Caixa único por loja
-- ================================================================
-- Antes cada usuário abria o próprio caixa. Agora a loja tem um caixa:
-- quem tem permissão de Caixa abre uma vez e todas as vendas,
-- recebimentos e lançamentos da loja entram nele até alguém fechar.
--
-- - Caixas abertos ao mesmo tempo na mesma loja são juntados no mais
--   antigo (valor inicial somado e lançamentos movidos para ele).
-- - Só um caixa aberto por loja (índice único).
-- - sessoes_caixa.usuario_id continua sendo quem abriu; fechado_por
--   guarda quem fechou.
-- - Quem tem a tela Caixa vê os lançamentos do caixa da loja.
-- Idempotente.

ALTER TABLE public.sessoes_caixa ADD COLUMN IF NOT EXISTS fechado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1) Junta os caixas abertos de cada loja no mais antigo.
DO $$
DECLARE
  v RECORD;
BEGIN
  FOR v IN
    SELECT s.id, s.valor_inicial,
           first_value(s.id) OVER (PARTITION BY s.empresa_id ORDER BY s.aberto_em, s.id) AS principal
    FROM public.sessoes_caixa s
    WHERE s.status = 'aberto'
  LOOP
    IF v.id <> v.principal THEN
      UPDATE public.movimentos_caixa SET sessao_caixa_id = v.principal WHERE sessao_caixa_id = v.id;
      UPDATE public.sessoes_caixa SET valor_inicial = valor_inicial + v.valor_inicial WHERE id = v.principal;
      DELETE FROM public.sessoes_caixa WHERE id = v.id;
    END IF;
  END LOOP;
END;
$$;

-- 2) Um caixa aberto por loja.
DROP INDEX IF EXISTS public.idx_sessao_caixa_aberta_unica;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_caixa_aberta_loja ON public.sessoes_caixa (empresa_id) WHERE status = 'aberto';

-- 3) Quem vê o caixa da loja.
DROP POLICY IF EXISTS "sessoes_caixa_select" ON public.sessoes_caixa;
CREATE POLICY "sessoes_caixa_select" ON public.sessoes_caixa FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND (
    usuario_id = auth.uid() OR public.tem_permissao('caixa') OR public.tem_permissao('pdv')
    OR public.tem_permissao('financeiro') OR public.pode_ver_vendas_outros()
  ));

DROP POLICY IF EXISTS "movimentos_caixa_select" ON public.movimentos_caixa;
CREATE POLICY "movimentos_caixa_select" ON public.movimentos_caixa FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND (
    public.tem_permissao('financeiro')
    OR (comanda_id IS NOT NULL AND public.pode_ver_vendas_outros())
    OR (sessao_caixa_id IS NOT NULL AND public.tem_permissao('caixa'))
    OR EXISTS (SELECT 1 FROM public.sessoes_caixa s WHERE s.id = movimentos_caixa.sessao_caixa_id AND s.usuario_id = auth.uid())
  ));

-- 4) Funções do caixa: usam o caixa aberto da loja (antes: o do usuário).
CREATE OR REPLACE FUNCTION public.abrir_caixa(p_valor_inicial numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT public.tem_permissao('caixa', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  PERFORM public.fechar_caixas_vencidos(v_empresa);

  IF EXISTS (SELECT 1 FROM public.sessoes_caixa WHERE empresa_id = public.minha_empresa() AND status = 'aberto') THEN
    RAISE EXCEPTION 'O caixa da loja já está aberto.';
  END IF;

  INSERT INTO public.sessoes_caixa (usuario_id, empresa_id, valor_inicial)
  VALUES (auth.uid(), v_empresa, COALESCE(p_valor_inicial, 0))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.fechar_caixa(p_sessao_id uuid, p_valor_informado numeric, p_observacao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicial  NUMERIC;
  v_entradas NUMERIC;
  v_saidas   NUMERIC;
  v_esperado NUMERIC;
BEGIN
  IF NOT public.tem_permissao('caixa', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa.';
  END IF;
  SELECT valor_inicial INTO v_inicial
  FROM public.sessoes_caixa
  WHERE id = p_sessao_id AND status = 'aberto' AND empresa_id = public.minha_empresa();

  IF v_inicial IS NULL THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada ou já fechada.';
  END IF;

  SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0),
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)
  INTO v_entradas, v_saidas
  FROM public.movimentos_caixa
  WHERE sessao_caixa_id = p_sessao_id;

  v_esperado := v_inicial + v_entradas - v_saidas;

  UPDATE public.sessoes_caixa
  SET status = 'fechado',
      fechado_em = NOW(),
      saldo_esperado = v_esperado,
      valor_informado = p_valor_informado,
      diferenca = p_valor_informado - v_esperado,
      observacao_fechamento = p_observacao,
      fechado_por = auth.uid()
  WHERE id = p_sessao_id;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.baixar_conta_receber(p_conta_id uuid, p_valor_pago numeric, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_conta      RECORD;
  v_novo_pago  NUMERIC(10,2);
  v_sessao_id  UUID;
  v_conta_fin  UUID;
BEGIN
  IF NOT public.tem_permissao('contas_receber', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível receber novamente.', v_conta.status; END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
  IF v_conta.valor_pago + p_valor_pago > v_conta.valor THEN
    RAISE EXCEPTION 'Valor recebido (%) excede o saldo restante (%) dessa conta.', p_valor_pago, (v_conta.valor - v_conta.valor_pago);
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;
  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  UPDATE public.contas_receber
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE empresa_id = public.minha_empresa() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'conta_a_receber', 'Recebimento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_conta_fin, v_empresa);
END;
$function$

;

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(p_conta_id uuid, p_valor_pago numeric, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_conta      RECORD;
  v_novo_pago  NUMERIC(10,2);
  v_sessao_id  UUID;
  v_conta_fin  UUID;
BEGIN
  IF NOT public.tem_permissao('contas_pagar', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT * INTO v_conta FROM public.contas_pagar WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível pagar novamente.', v_conta.status; END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
  IF v_conta.valor_pago + p_valor_pago > v_conta.valor THEN
    RAISE EXCEPTION 'Valor pago (%) excede o saldo restante (%) dessa conta.', p_valor_pago, (v_conta.valor - v_conta.valor_pago);
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;
  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  UPDATE public.contas_pagar
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE empresa_id = public.minha_empresa() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('saida', 'conta_a_pagar', 'Pagamento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_conta_fin, v_empresa);
END;
$function$

;

CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(p_tipo text, p_categoria text, p_descricao text, p_valor numeric, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES (p_tipo, p_categoria, p_descricao, p_valor, v_sessao_id, v_conta, v_empresa)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.finalizar_venda(p_cliente_nome text, p_cliente_id uuid, p_forma_pagamento text, p_itens jsonb, p_conta_financeira_id uuid DEFAULT NULL::uuid, p_parcelas integer DEFAULT 1, p_maquininha_id uuid DEFAULT NULL::uuid, p_repassar_taxa boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE empresa_id = public.minha_empresa() AND status = 'aberto';
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
$function$

;

