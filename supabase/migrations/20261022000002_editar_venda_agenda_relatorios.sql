-- ================================================================
--  Editar venda, venda a partir da agenda e relatórios por usuário
-- ================================================================
-- 1) editar_venda: administrador e gerente (com Vendas = editar)
--    corrigem uma venda já feita — itens, quantidades, profissional
--    de cada item, cliente e forma de pagamento — e podem tirar a
--    comissão dela (p_sem_comissao).
--    Mecânica: devolve ao estoque os produtos dos itens antigos
--    (registrado em movimentacoes_estoque como "devolucao"), apaga os
--    itens e as comissões antigas, grava os itens novos com a mesma
--    baixa de estoque e o mesmo cálculo de comissão de finalizar_venda
--    e ATUALIZA o lançamento de caixa que a venda já tinha (nunca cria
--    um segundo). O custo de um produto que já estava na venda é
--    mantido (a DRE do período não muda só porque o custo mudou).
--    Obs.: se o caixa em que a venda entrou já foi fechado, o
--    fechamento continua mostrando o valor da época; o saldo das
--    contas (Financeiro) passa a usar o valor corrigido.
--
-- 2) vincular_venda_agendamento: a venda gerada pela Agenda ("Gerar
--    venda" no atendimento) fica ligada ao agendamento
--    (comandas.agendamento_id) e o agendamento vira "concluído".
--    Comandas não têm política de escrita pela API, por isso a RPC.
--
-- 3) Relatórios por usuário: usuario_perfis.relatorios guarda quais
--    abas da tela Relatórios o usuário vê (NULL = todas, o padrão).
--    Igual aos cards do Dashboard, decide só o que aparece: os dados de
--    cada relatório continuam protegidos pelas permissões e pelo RLS
--    das telas de origem (ex.: quem não vê vendas de outros só recebe
--    as próprias). salvar_permissoes_usuario ganha p_relatorios.
--
-- 4) listar_usuarios_basico devolve também o nome cadastrado, para as
--    telas mostrarem "João" em vez do começo do e-mail.
--
-- Comissões: não há mais aprovar nem marcar como paga. Tirar a
-- comissão de uma venda grava status 'cancelada' (a DRE e as telas já
-- ignoram as canceladas). Nada muda no banco para isso — a política
-- comissoes_atualiza_financeiro (editar Comissões) já permite.
--
-- Depende de 20261019000001, 20261020000001 e 20261022000001.
-- Idempotente: pode rodar de novo sem problema.

-- ----------------------------------------------------------------
-- 1) Editar venda
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.editar_venda(UUID, TEXT, TEXT, JSONB, BOOLEAN);
CREATE OR REPLACE FUNCTION public.editar_venda(
  p_comanda_id      UUID,
  p_cliente_nome    TEXT,
  p_forma_pagamento TEXT,
  p_itens           JSONB,
  p_sem_comissao    BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda             RECORD;
  v_antigo              RECORD;
  v_item                JSONB;
  v_item_id             UUID;
  v_qtd                 INTEGER;
  v_valor               NUMERIC(10,2);
  v_profissional_id     UUID;
  v_produto_id          UUID;
  v_custo_unitario      NUMERIC(10,2);
  v_comissao_percentual NUMERIC(5,2);
  v_comissao_usuario    NUMERIC(5,2);
  v_total               NUMERIC(10,2) := 0;
  v_custos_antigos      JSONB := '{}'::jsonb;
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
    v_qtd                 := (v_item->>'quantidade')::INTEGER;
    v_valor               := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id     := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_comissao_percentual := NULL;
    v_custo_unitario      := NULL;
    v_produto_id          := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      v_produto_id := (v_item->>'referencia_id')::UUID;
      IF v_custos_antigos ? v_produto_id::TEXT THEN
        v_custo_unitario := (v_custos_antigos->>v_produto_id::TEXT)::NUMERIC;
      ELSE
        SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = v_produto_id AND empresa_id = v_empresa;
      END IF;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, empresa_id)
    VALUES (p_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario, v_empresa)
    RETURNING id INTO v_item_id;

    IF v_produto_id IS NOT NULL THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = v_produto_id AND empresa_id = v_empresa;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES (v_produto_id, 'venda', -v_qtd, 'Venda (edição)', 'comanda', p_comanda_id, v_empresa);
    END IF;

    IF v_profissional_id IS NOT NULL AND NOT COALESCE(p_sem_comissao, false) THEN
      IF v_item->>'tipo' = 'servico' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      ELSE
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.produtos WHERE id = v_produto_id AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NULL THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.profissionais WHERE id = v_profissional_id AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NOT NULL AND v_comissao_percentual > 0 THEN
        INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
        VALUES (
          v_profissional_id, p_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente', v_empresa
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.comandas
  SET cliente_nome    = COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão'),
      forma_pagamento = p_forma_pagamento,
      total           = v_total
  WHERE id = p_comanda_id;

  -- Corrige o lançamento que a venda já tinha (nunca cria outro).
  UPDATE public.movimentos_caixa
  SET valor     = v_total,
      descricao = 'Venda — ' || COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão')
  WHERE comanda_id = p_comanda_id AND empresa_id = v_empresa;

  -- Comissão por usuário: de quem registrou a venda (não de quem edita).
  IF v_comanda.usuario_id IS NOT NULL AND NOT COALESCE(p_sem_comissao, false) THEN
    SELECT comissao_percentual INTO v_comissao_usuario
    FROM public.usuario_perfis WHERE usuario_id = v_comanda.usuario_id;
    IF v_comissao_usuario IS NOT NULL AND v_comissao_usuario > 0 THEN
      INSERT INTO public.comissoes (usuario_id, comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
      VALUES (v_comanda.usuario_id, p_comanda_id, v_total, v_comissao_usuario, ROUND(v_total * v_comissao_usuario / 100, 2), 'pendente', v_empresa);
    END IF;
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- 2) Venda gerada pela Agenda
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vincular_venda_agendamento(p_comanda_id UUID, p_agendamento_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  -- Quem liga é quem registrou a venda (ou quem vê as vendas de todos).
  IF NOT EXISTS (
    SELECT 1 FROM public.comandas
    WHERE id = p_comanda_id AND empresa_id = v_empresa
      AND (usuario_id = auth.uid() OR public.pode_ver_vendas_outros())
  ) THEN
    RAISE EXCEPTION 'Venda não encontrada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agendamentos WHERE id = p_agendamento_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Agendamento não encontrado.';
  END IF;

  UPDATE public.comandas SET agendamento_id = p_agendamento_id WHERE id = p_comanda_id;
  UPDATE public.agendamentos SET status = 'concluido'
  WHERE id = p_agendamento_id AND status NOT IN ('cancelado', 'nao_compareceu');
END;
$$;

CREATE INDEX IF NOT EXISTS idx_comandas_agendamento ON public.comandas (agendamento_id);

-- ----------------------------------------------------------------
-- 3) Relatórios por usuário
-- ----------------------------------------------------------------
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS relatorios TEXT[];

-- Mesma lista de RELATORIOS em src/lib/permissoes.ts.
CREATE OR REPLACE FUNCTION public.relatorios_disponiveis()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['vendas', 'caixa', 'comissoes', 'clientes', 'produtos', 'profissionais', 'agenda'];
$$;

CREATE OR REPLACE FUNCTION public.permissoes_json(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT jsonb_build_object(
    'usuario_id', up.usuario_id,
    'papel', up.papel,
    'acesso_total', up.papel = 'administrador',
    'gerenciar_equipe', up.papel IN ('administrador', 'gerente'),
    'ver_vendas_outros', CASE WHEN up.papel = 'administrador' THEN true
                              ELSE COALESCE(up.ver_vendas_outros, up.papel = 'gerente') END,
    'ver_custo_produtos', CASE WHEN up.papel = 'administrador' THEN true
                               ELSE COALESCE(up.ver_custo_produtos, up.papel = 'gerente') END,
    'especiais_personalizados', up.ver_vendas_outros IS NOT NULL OR up.ver_custo_produtos IS NOT NULL,
    'dashboard_cards', to_jsonb(CASE WHEN up.papel = 'administrador' THEN public.cards_dashboard()
                                     ELSE COALESCE(up.dashboard_cards, public.cards_dashboard_padrao(up.papel)) END),
    'dashboard_personalizado', up.dashboard_cards IS NOT NULL,
    'relatorios', to_jsonb(CASE WHEN up.papel = 'administrador' THEN public.relatorios_disponiveis()
                                ELSE COALESCE(up.relatorios, public.relatorios_disponiveis()) END),
    'relatorios_personalizado', up.relatorios IS NOT NULL,
    'telas', (
      SELECT jsonb_object_agg(tc.tela, jsonb_build_object(
        'ver', pe.pode_ver,
        'editar', pe.pode_editar,
        'tem_edicao', tc.tem_edicao,
        'personalizado', pu.tela IS NOT NULL
      ))
      FROM public.telas_configuraveis() tc
      CROSS JOIN LATERAL public.permissao_efetiva(up.usuario_id, tc.tela) pe
      LEFT JOIN public.usuario_permissoes pu ON pu.usuario_id = up.usuario_id AND pu.tela = tc.tela
    )
  )
  FROM public.usuario_perfis up
  WHERE up.usuario_id = p_usuario_id;
$$;
REVOKE EXECUTE ON FUNCTION public.permissoes_json(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.minhas_permissoes()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_json JSONB;
BEGIN
  IF public.minha_empresa() IS NULL THEN
    SELECT jsonb_build_object(
      'usuario_id', auth.uid(), 'papel', up.papel, 'acesso_total', false, 'gerenciar_equipe', false,
      'ver_vendas_outros', false, 'ver_custo_produtos', false, 'especiais_personalizados', false,
      'dashboard_cards', '[]'::jsonb, 'dashboard_personalizado', false,
      'relatorios', '[]'::jsonb, 'relatorios_personalizado', false,
      'telas', (SELECT jsonb_object_agg(tela, jsonb_build_object('ver', false, 'editar', false, 'tem_edicao', tem_edicao, 'personalizado', false))
                FROM public.telas_configuraveis())
    ) INTO v_json
    FROM public.usuario_perfis up WHERE up.usuario_id = auth.uid();
    RETURN v_json;
  END IF;
  RETURN public.permissoes_json(auth.uid());
END;
$$;

-- Ganha p_relatorios (NULL = não mexe nos relatórios). A assinatura
-- muda, então derruba a anterior para não criar sobrecarga.
DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[]);
DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[], TEXT[]);
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id         UUID,
  p_telas              JSONB,
  p_ver_vendas_outros  BOOLEAN,
  p_ver_custo_produtos BOOLEAN,
  p_dashboard_cards    TEXT[] DEFAULT NULL,
  p_relatorios         TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_tela       TEXT;
  v_valor      JSONB;
  v_ver        BOOLEAN;
  v_editar     BOOLEAN;
  v_tem_edicao BOOLEAN;
  v_card       TEXT;
  v_relatorio  TEXT;
BEGIN
  IF NOT public.pode_configurar_permissoes(p_usuario_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar as permissões desse usuário.';
  END IF;

  FOR v_tela, v_valor IN SELECT key, value FROM jsonb_each(COALESCE(p_telas, '{}'::jsonb))
  LOOP
    SELECT tem_edicao INTO v_tem_edicao FROM public.telas_configuraveis() WHERE tela = v_tela;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tela desconhecida: %', v_tela;
    END IF;
    v_editar := COALESCE((v_valor->>'editar')::BOOLEAN, false) AND v_tem_edicao;
    v_ver    := COALESCE((v_valor->>'ver')::BOOLEAN, false) OR v_editar;

    INSERT INTO public.usuario_permissoes (usuario_id, empresa_id, tela, pode_ver, pode_editar, updated_at)
    VALUES (p_usuario_id, v_empresa, v_tela, v_ver, v_editar, now())
    ON CONFLICT (usuario_id, tela) DO UPDATE
      SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar,
          empresa_id = EXCLUDED.empresa_id, updated_at = now();
  END LOOP;

  IF p_dashboard_cards IS NOT NULL THEN
    FOREACH v_card IN ARRAY p_dashboard_cards LOOP
      IF NOT (v_card = ANY (public.cards_dashboard())) THEN
        RAISE EXCEPTION 'Card desconhecido: %', v_card;
      END IF;
    END LOOP;
  END IF;

  IF p_relatorios IS NOT NULL THEN
    FOREACH v_relatorio IN ARRAY p_relatorios LOOP
      IF NOT (v_relatorio = ANY (public.relatorios_disponiveis())) THEN
        RAISE EXCEPTION 'Relatório desconhecido: %', v_relatorio;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.usuario_perfis
  SET ver_vendas_outros = p_ver_vendas_outros, ver_custo_produtos = p_ver_custo_produtos,
      dashboard_cards = COALESCE(p_dashboard_cards, dashboard_cards),
      relatorios = COALESCE(p_relatorios, relatorios)
  WHERE usuario_id = p_usuario_id;

  RETURN public.permissoes_usuario(p_usuario_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.restaurar_permissoes_padrao(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_configurar_permissoes(p_usuario_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar as permissões desse usuário.';
  END IF;
  DELETE FROM public.usuario_permissoes WHERE usuario_id = p_usuario_id;
  UPDATE public.usuario_perfis
  SET ver_vendas_outros = NULL, ver_custo_produtos = NULL, dashboard_cards = NULL, relatorios = NULL
  WHERE usuario_id = p_usuario_id;
  RETURN public.permissoes_usuario(p_usuario_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.limpar_permissoes_ao_trocar_papel()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.papel IS DISTINCT FROM OLD.papel OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    DELETE FROM public.usuario_permissoes WHERE usuario_id = NEW.usuario_id;
    NEW.ver_vendas_outros  := NULL;
    NEW.ver_custo_produtos := NULL;
    NEW.dashboard_cards    := NULL;
    NEW.relatorios         := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- 4) Nome do usuário nas listas (Vendas, Comissões, Relatórios)
-- ----------------------------------------------------------------
-- O tipo de retorno muda (ganha nome), então recria a função.
DROP FUNCTION IF EXISTS public.listar_usuarios_basico();
CREATE OR REPLACE FUNCTION public.listar_usuarios_basico()
RETURNS TABLE (usuario_id UUID, email TEXT, nome TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT au.id, au.email::TEXT, NULLIF(trim(up.nome), '')
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  WHERE up.empresa_id = public.minha_empresa();
$$;
