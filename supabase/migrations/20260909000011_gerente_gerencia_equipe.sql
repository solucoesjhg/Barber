-- ================================================================
--  Fase 8k — super_admin só vincula loja; gerente gerencia a equipe
-- ================================================================
-- Antes: só 'administrador' da loja conseguia ajustar papel/
-- profissional/ativo do próprio time (super_admin também podia,
-- além de vincular a empresa). Agora:
--   - super_admin: só liga/desliga o vínculo do usuário com uma
--     loja (empresa_id). Não mexe mais em papel, profissional
--     vinculado nem ativo/inativo - isso passa a ser 100%
--     responsabilidade de quem gerencia a loja.
--   - administrador OU gerente da própria loja: ajustam papel,
--     profissional vinculado e ativo/inativo de quem já é da loja
--     (gerente ganhou esse poder, que antes era só do administrador).

CREATE OR REPLACE FUNCTION public.pode_gerenciar_equipe()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel IN ('administrador', 'gerente') AND ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION public.atualizar_papel_usuario(
  p_usuario_id UUID,
  p_papel TEXT,
  p_profissional_id UUID DEFAULT NULL,
  p_ativo BOOLEAN DEFAULT TRUE,
  p_empresa_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_alvo UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_alvo FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;

  IF public.is_super_admin() THEN
    -- Só o vínculo com a loja. Papel/profissional/ativo ficam como
    -- estão (o padrão do cadastro é 'atendente' - a gerência da loja
    -- ajusta a partir daí).
    UPDATE public.usuario_perfis
    SET empresa_id = p_empresa_id
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  IF public.pode_gerenciar_equipe() AND v_empresa_alvo IS NOT NULL AND v_empresa_alvo = public.minha_empresa() THEN
    IF p_papel = 'super_admin' THEN
      RAISE EXCEPTION 'Você não tem permissão para conceder esse papel.';
    END IF;
    UPDATE public.usuario_perfis
    SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
END;
$$;

-- Postgres não deixa mudar o formato de retorno via CREATE OR
-- REPLACE - precisa dropar primeiro (idempotente).
DROP FUNCTION IF EXISTS public.listar_usuarios();

CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (
  usuario_id UUID, email TEXT, papel TEXT, profissional_id UUID,
  ativo BOOLEAN, criado_em TIMESTAMPTZ, empresa_id UUID, empresa_nome TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT au.id, au.email, up.papel, up.profissional_id, up.ativo, au.created_at, up.empresa_id, e.nome
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  LEFT JOIN public.empresas e ON e.id = up.empresa_id
  WHERE public.is_super_admin() OR (public.pode_gerenciar_equipe() AND up.empresa_id = public.minha_empresa())
  ORDER BY au.created_at;
$$;

-- RLS de usuario_perfis: mesma troca de is_admin() por
-- pode_gerenciar_equipe() pra leitura/escrita do time da loja.
DROP POLICY IF EXISTS "usuario_perfis_select" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_select" ON public.usuario_perfis FOR SELECT TO authenticated
  USING (
    usuario_id = auth.uid()
    OR public.is_super_admin()
    OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa())
  );

DROP POLICY IF EXISTS "usuario_perfis_update" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_update" ON public.usuario_perfis FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa()))
  WITH CHECK (public.is_super_admin() OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa()));
