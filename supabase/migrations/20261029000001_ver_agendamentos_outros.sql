-- ================================================================
-- Permissão especial "Ver agendamentos de outros usuários"
-- ================================================================
-- Igual à de vendas: sem ela, o usuário vê (e mexe) só nos
-- agendamentos do profissional vinculado a ele em Usuários.
-- Padrão do papel: administrador, gerente e atendente veem todos;
-- profissional vê só os dele.
-- Idempotente.

ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS ver_agendamentos_outros BOOLEAN;

CREATE OR REPLACE FUNCTION public.pode_ver_agendamentos_outros()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN papel = 'administrador' THEN true
                ELSE COALESCE(ver_agendamentos_outros, papel <> 'profissional') END
    FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND ativo = true AND empresa_id IS NOT NULL
  ), false);
$$;

-- Agendamento visível para o usuário logado.
CREATE OR REPLACE FUNCTION public.agendamento_visivel(p_profissional_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.pode_ver_agendamentos_outros()
    OR (p_profissional_id IS NOT NULL AND p_profissional_id = public.meu_profissional());
$$;

DROP POLICY IF EXISTS "agendamentos_select" ON public.agendamentos;
CREATE POLICY "agendamentos_select" ON public.agendamentos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.agendamento_visivel(profissional_id));

DROP POLICY IF EXISTS "agendamentos_insert" ON public.agendamentos;
CREATE POLICY "agendamentos_insert" ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('agenda', true) AND public.agendamento_visivel(profissional_id));

DROP POLICY IF EXISTS "agendamentos_update" ON public.agendamentos;
CREATE POLICY "agendamentos_update" ON public.agendamentos FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('agenda', true) AND public.agendamento_visivel(profissional_id))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('agenda', true) AND public.agendamento_visivel(profissional_id));

DROP POLICY IF EXISTS "agendamentos_delete" ON public.agendamentos;
CREATE POLICY "agendamentos_delete" ON public.agendamentos FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('agenda', true) AND public.agendamento_visivel(profissional_id));

-- ----------------------------------------------------------------
-- Permissões: devolve, salva e restaura o novo campo
-- ----------------------------------------------------------------
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
    'especiais_personalizados', up.ver_vendas_outros IS NOT NULL OR up.ver_custo_produtos IS NOT NULL
                                OR up.ver_agendamentos_outros IS NOT NULL,
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
      'ver_vendas_outros', false, 'ver_agendamentos_outros', false, 'ver_custo_produtos', false, 'especiais_personalizados', false,
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

-- Ganha p_ver_agendamentos_outros (último, com padrão NULL = padrão do
-- papel). A assinatura muda, então derruba a anterior.
DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[], TEXT[]);
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id              UUID,
  p_telas                   JSONB,
  p_ver_vendas_outros       BOOLEAN,
  p_ver_custo_produtos      BOOLEAN,
  p_dashboard_cards         TEXT[] DEFAULT NULL,
  p_relatorios              TEXT[] DEFAULT NULL,
  p_ver_agendamentos_outros BOOLEAN DEFAULT NULL
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
      ver_agendamentos_outros = p_ver_agendamentos_outros,
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
  SET ver_vendas_outros = NULL, ver_custo_produtos = NULL, ver_agendamentos_outros = NULL,
      dashboard_cards = NULL, relatorios = NULL
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
    NEW.dashboard_cards         := NULL;
    NEW.relatorios              := NULL;
  END IF;
  RETURN NEW;
END;
$$;
