-- ================================================================
--  Atendente não edita produto (defesa em profundidade)
-- ================================================================
-- A tela vai esconder os botões de criar/editar/importar produto e
-- ativar/desativar pra quem é atendente, mas isso sozinho não impede
-- escrita direta via API/DevTools. A política de RLS de produtos era
-- "empresa_isolada" (FOR ALL, sem checar papel) — aqui a leitura
-- continua igual pra todo mundo da loja, e só escrita (insert/
-- update/delete) passa a exigir papel != atendente.
-- Escopo: só produtos (revenda). Serviços não entraram nessa regra —
-- se quiser bloquear edição de serviço/preço pra atendente também,
-- é a mesma receita aplicada em public.servicos.

CREATE OR REPLACE FUNCTION public.pode_gerenciar_produtos()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel <> 'atendente' AND ativo = true
  );
$$;

DROP POLICY IF EXISTS "empresa_isolada" ON public.produtos;
DROP POLICY IF EXISTS "produtos_select" ON public.produtos;
DROP POLICY IF EXISTS "produtos_insert" ON public.produtos;
DROP POLICY IF EXISTS "produtos_update" ON public.produtos;
DROP POLICY IF EXISTS "produtos_delete" ON public.produtos;

CREATE POLICY "produtos_select" ON public.produtos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "produtos_insert" ON public.produtos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produtos_update" ON public.produtos FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produtos_delete" ON public.produtos FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
