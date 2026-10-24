-- ================================================================
-- Painel ADM: modo suporte ("entrar como a loja")
-- ================================================================
-- O super admin entra numa loja como administrador dela para ajudar
-- sem pedir senha: o perfil dele vira administrador da loja com
-- em_suporte = true. Enquanto isso:
-- - ele vê e mexe em tudo da loja (mesmo bloqueada), como o dono;
-- - não aparece na lista de usuários da loja nem conta no painel;
-- - sair_suporte() volta o perfil para super admin.
-- Idempotente.

ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS em_suporte BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.minha_empresa()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT up.empresa_id
  FROM public.usuario_perfis up
  JOIN public.empresas e ON e.id = up.empresa_id
  WHERE up.usuario_id = auth.uid() AND up.ativo = true AND (e.ativo = true OR up.em_suporte);
$$;

CREATE OR REPLACE FUNCTION public.situacao_minha_loja()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN up.usuario_id IS NULL OR up.papel = 'super_admin' OR up.em_suporte THEN
      jsonb_build_object('situacao', 'ok', 'suporte', COALESCE(up.em_suporte, false), 'loja', e.nome)
    WHEN up.empresa_id IS NULL THEN jsonb_build_object('situacao', 'sem_loja')
    WHEN NOT up.ativo THEN jsonb_build_object('situacao', 'usuario_inativo')
    WHEN NOT e.ativo THEN jsonb_build_object('situacao', 'bloqueada', 'loja', e.nome, 'motivo', e.motivo_bloqueio)
    ELSE jsonb_build_object('situacao', 'ok')
  END
  FROM (SELECT auth.uid() AS uid) eu
  LEFT JOIN public.usuario_perfis up ON up.usuario_id = eu.uid
  LEFT JOIN public.empresas e ON e.id = up.empresa_id;
$$;

CREATE OR REPLACE FUNCTION public.entrar_suporte(p_empresa_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma entra no modo suporte.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  UPDATE public.usuario_perfis
  SET papel = 'administrador', empresa_id = p_empresa_id, em_suporte = true, profissional_id = NULL
  WHERE usuario_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.sair_suporte()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.usuario_perfis
  SET papel = 'super_admin', empresa_id = NULL, em_suporte = false, profissional_id = NULL
  WHERE usuario_id = auth.uid() AND em_suporte;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Você não está no modo suporte.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.entrar_suporte(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sair_suporte() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entrar_suporte(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sair_suporte() TO authenticated;

-- Quem está em suporte não aparece para a equipe da loja.
CREATE OR REPLACE FUNCTION public.listar_usuarios()
 RETURNS TABLE(usuario_id uuid, email text, papel text, profissional_id uuid, ativo boolean, criado_em timestamp with time zone, empresa_id uuid, empresa_nome text, comissao_percentual numeric, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT au.id, au.email::TEXT, up.papel, up.profissional_id, up.ativo, au.created_at, up.empresa_id, e.nome,
         up.comissao_percentual, up.nome
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  LEFT JOIN public.empresas e ON e.id = up.empresa_id
  WHERE NOT up.em_suporte
    AND (public.is_super_admin() OR (public.pode_gerenciar_equipe() AND up.empresa_id = public.minha_empresa()))
  ORDER BY au.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.pode_gerenciar_usuario(p_usuario_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.is_super_admin() THEN EXISTS (
      SELECT 1 FROM public.usuario_perfis WHERE usuario_id = p_usuario_id AND papel <> 'super_admin' AND NOT em_suporte
    )
    ELSE EXISTS (
      SELECT 1 FROM public.usuario_perfis alvo
      WHERE alvo.usuario_id = p_usuario_id
        AND alvo.usuario_id <> auth.uid()
        AND NOT alvo.em_suporte
        AND alvo.empresa_id = public.minha_empresa()
        AND alvo.papel = ANY (public.papeis_que_posso_atribuir())
    )
  END;
$function$;

-- Excluir a loja não apaga o login de quem está em suporte nela.
CREATE OR REPLACE FUNCTION public.excluir_empresa(p_empresa_id UUID, p_confirmacao TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma pode excluir uma loja.';
  END IF;
  SELECT nome INTO v_nome FROM public.empresas WHERE id = p_empresa_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada.';
  END IF;
  IF lower(trim(COALESCE(p_confirmacao, ''))) <> lower(trim(v_nome)) THEN
    RAISE EXCEPTION 'Para confirmar, digite o nome da loja exatamente como está: %', v_nome;
  END IF;

  UPDATE public.usuario_perfis
  SET papel = 'super_admin', empresa_id = NULL, em_suporte = false
  WHERE empresa_id = p_empresa_id AND em_suporte;

  DELETE FROM auth.users
  WHERE id IN (
    SELECT usuario_id FROM public.usuario_perfis
    WHERE empresa_id = p_empresa_id AND papel <> 'super_admin' AND NOT em_suporte
  );
  DELETE FROM public.empresas WHERE id = p_empresa_id;
END;
$$;

-- Painel: quem está em suporte não conta como usuário nem acesso da loja.
DROP FUNCTION IF EXISTS public.painel_empresas();
CREATE FUNCTION public.painel_empresas()
RETURNS TABLE(
  id UUID, nome TEXT, codigo TEXT, email TEXT, telefone TEXT, cnpj TEXT, ativo BOOLEAN, created_at TIMESTAMPTZ,
  responsavel TEXT, endereco TEXT, cidade TEXT, observacoes TEXT, motivo_bloqueio TEXT, bloqueada_em TIMESTAMPTZ, plano TEXT, valor_mensalidade NUMERIC, dia_vencimento INTEGER, cobranca_ativa BOOLEAN,
  usuarios_ativos BIGINT, ultimo_acesso TIMESTAMPTZ, vendas_mes BIGINT, faturamento_mes NUMERIC,
  mensalidades_atrasadas BIGINT, valor_atrasado NUMERIC, proximo_vencimento DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_mes  DATE := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')::DATE)::DATE;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Só o administrador da plataforma vê o painel.';
  END IF;
  RETURN QUERY
  SELECT e.id, e.nome, e.codigo, e.email, e.telefone, e.cnpj, e.ativo, e.created_at,
         e.responsavel, e.endereco, e.cidade, e.observacoes, e.motivo_bloqueio, e.bloqueada_em, e.plano, e.valor_mensalidade, e.dia_vencimento, e.cobranca_ativa,
         (SELECT count(*) FROM public.usuario_perfis up WHERE up.empresa_id = e.id AND up.ativo AND up.papel <> 'super_admin' AND NOT up.em_suporte),
         (SELECT max(au.last_sign_in_at) FROM public.usuario_perfis up JOIN auth.users au ON au.id = up.usuario_id
            WHERE up.empresa_id = e.id AND up.papel <> 'super_admin' AND NOT up.em_suporte),
         (SELECT count(*) FROM public.comandas c WHERE c.empresa_id = e.id AND c.status = 'fechada' AND c.data >= v_mes),
         (SELECT COALESCE(sum(c.total), 0) FROM public.comandas c WHERE c.empresa_id = e.id AND c.status = 'fechada' AND c.data >= v_mes),
         (SELECT count(*) FROM public.mensalidades m WHERE m.empresa_id = e.id AND m.status = 'pendente' AND m.vencimento < v_hoje),
         (SELECT COALESCE(sum(m.valor), 0) FROM public.mensalidades m WHERE m.empresa_id = e.id AND m.status = 'pendente' AND m.vencimento < v_hoje),
         (SELECT min(m.vencimento) FROM public.mensalidades m WHERE m.empresa_id = e.id AND m.status = 'pendente' AND m.vencimento >= v_hoje)
  FROM public.empresas e
  ORDER BY e.nome;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.painel_empresas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_empresas() TO authenticated;
