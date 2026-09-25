-- ================================================================
--  Excluir lançamento financeiro
-- ================================================================
CREATE OR REPLACE FUNCTION public.excluir_movimento_caixa(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir lançamentos financeiros.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  DELETE FROM public.movimentos_caixa WHERE id = p_id AND empresa_id = v_empresa;
END;
$$;
