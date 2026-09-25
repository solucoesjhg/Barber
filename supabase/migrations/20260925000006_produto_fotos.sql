-- ================================================================
--  Fotos de produto — coluna capa + galeria + bucket de Storage
-- ================================================================
-- produtos.foto_url é a "capa" — o que o resto do sistema usa pra
-- mostrar a miniatura (listagem, PDV, detalhe de venda). produto_fotos
-- guarda a galeria inteira; o front decide qual é a capa e mantém
-- produtos.foto_url sincronizado sempre que a galeria muda (adiciona,
-- remove ou troca a capa).
--
-- Escrita (upload/excluir/trocar capa) já nasce restrita a quem não é
-- atendente, seguindo a mesma regra de "atendente não edita produto"
-- (migração 20260924000002) — leitura continua liberada pra loja
-- toda.

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS foto_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('produtos', 'produtos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "produtos_foto_leitura_publica" ON storage.objects;
CREATE POLICY "produtos_foto_leitura_publica" ON storage.objects FOR SELECT
  USING (bucket_id = 'produtos');

DROP POLICY IF EXISTS "produtos_foto_upload_propria_loja" ON storage.objects;
CREATE POLICY "produtos_foto_upload_propria_loja" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'produtos' AND (storage.foldername(name))[1] = public.minha_empresa()::text AND public.pode_gerenciar_produtos());

DROP POLICY IF EXISTS "produtos_foto_update_propria_loja" ON storage.objects;
CREATE POLICY "produtos_foto_update_propria_loja" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'produtos' AND (storage.foldername(name))[1] = public.minha_empresa()::text AND public.pode_gerenciar_produtos());

DROP POLICY IF EXISTS "produtos_foto_delete_propria_loja" ON storage.objects;
CREATE POLICY "produtos_foto_delete_propria_loja" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'produtos' AND (storage.foldername(name))[1] = public.minha_empresa()::text AND public.pode_gerenciar_produtos());

CREATE TABLE IF NOT EXISTS public.produto_fotos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  empresa_id UUID NOT NULL DEFAULT public.minha_empresa() REFERENCES public.empresas(id) ON DELETE CASCADE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_fotos_produto ON public.produto_fotos (produto_id);

ALTER TABLE public.produto_fotos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "empresa_isolada" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_select" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_insert" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_update" ON public.produto_fotos;
DROP POLICY IF EXISTS "produto_fotos_delete" ON public.produto_fotos;

CREATE POLICY "produto_fotos_select" ON public.produto_fotos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa());
CREATE POLICY "produto_fotos_insert" ON public.produto_fotos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produto_fotos_update" ON public.produto_fotos FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos())
  WITH CHECK (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
CREATE POLICY "produto_fotos_delete" ON public.produto_fotos FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.pode_gerenciar_produtos());
