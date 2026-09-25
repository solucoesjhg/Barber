-- ================================================================
--  Fix — atualizar_papel_usuario duplicada (overload ambígua), de novo
-- ================================================================
-- Mesma causa da migração 20260917000003: a migração de comissão por
-- usuário (20260924000003) adicionou p_comissao_percentual via
-- CREATE OR REPLACE, sem DROP antes — Postgres trata isso como uma
-- função NOVA (overload), não substituição, porque a lista de tipos
-- de parâmetro mudou. Uma chamada com só os 5 parâmetros antigos
-- (como "Vincular aqui" de usuário pendente) passa a bater em ambas
-- as versões e o PostgREST não consegue decidir qual usar (PGRST203).

DROP FUNCTION IF EXISTS public.atualizar_papel_usuario(UUID, TEXT, UUID, BOOLEAN, UUID);

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
DECLARE
  v_empresa_alvo UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_alvo FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;

  IF public.is_super_admin() THEN
    UPDATE public.usuario_perfis
    SET empresa_id = p_empresa_id, papel = p_papel, profissional_id = p_profissional_id,
        ativo = p_ativo, comissao_percentual = p_comissao_percentual
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  IF public.pode_gerenciar_equipe() AND v_empresa_alvo IS NOT NULL AND v_empresa_alvo = public.minha_empresa() THEN
    IF p_papel = 'super_admin' THEN
      RAISE EXCEPTION 'Você não tem permissão para conceder esse papel.';
    END IF;
    UPDATE public.usuario_perfis
    SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo,
        comissao_percentual = p_comissao_percentual
    WHERE usuario_id = p_usuario_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Você não tem permissão para alterar esse usuário.';
END;
$$;
