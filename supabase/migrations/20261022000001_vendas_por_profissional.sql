-- ================================================================
--  Vendas por profissional (cenário "PC do caixa")
-- ================================================================
-- Cenário: um usuário Caixa registra todas as vendas no PC da loja e
-- escolhe o profissional de cada item. Cada barbeiro entra com o
-- próprio login (vinculado ao cadastro de profissional em Usuários) e
-- vê só as vendas em que atendeu.
--
-- 1) Uma venda passa a ser visível também para o profissional que tem
--    algum item nela (antes: só para quem registrou a venda, ou para
--    quem tem "ver vendas de outros"). Ele vê a venda inteira; a tela
--    destaca os itens dele.
-- 2) finalizar_venda: serviço sem profissional é recusado (produto
--    continua opcional) e o profissional precisa ser da loja.
-- 3) Padrão do papel Profissional (sem permissão personalizada):
--    Dashboard, Agenda, Clientes (ver e editar a Agenda e Clientes),
--    PDV (só ver: as vendas dele) e Comissões (as dele). Não vê mais
--    Caixa nem Produtos/Profissionais. Atendente continua igual.
--
-- Depende de 20261019000001 e 20261020000001. Idempotente.

-- ----------------------------------------------------------------
-- 1) Visibilidade das vendas
-- ----------------------------------------------------------------

-- Profissional vinculado ao usuário logado (ativo, com loja).
CREATE OR REPLACE FUNCTION public.meu_profissional()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT profissional_id FROM public.usuario_perfis
  WHERE usuario_id = auth.uid() AND ativo = true AND empresa_id IS NOT NULL;
$$;

-- O usuário logado pode ver essa venda? SECURITY DEFINER para ler
-- comandas e itens sem passar de novo pelas políticas (as políticas
-- das duas tabelas usam esta função; sem isso uma chamaria a outra
-- em loop).
CREATE OR REPLACE FUNCTION public.comanda_visivel(p_comanda_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.pode_ver_vendas_outros()
    OR EXISTS (SELECT 1 FROM public.comandas c WHERE c.id = p_comanda_id AND c.usuario_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.itens_comanda ic
      WHERE ic.comanda_id = p_comanda_id
        AND ic.profissional_id IS NOT NULL
        AND ic.profissional_id = public.meu_profissional()
    );
$$;

DROP POLICY IF EXISTS "comandas_select" ON public.comandas;
CREATE POLICY "comandas_select" ON public.comandas FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.comanda_visivel(id));

DROP POLICY IF EXISTS "itens_comanda_select" ON public.itens_comanda;
CREATE POLICY "itens_comanda_select" ON public.itens_comanda FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.comanda_visivel(comanda_id));

CREATE INDEX IF NOT EXISTS idx_itens_comanda_profissional ON public.itens_comanda (profissional_id);
CREATE INDEX IF NOT EXISTS idx_itens_comanda_comanda ON public.itens_comanda (comanda_id);

-- ----------------------------------------------------------------
-- 2) Padrão do papel Profissional
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.permissao_padrao(p_papel TEXT, p_tela TEXT, OUT pode_ver BOOLEAN, OUT pode_editar BOOLEAN)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_papel IN ('administrador', 'gerente') THEN true
      WHEN p_papel = 'atendente' THEN
        p_tela IN ('dashboard', 'agenda', 'pdv', 'caixa', 'clientes', 'produtos', 'profissionais', 'comissoes')
      WHEN p_papel = 'profissional' THEN
        p_tela IN ('dashboard', 'agenda', 'pdv', 'clientes', 'comissoes')
      ELSE false
    END,
    CASE
      WHEN p_papel = 'administrador' THEN true
      WHEN p_papel = 'gerente' THEN p_tela <> 'configuracoes'
      WHEN p_papel = 'atendente' THEN p_tela IN ('agenda', 'pdv', 'caixa', 'clientes')
      WHEN p_papel = 'profissional' THEN p_tela IN ('agenda', 'clientes')
      ELSE false
    END;
$$;

-- ----------------------------------------------------------------
-- 3) finalizar_venda: serviço exige profissional da loja
-- ----------------------------------------------------------------
-- Mesmo corpo da versão de 20261019000001; só a validação dos itens
-- muda. Mesma assinatura — não cria sobrecarga.
CREATE OR REPLACE FUNCTION public.finalizar_venda(p_cliente_nome text, p_cliente_id uuid, p_forma_pagamento text, p_itens jsonb, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda_id          UUID;
  v_sessao_id           UUID;
  v_total               NUMERIC(10,2) := 0;
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
  v_custo_unitario      NUMERIC(10,2);
  v_comissao_usuario    NUMERIC(5,2);
  v_conta_fin           UUID;
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
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

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, empresa_id, usuario_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento, v_empresa, auth.uid())
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd             := (v_item->>'quantidade')::INTEGER;
    v_valor           := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_comissao_percentual := NULL;
    v_custo_unitario  := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, empresa_id)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario, v_empresa)
    RETURNING id INTO v_item_id;

    IF v_item->>'tipo' = 'produto' THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV', 'comanda', v_comanda_id, v_empresa);
    END IF;

    IF v_profissional_id IS NOT NULL THEN
      IF v_item->>'tipo' = 'servico' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      ELSIF v_item->>'tipo' = 'produto' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NULL THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.profissionais WHERE id = v_profissional_id AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NOT NULL AND v_comissao_percentual > 0 THEN
        INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
        VALUES (
          v_profissional_id, v_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente', v_empresa
        );
      END IF;
    END IF;
  END LOOP;

  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());
  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total, v_comanda_id, v_sessao_id, v_conta_fin, v_empresa);

  SELECT comissao_percentual INTO v_comissao_usuario FROM public.usuario_perfis WHERE usuario_id = auth.uid();
  IF v_comissao_usuario IS NOT NULL AND v_comissao_usuario > 0 THEN
    INSERT INTO public.comissoes (usuario_id, comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
    VALUES (auth.uid(), v_comanda_id, v_total, v_comissao_usuario, ROUND(v_total * v_comissao_usuario / 100, 2), 'pendente', v_empresa);
  END IF;

  RETURN v_comanda_id;
END;
$function$;
