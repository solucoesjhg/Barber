-- ================================================================
-- Transferência entre contas, taxas de cartão e fechamento
-- automático do caixa
--
-- 1) transferir_entre_contas: uma saída na conta de origem e uma
--    entrada na de destino, ligadas por transferencia_id (categoria
--    'transferencia'; as telas não contam como entrada/saída real).
-- 2) Taxas de pagamento por loja (Pix, débito e crédito de 1x a 12x).
--    A venda grava parcelas, % e valor da taxa; a taxa vira uma saída
--    "taxa_cartao" na mesma conta da venda (fora da sessão de caixa) e,
--    se a loja quiser, é descontada da base da comissão.
-- 3) O caixa aberto fecha sozinho no horário de fechamento da loja
--    (Configurações). Roda pelo pg_cron, quando disponível, e também
--    antes de abrir caixa, vender ou lançar movimento.
-- ================================================================

-- ----------------------------------------------------------------
-- 0) Colunas novas
-- ----------------------------------------------------------------
ALTER TABLE public.movimentos_caixa ADD COLUMN IF NOT EXISTS transferencia_id UUID;
CREATE INDEX IF NOT EXISTS idx_movimentos_caixa_transferencia ON public.movimentos_caixa (transferencia_id);

ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS parcelas INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS taxa_percentual NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS taxa_valor NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Parte da taxa do cartão descontada da base desta comissão.
ALTER TABLE public.comissoes ADD COLUMN IF NOT EXISTS taxa_valor NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS fechamento_automatico BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS comissao_desconta_taxa BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS parcelas_maximas INTEGER NOT NULL DEFAULT 12;
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_parcelas_maximas_check;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_parcelas_maximas_check CHECK (parcelas_maximas BETWEEN 1 AND 12);

-- ----------------------------------------------------------------
-- 1) Taxas de pagamento
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.taxas_pagamento (
  empresa_id      UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'debito', 'credito')),
  parcelas        INTEGER NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
  percentual      NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentual >= 0 AND percentual < 100),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, forma_pagamento, parcelas),
  CHECK (forma_pagamento = 'credito' OR parcelas = 1)
);

ALTER TABLE public.taxas_pagamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taxas_pagamento_leitura ON public.taxas_pagamento;
CREATE POLICY taxas_pagamento_leitura ON public.taxas_pagamento FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
DROP POLICY IF EXISTS taxas_pagamento_insert ON public.taxas_pagamento;
CREATE POLICY taxas_pagamento_insert ON public.taxas_pagamento FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true));
DROP POLICY IF EXISTS taxas_pagamento_update ON public.taxas_pagamento;
CREATE POLICY taxas_pagamento_update ON public.taxas_pagamento FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true));
DROP POLICY IF EXISTS taxas_pagamento_delete ON public.taxas_pagamento;
CREATE POLICY taxas_pagamento_delete ON public.taxas_pagamento FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxas_pagamento TO authenticated;

-- % da taxa para a forma/parcelas na loja (0 quando não cadastrada).
CREATE OR REPLACE FUNCTION public.taxa_pagamento(p_empresa UUID, p_forma TEXT, p_parcelas INTEGER)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT percentual FROM public.taxas_pagamento
    WHERE empresa_id = p_empresa
      AND forma_pagamento = p_forma
      AND parcelas = CASE WHEN p_forma = 'credito' THEN GREATEST(COALESCE(p_parcelas, 1), 1) ELSE 1 END
  ), 0);
$$;

-- Valida forma/parcelas da venda; devolve as parcelas a gravar.
CREATE OR REPLACE FUNCTION public.validar_parcelas(p_empresa UUID, p_forma TEXT, p_parcelas INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  IF p_forma IS DISTINCT FROM 'credito' THEN
    RETURN 1;
  END IF;
  SELECT parcelas_maximas INTO v_max FROM public.configuracoes WHERE empresa_id = p_empresa;
  v_max := COALESCE(v_max, 12);
  IF COALESCE(p_parcelas, 1) < 1 OR COALESCE(p_parcelas, 1) > v_max THEN
    RAISE EXCEPTION 'Parcelamento inválido: a loja aceita de 1x a %x no crédito.', v_max;
  END IF;
  RETURN COALESCE(p_parcelas, 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.taxa_pagamento(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validar_parcelas(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- Rótulo curto da forma, para as descrições dos lançamentos.
CREATE OR REPLACE FUNCTION public.rotulo_pagamento(p_forma TEXT, p_parcelas INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_forma
    WHEN 'credito' THEN 'Crédito ' || COALESCE(p_parcelas, 1) || 'x'
    WHEN 'debito' THEN 'Débito'
    WHEN 'pix' THEN 'Pix'
    WHEN 'dinheiro' THEN 'Dinheiro'
    ELSE COALESCE(p_forma, '')
  END;
$$;

-- ----------------------------------------------------------------
-- 2) Fechamento automático do caixa
-- ----------------------------------------------------------------
-- Até quando a sessão aberta em p_aberto_em pode ficar aberta: o
-- horário de fechamento do mesmo dia (horário de Brasília); se o
-- caixa foi aberto depois desse horário, o do dia seguinte.
CREATE OR REPLACE FUNCTION public.limite_fechamento_caixa(p_aberto_em TIMESTAMPTZ, p_fechamento TIME)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_local  TIMESTAMP := p_aberto_em AT TIME ZONE 'America/Sao_Paulo';
  v_limite TIMESTAMP := v_local::DATE + p_fechamento;
BEGIN
  IF v_local >= v_limite THEN
    v_limite := v_limite + INTERVAL '1 day';
  END IF;
  RETURN v_limite AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

-- Fecha as sessões que passaram do horário (p_empresa NULL = todas as
-- lojas; usado pelo pg_cron). O valor contado fica em branco.
CREATE OR REPLACE FUNCTION public.fechar_caixas_vencidos(p_empresa UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sessao   RECORD;
  v_esperado NUMERIC;
  v_qtd      INTEGER := 0;
BEGIN
  FOR v_sessao IN
    SELECT sc.id, sc.valor_inicial, cfg.horario_fechamento,
           public.limite_fechamento_caixa(sc.aberto_em, cfg.horario_fechamento) AS limite
    FROM public.sessoes_caixa sc
    JOIN public.configuracoes cfg ON cfg.empresa_id = sc.empresa_id
    WHERE sc.status = 'aberto'
      AND cfg.fechamento_automatico
      AND (p_empresa IS NULL OR sc.empresa_id = p_empresa)
      AND now() >= public.limite_fechamento_caixa(sc.aberto_em, cfg.horario_fechamento)
    FOR UPDATE OF sc SKIP LOCKED
  LOOP
    SELECT v_sessao.valor_inicial
           + COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0)
           - COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)
    INTO v_esperado
    FROM public.movimentos_caixa
    WHERE sessao_caixa_id = v_sessao.id;

    UPDATE public.sessoes_caixa
    SET status = 'fechado',
        fechado_em = v_sessao.limite,
        saldo_esperado = v_esperado,
        valor_informado = NULL,
        diferenca = NULL,
        observacao_fechamento = 'Fechado automaticamente no horário de fechamento da loja ('
          || to_char(v_sessao.horario_fechamento, 'HH24:MI') || ').'
    WHERE id = v_sessao.id;
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fechar_caixas_vencidos(UUID) FROM PUBLIC, anon, authenticated;

-- Para as telas: fecha os caixas vencidos da loja de quem chama.
CREATE OR REPLACE FUNCTION public.fechar_caixas_no_horario()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF v_empresa IS NULL THEN
    RETURN 0;
  END IF;
  RETURN public.fechar_caixas_vencidos(v_empresa);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fechar_caixas_no_horario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fechar_caixas_no_horario() TO authenticated;

-- A cada 5 minutos, quando o pg_cron existe (no Supabase: Integrations
-- → Cron). Sem ele, o fechamento acontece quando alguém usa o sistema.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('barber-fechar-caixas', '*/5 * * * *', 'SELECT public.fechar_caixas_vencidos(NULL)');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível (%); o caixa fecha quando alguém usar o sistema depois do horário.', SQLERRM;
END;
$$;

-- abrir_caixa: fecha antes a sessão vencida, para poder abrir outra.
CREATE OR REPLACE FUNCTION public.abrir_caixa(p_valor_inicial NUMERIC)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF EXISTS (SELECT 1 FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto') THEN
    RAISE EXCEPTION 'Você já tem um caixa aberto.';
  END IF;

  INSERT INTO public.sessoes_caixa (usuario_id, empresa_id, valor_inicial)
  VALUES (auth.uid(), v_empresa, COALESCE(p_valor_inicial, 0))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- registrar_movimento_caixa: idem, a sangria não cai num caixa vencido.
CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(p_tipo TEXT, p_categoria TEXT, p_descricao TEXT, p_valor NUMERIC, p_conta_financeira_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;

  PERFORM public.fechar_caixas_vencidos(v_empresa);

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de lançar movimentos.';
  END IF;

  v_conta := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES (p_tipo, p_categoria, p_descricao, p_valor, v_sessao_id, v_conta, v_empresa)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------
-- 3) Transferência entre contas
-- ----------------------------------------------------------------
-- Não entra em sessão de caixa (é acerto entre contas; para tirar
-- dinheiro da gaveta durante o expediente, use a Sangria).
CREATE OR REPLACE FUNCTION public.transferir_entre_contas(p_origem UUID, p_destino UUID, p_valor NUMERIC, p_descricao TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_nome_origem  TEXT;
  v_nome_destino TEXT;
  v_id   UUID := gen_random_uuid();
  v_obs  TEXT := NULLIF(trim(COALESCE(p_descricao, '')), '');
BEGIN
  IF NOT public.tem_permissao('financeiro', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para lançar no Financeiro.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.';
  END IF;
  IF p_origem IS NULL OR p_destino IS NULL THEN
    RAISE EXCEPTION 'Escolha a conta de origem e a de destino.';
  END IF;
  IF p_origem = p_destino THEN
    RAISE EXCEPTION 'A conta de origem e a de destino precisam ser diferentes.';
  END IF;

  SELECT nome INTO v_nome_origem FROM public.contas_financeiras WHERE id = p_origem AND empresa_id = v_empresa AND ativo;
  SELECT nome INTO v_nome_destino FROM public.contas_financeiras WHERE id = p_destino AND empresa_id = v_empresa AND ativo;
  IF v_nome_origem IS NULL OR v_nome_destino IS NULL THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, conta_financeira_id, transferencia_id, empresa_id)
  VALUES
    ('saida', 'transferencia', 'Transferência para ' || v_nome_destino || COALESCE(' — ' || v_obs, ''), p_valor, p_origem, v_id, v_empresa),
    ('entrada', 'transferencia', 'Transferência de ' || v_nome_origem || COALESCE(' — ' || v_obs, ''), p_valor, p_destino, v_id, v_empresa);

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transferir_entre_contas(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_entre_contas(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- Excluir um lado da transferência exclui os dois; excluir o lançamento
-- de uma venda leva junto o da taxa do cartão.
CREATE OR REPLACE FUNCTION public.excluir_movimento_caixa(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_transf  UUID;
  v_mov     RECORD;
BEGIN
  IF NOT public.tem_permissao('financeiro', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir lançamentos financeiros.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT transferencia_id, comanda_id, categoria INTO v_mov FROM public.movimentos_caixa WHERE id = p_id AND empresa_id = v_empresa;
  v_transf := v_mov.transferencia_id;
  IF v_transf IS NOT NULL THEN
    DELETE FROM public.movimentos_caixa WHERE transferencia_id = v_transf AND empresa_id = v_empresa;
  ELSIF v_mov.categoria = 'venda' AND v_mov.comanda_id IS NOT NULL THEN
    DELETE FROM public.movimentos_caixa
    WHERE empresa_id = v_empresa AND (id = p_id OR (comanda_id = v_mov.comanda_id AND categoria = 'taxa_cartao'));
  ELSE
    DELETE FROM public.movimentos_caixa WHERE id = p_id AND empresa_id = v_empresa;
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- 4) Venda com parcelas e taxa
-- ----------------------------------------------------------------
-- Comissões dos itens da venda (finalizar e editar usam a mesma regra).
-- Base = valor do item, menos a parte da taxa quando a loja desconta.
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
  SELECT id, empresa_id, taxa_percentual INTO v_comanda FROM public.comandas WHERE id = p_comanda_id;
  SELECT COALESCE(comissao_desconta_taxa, true) INTO v_desconta FROM public.configuracoes WHERE empresa_id = v_comanda.empresa_id;
  v_desconta := COALESCE(v_desconta, true);

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

-- Lançamento da taxa (saída na mesma conta da venda, fora do caixa).
CREATE OR REPLACE FUNCTION public.lancar_taxa_venda(p_comanda_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comanda RECORD;
  v_conta   UUID;
BEGIN
  SELECT id, empresa_id, data, forma_pagamento, parcelas, taxa_percentual, taxa_valor
  INTO v_comanda FROM public.comandas WHERE id = p_comanda_id;

  DELETE FROM public.movimentos_caixa WHERE comanda_id = p_comanda_id AND categoria = 'taxa_cartao';
  IF COALESCE(v_comanda.taxa_valor, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT conta_financeira_id INTO v_conta FROM public.movimentos_caixa
  WHERE comanda_id = p_comanda_id AND categoria = 'venda' ORDER BY created_at LIMIT 1;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, comanda_id, conta_financeira_id, empresa_id)
  VALUES ('saida', 'taxa_cartao',
          'Taxa ' || public.rotulo_pagamento(v_comanda.forma_pagamento, v_comanda.parcelas)
            || ' (' || replace(to_char(v_comanda.taxa_percentual, 'FM990.00'), '.', ',') || '%)',
          v_comanda.taxa_valor, v_comanda.data, p_comanda_id,
          COALESCE(v_conta, public.conta_financeira_padrao()), v_comanda.empresa_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lancar_taxa_venda(UUID) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome TEXT,
  p_cliente_id UUID,
  p_forma_pagamento TEXT,
  p_itens JSONB,
  p_conta_financeira_id UUID DEFAULT NULL,
  p_parcelas INTEGER DEFAULT 1
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
  v_taxa_pct := CASE WHEN p_forma_pagamento = 'dinheiro' THEN 0
                     ELSE public.taxa_pagamento(v_empresa, p_forma_pagamento, v_parcelas) END;

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

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, parcelas, taxa_percentual, taxa_valor, empresa_id, usuario_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento,
          v_parcelas, v_taxa_pct, ROUND(v_total * v_taxa_pct / 100, 2), v_empresa, auth.uid())
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

REVOKE EXECUTE ON FUNCTION public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_venda(TEXT, UUID, TEXT, JSONB, UUID, INTEGER) TO authenticated;

DROP FUNCTION IF EXISTS public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.editar_venda(
  p_comanda_id UUID,
  p_cliente_nome TEXT,
  p_forma_pagamento TEXT,
  p_itens JSONB,
  p_sem_comissao BOOLEAN DEFAULT false,
  p_parcelas INTEGER DEFAULT 1
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
  -- Mesma forma e parcelas: mantém a taxa da época da venda.
  IF p_forma_pagamento = v_comanda.forma_pagamento AND v_parcelas = COALESCE(v_comanda.parcelas, 1) THEN
    v_taxa_pct := COALESCE(v_comanda.taxa_percentual, 0);
  ELSE
    v_taxa_pct := CASE WHEN p_forma_pagamento = 'dinheiro' THEN 0
                       ELSE public.taxa_pagamento(v_empresa, p_forma_pagamento, v_parcelas) END;
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

REVOKE EXECUTE ON FUNCTION public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN, INTEGER) TO authenticated;

-- ----------------------------------------------------------------
-- 5) DRE: taxas de pagamento como custo da venda
-- ----------------------------------------------------------------
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

  SELECT COALESCE(SUM(taxa_valor), 0) INTO v_taxas
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
