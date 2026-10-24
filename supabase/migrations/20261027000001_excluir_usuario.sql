-- ================================================================
-- Excluir usuário
--
-- Quem gerencia o usuário (mesma regra de pode_gerenciar_usuario) pode
-- excluí-lo de vez, inclusive o login, liberando o e-mail. Só vale para
-- quem não tem histórico: apagar o login apagaria as sessões de caixa
-- dele e deixaria as vendas sem "registrada por". Com histórico, o
-- caminho é desativar o usuário.
-- ================================================================

CREATE OR REPLACE FUNCTION public.excluir_usuario(p_usuario_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_usuario_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode excluir o seu próprio usuário.';
  END IF;
  IF NOT public.pode_gerenciar_usuario(p_usuario_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir este usuário.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sessoes_caixa WHERE usuario_id = p_usuario_id)
     OR EXISTS (SELECT 1 FROM public.comandas WHERE usuario_id = p_usuario_id)
     OR EXISTS (SELECT 1 FROM public.comissoes WHERE usuario_id = p_usuario_id) THEN
    RAISE EXCEPTION 'Este usuário já tem vendas ou caixas no histórico e não pode ser excluído. Para tirar o acesso sem perder o histórico, desmarque "Ativo" e salve.';
  END IF;

  DELETE FROM public.usuario_permissoes WHERE usuario_id = p_usuario_id;
  DELETE FROM public.usuario_perfis WHERE usuario_id = p_usuario_id;
  DELETE FROM auth.users WHERE id = p_usuario_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.excluir_usuario(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excluir_usuario(UUID) TO authenticated;
