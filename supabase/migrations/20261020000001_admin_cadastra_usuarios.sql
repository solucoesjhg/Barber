-- ================================================================
--  Administrador da loja cadastra os próprios usuários
-- ================================================================
-- Fluxo novo: o super admin cria a loja e UM login de administrador
-- para ela. Daí em diante o administrador cadastra os funcionários
-- pelo sistema (e-mail, senha inicial, nome, papel, comissão,
-- profissional vinculado) e define as permissões de tela de cada um.
-- Não precisa mais do cadastro público + vínculo pelo super admin
-- (continua funcionando para quem já usa).
--
-- Quem pode cadastrar / editar quem:
--   super admin    → administrador, gerente, atendente, profissional (qualquer loja)
--   administrador  → gerente, atendente, profissional da própria loja
--   gerente        → atendente, profissional da própria loja
--   Ninguém edita a si mesmo nem quem está no mesmo nível ou acima.
--
-- Depende de 20261019000001_permissoes_por_tela.sql.
-- Idempotente: pode rodar de novo sem duplicar nada.

-- ----------------------------------------------------------------
-- 1) Nome do usuário (aparece nas listas no lugar do e-mail)
-- ----------------------------------------------------------------
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS nome TEXT;

-- ----------------------------------------------------------------
-- 2) Regras de quem gerencia quem
-- ----------------------------------------------------------------

-- Papéis que o usuário logado pode atribuir a alguém.
CREATE OR REPLACE FUNCTION public.papeis_que_posso_atribuir()
RETURNS TEXT[]
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN ARRAY['administrador', 'gerente', 'atendente', 'profissional']
    WHEN public.minha_empresa() IS NULL THEN ARRAY[]::TEXT[]
    WHEN public.meu_papel() = 'administrador' THEN ARRAY['gerente', 'atendente', 'profissional']
    WHEN public.meu_papel() = 'gerente' THEN ARRAY['atendente', 'profissional']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

-- O usuário logado pode editar o usuário alvo (dados, senha, ativo)?
CREATE OR REPLACE FUNCTION public.pode_gerenciar_usuario(p_usuario_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT CASE
    WHEN public.is_super_admin() THEN EXISTS (
      SELECT 1 FROM public.usuario_perfis WHERE usuario_id = p_usuario_id AND papel <> 'super_admin'
    )
    ELSE EXISTS (
      SELECT 1 FROM public.usuario_perfis alvo
      WHERE alvo.usuario_id = p_usuario_id
        AND alvo.usuario_id <> auth.uid()
        AND alvo.empresa_id = public.minha_empresa()
        AND alvo.papel = ANY (public.papeis_que_posso_atribuir())
    )
  END;
$$;

-- ----------------------------------------------------------------
-- 3) Cadastrar usuário (cria o login no Supabase Auth)
-- ----------------------------------------------------------------
-- Cria o login já confirmado, com a senha informada. O funcionário
-- entra com esse e-mail e senha e pode trocar a senha depois.
CREATE OR REPLACE FUNCTION public.criar_usuario_loja(
  p_email               TEXT,
  p_senha               TEXT,
  p_nome                TEXT,
  p_papel               TEXT,
  p_empresa_id          UUID DEFAULT NULL,
  p_profissional_id     UUID DEFAULT NULL,
  p_comissao_percentual NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email   TEXT := lower(trim(p_email));
  v_empresa UUID;
  v_id      UUID := gen_random_uuid();
BEGIN
  IF public.is_super_admin() THEN
    v_empresa := p_empresa_id;
    IF v_empresa IS NULL OR NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_empresa) THEN
      RAISE EXCEPTION 'Escolha a loja do usuário.';
    END IF;
  ELSE
    v_empresa := public.minha_empresa();
  END IF;

  IF v_empresa IS NULL OR NOT (p_papel = ANY (public.papeis_que_posso_atribuir())) THEN
    RAISE EXCEPTION 'Você não tem permissão para cadastrar um usuário com esse papel.';
  END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Já existe um login com o e-mail %.', v_email;
  END IF;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN
    RAISE EXCEPTION 'A comissão precisa estar entre 0 e 100%%.';
  END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais WHERE id = p_profissional_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado nessa loja.';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_build_object('nome', NULLIF(trim(p_nome), '')), now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_id, v_id::TEXT, 'email',
    jsonb_build_object('sub', v_id::TEXT, 'email', v_email, 'email_verified', true),
    now(), now(), now()
  );

  -- O gatilho de novo login pode já ter criado o perfil (sem loja).
  INSERT INTO public.usuario_perfis (usuario_id, papel, empresa_id, ativo, nome, profissional_id, comissao_percentual)
  VALUES (v_id, p_papel, v_empresa, true, NULLIF(trim(p_nome), ''), p_profissional_id, p_comissao_percentual)
  ON CONFLICT (usuario_id) DO UPDATE
    SET papel = EXCLUDED.papel, empresa_id = EXCLUDED.empresa_id, ativo = true, nome = EXCLUDED.nome,
        profissional_id = EXCLUDED.profissional_id, comissao_percentual = EXCLUDED.comissao_percentual;

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------
-- 4) Editar usuário (nome, papel, profissional, comissão, ativo)
-- ----------------------------------------------------------------
-- Trocar o papel apaga as permissões personalizadas (gatilho da
-- migração anterior); salve as permissões depois de salvar o papel.
CREATE OR REPLACE FUNCTION public.salvar_usuario(
  p_usuario_id          UUID,
  p_nome                TEXT,
  p_papel               TEXT,
  p_profissional_id     UUID,
  p_comissao_percentual NUMERIC,
  p_ativo               BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID;
BEGIN
  IF NOT public.pode_gerenciar_usuario(p_usuario_id) OR NOT (p_papel = ANY (public.papeis_que_posso_atribuir())) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
  END IF;
  SELECT empresa_id INTO v_empresa FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;
  IF p_comissao_percentual IS NOT NULL AND (p_comissao_percentual < 0 OR p_comissao_percentual > 100) THEN
    RAISE EXCEPTION 'A comissão precisa estar entre 0 e 100%%.';
  END IF;
  IF p_profissional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profissionais WHERE id = p_profissional_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado nessa loja.';
  END IF;

  UPDATE public.usuario_perfis
  SET nome = NULLIF(trim(p_nome), ''), papel = p_papel, profissional_id = p_profissional_id,
      comissao_percentual = p_comissao_percentual, ativo = COALESCE(p_ativo, ativo)
  WHERE usuario_id = p_usuario_id;
END;
$$;

-- Nova senha para o usuário (ex.: ele esqueceu a dele).
CREATE OR REPLACE FUNCTION public.redefinir_senha_usuario(p_usuario_id UUID, p_senha TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_gerenciar_usuario(p_usuario_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
  END IF;
  IF p_senha IS NULL OR length(p_senha) < 6 THEN
    RAISE EXCEPTION 'A senha precisa ter pelo menos 6 caracteres.';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now()
  WHERE id = p_usuario_id;
END;
$$;

-- ----------------------------------------------------------------
-- 5) atualizar_papel_usuario: mesmas regras de quem gerencia quem
-- ----------------------------------------------------------------
-- Antes, administrador e gerente podiam mudar qualquer usuário da loja
-- (inclusive a si mesmos e outros administradores) para qualquer papel
-- menos super admin. Mesma assinatura — não cria sobrecarga.
CREATE OR REPLACE FUNCTION public.atualizar_papel_usuario(
  p_usuario_id UUID,
  p_papel TEXT,
  p_profissional_id UUID DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE,
  p_empresa_id UUID DEFAULT NULL,
  p_comissao_percentual NUMERIC DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() THEN
    UPDATE public.usuario_perfis
    SET empresa_id = p_empresa_id, papel = p_papel, profissional_id = p_profissional_id,
        ativo = p_ativo, comissao_percentual = p_comissao_percentual
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  IF public.pode_gerenciar_usuario(p_usuario_id) AND p_papel = ANY (public.papeis_que_posso_atribuir()) THEN
    UPDATE public.usuario_perfis
    SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo,
        comissao_percentual = p_comissao_percentual
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
END;
$$;

-- ----------------------------------------------------------------
-- 6) listar_usuarios devolve também o nome
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_usuarios();
CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (
  usuario_id UUID, email TEXT, papel TEXT, profissional_id UUID,
  ativo BOOLEAN, criado_em TIMESTAMPTZ, empresa_id UUID, empresa_nome TEXT,
  comissao_percentual NUMERIC, nome TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT au.id, au.email::TEXT, up.papel, up.profissional_id, up.ativo, au.created_at, up.empresa_id, e.nome,
         up.comissao_percentual, up.nome
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  LEFT JOIN public.empresas e ON e.id = up.empresa_id
  WHERE public.is_super_admin() OR (public.pode_gerenciar_equipe() AND up.empresa_id = public.minha_empresa())
  ORDER BY au.created_at;
$$;

-- ----------------------------------------------------------------
-- 7) Cards do Dashboard por usuário
-- ----------------------------------------------------------------
-- dashboard_cards = lista de cards que o usuário vê no Dashboard.
-- NULL = padrão do papel. É só o que aparece na tela: os números de
-- cada card continuam protegidos pelas permissões das telas de origem
-- (ex.: card A Pagar exige ver Contas a Pagar).
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS dashboard_cards TEXT[];

CREATE OR REPLACE FUNCTION public.cards_dashboard()
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY[
    'agendamentos_hoje', 'confirmados', 'concluidos', 'cancelamentos', 'faturamento_hoje',
    'faturamento_mes', 'despesas_mes', 'lucro_estimado', 'a_receber', 'a_pagar', 'saldo_caixa',
    'top_servicos', 'top_profissionais', 'agenda_hoje'
  ];
$$;

CREATE OR REPLACE FUNCTION public.cards_dashboard_padrao(p_papel TEXT)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_papel IN ('administrador', 'gerente') THEN public.cards_dashboard()
    WHEN p_papel IN ('atendente', 'profissional') THEN
      ARRAY['agendamentos_hoje', 'confirmados', 'concluidos', 'cancelamentos', 'saldo_caixa', 'agenda_hoje']
    ELSE ARRAY[]::TEXT[]
  END;
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
      'telas', (SELECT jsonb_object_agg(tela, jsonb_build_object('ver', false, 'editar', false, 'tem_edicao', tem_edicao, 'personalizado', false))
                FROM public.telas_configuraveis())
    ) INTO v_json
    FROM public.usuario_perfis up WHERE up.usuario_id = auth.uid();
    RETURN v_json;
  END IF;
  RETURN public.permissoes_json(auth.uid());
END;
$$;

-- Ganha p_dashboard_cards (NULL = não mexe nos cards). A assinatura
-- muda, então derruba a anterior para não criar sobrecarga.
DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id         UUID,
  p_telas              JSONB,
  p_ver_vendas_outros  BOOLEAN,
  p_ver_custo_produtos BOOLEAN,
  p_dashboard_cards    TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_tela    TEXT;
  v_valor   JSONB;
  v_ver     BOOLEAN;
  v_editar  BOOLEAN;
  v_tem_edicao BOOLEAN;
  v_card    TEXT;
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

  UPDATE public.usuario_perfis
  SET ver_vendas_outros = p_ver_vendas_outros, ver_custo_produtos = p_ver_custo_produtos,
      dashboard_cards = COALESCE(p_dashboard_cards, dashboard_cards)
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
  SET ver_vendas_outros = NULL, ver_custo_produtos = NULL, dashboard_cards = NULL
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
  END IF;
  RETURN NEW;
END;
$$;
