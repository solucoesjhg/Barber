-- ================================================================
--  Pedidos da Skunk (26/11/2026)
-- ================================================================
-- 1) Tela inicial por usuário (padrão: Agenda).
-- 2) Excluir produto: nova permissão especial "excluir_produtos" e a
--    função excluir_produto(), que só apaga produto sem movimentação
--    (sem venda e sem movimento de estoque). Com movimentação, avisa
--    o motivo: nesse caso o caminho é inativar.
-- 3) Quem lançou: movimentos_caixa.usuario_id (sangria, suprimento,
--    venda...). Os lançamentos antigos ficam sem (não há como saber).

-- ── 1) Tela inicial ──────────────────────────────────────────────
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS tela_inicial TEXT;

CREATE OR REPLACE FUNCTION public.definir_tela_inicial(p_usuario_id UUID, p_tela TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_usuario_id IS DISTINCT FROM auth.uid() AND NOT public.pode_configurar_permissoes(p_usuario_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
  END IF;
  IF p_tela IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.telas_configuraveis() WHERE tela = p_tela) THEN
    RAISE EXCEPTION 'Tela desconhecida: %', p_tela;
  END IF;
  UPDATE public.usuario_perfis SET tela_inicial = p_tela WHERE usuario_id = p_usuario_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.definir_tela_inicial(UUID, TEXT) TO authenticated;

-- ── 2) Permissão de excluir produtos ─────────────────────────────
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS excluir_produtos BOOLEAN;

-- Padrão: administrador e gerente podem; os demais não.
CREATE OR REPLACE FUNCTION public.pode_excluir_produtos()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN papel = 'administrador' THEN true
                ELSE COALESCE(excluir_produtos, papel = 'gerente') END
    FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND ativo = true AND empresa_id IS NOT NULL
  ), false);
$$;
REVOKE EXECUTE ON FUNCTION public.pode_excluir_produtos() FROM PUBLIC, anon, authenticated;

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
    'ver_agendamentos_outros', CASE WHEN up.papel = 'administrador' THEN true
                                    ELSE COALESCE(up.ver_agendamentos_outros, up.papel <> 'profissional') END,
    'ver_custo_produtos', CASE WHEN up.papel = 'administrador' THEN true
                               ELSE COALESCE(up.ver_custo_produtos, up.papel = 'gerente') END,
    'dar_desconto', CASE WHEN up.papel = 'administrador' THEN true
                         ELSE COALESCE(up.dar_desconto, up.papel = 'gerente') END,
    'desconto_maximo', CASE WHEN up.papel = 'administrador' THEN NULL ELSE up.desconto_maximo END,
    'excluir_produtos', CASE WHEN up.papel = 'administrador' THEN true
                             ELSE COALESCE(up.excluir_produtos, up.papel = 'gerente') END,
    'especiais_personalizados', up.ver_vendas_outros IS NOT NULL OR up.ver_custo_produtos IS NOT NULL
                                OR up.ver_agendamentos_outros IS NOT NULL OR up.dar_desconto IS NOT NULL
                                OR up.desconto_maximo IS NOT NULL OR up.excluir_produtos IS NOT NULL,
    'tela_inicial', COALESCE(up.tela_inicial, 'agenda'),
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

DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[], TEXT[], BOOLEAN, BOOLEAN, NUMERIC);
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id              UUID,
  p_telas                   JSONB,
  p_ver_vendas_outros       BOOLEAN,
  p_ver_custo_produtos      BOOLEAN,
  p_dashboard_cards         TEXT[] DEFAULT NULL,
  p_relatorios              TEXT[] DEFAULT NULL,
  p_ver_agendamentos_outros BOOLEAN DEFAULT NULL,
  p_dar_desconto            BOOLEAN DEFAULT NULL,
  p_desconto_maximo         NUMERIC DEFAULT NULL,
  p_excluir_produtos        BOOLEAN DEFAULT NULL
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
      ver_agendamentos_outros = p_ver_agendamentos_outros, dar_desconto = p_dar_desconto,
      desconto_maximo = CASE WHEN p_desconto_maximo IS NULL THEN NULL ELSE LEAST(GREATEST(p_desconto_maximo, 0), 100) END,
      excluir_produtos = p_excluir_produtos,
      dashboard_cards = COALESCE(p_dashboard_cards, dashboard_cards),
      relatorios = COALESCE(p_relatorios, relatorios)
  WHERE usuario_id = p_usuario_id;

  RETURN public.permissoes_usuario(p_usuario_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[], TEXT[], BOOLEAN, BOOLEAN, NUMERIC, BOOLEAN) TO authenticated;

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
  SET ver_vendas_outros = NULL, ver_custo_produtos = NULL, ver_agendamentos_outros = NULL, dar_desconto = NULL, desconto_maximo = NULL,
      excluir_produtos = NULL, dashboard_cards = NULL, relatorios = NULL
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
    NEW.ver_vendas_outros       := NULL;
    NEW.ver_custo_produtos      := NULL;
    NEW.ver_agendamentos_outros := NULL;
    NEW.dar_desconto            := NULL;
    NEW.desconto_maximo         := NULL;
    NEW.excluir_produtos        := NULL;
    NEW.dashboard_cards         := NULL;
    NEW.relatorios              := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Excluir produto (só sem movimentação) ────────────────────────
-- Exclusão só por esta função: o DELETE direto na tabela sai da API.
DROP POLICY IF EXISTS "produtos_delete" ON public.produtos;

CREATE OR REPLACE FUNCTION public.excluir_produto(p_produto_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_nome    TEXT;
  v_vendas  INTEGER;
  v_movs    INTEGER;
  v_fotos   TEXT[];
BEGIN
  IF NOT (public.tem_permissao('produtos', true) AND public.pode_excluir_produtos()) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir produtos. Peça ao administrador para liberar em Usuários → Permissões → Especiais.';
  END IF;

  SELECT nome INTO v_nome FROM public.produtos WHERE id = p_produto_id AND empresa_id = v_empresa;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado.';
  END IF;

  SELECT count(*) INTO v_vendas FROM public.itens_comanda WHERE tipo = 'produto' AND referencia_id = p_produto_id;
  SELECT count(*) INTO v_movs FROM public.movimentacoes_estoque WHERE produto_id = p_produto_id;

  IF v_vendas > 0 OR v_movs > 0 THEN
    RAISE EXCEPTION '"%" não pode ser excluído porque já tem movimentação (%). Excluir apagaria esse histórico dos relatórios e do estoque. Se não vai mais usar, deixe o produto Inativo.',
      v_nome,
      concat_ws(' e ',
        CASE WHEN v_vendas > 0 THEN v_vendas || CASE WHEN v_vendas = 1 THEN ' venda' ELSE ' vendas' END END,
        CASE WHEN v_movs > 0 THEN v_movs || CASE WHEN v_movs = 1 THEN ' movimento de estoque' ELSE ' movimentos de estoque' END END);
  END IF;

  -- Devolve os arquivos das fotos, para o app apagar do armazenamento.
  SELECT COALESCE(array_agg(url), '{}') INTO v_fotos FROM public.produto_fotos WHERE produto_id = p_produto_id;
  DELETE FROM public.produtos WHERE id = p_produto_id AND empresa_id = v_empresa;
  RETURN v_fotos;
END;
$$;
GRANT EXECUTE ON FUNCTION public.excluir_produto(UUID) TO authenticated;

-- ── 3) Quem lançou o movimento de caixa ──────────────────────────
-- DEFAULT auth.uid(): vale para tudo que grava em movimentos_caixa
-- (sangria, suprimento, venda, baixa de conta...), inclusive dentro das
-- funções SECURITY DEFINER, sem mexer em cada uma delas.
ALTER TABLE public.movimentos_caixa
  ADD COLUMN IF NOT EXISTS usuario_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL;
