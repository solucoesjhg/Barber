-- ================================================================
--  Revisão de segurança
-- ================================================================
-- 1) Quem não fez login (papel anon) não chama função nenhuma nem
--    toca tabela nenhuma. O RLS já barrava as tabelas, mas o Supabase
--    dá EXECUTE/ALL ao anon por padrão; gerar_recebiveis_cartao, que não
--    confere permissão, ficava exposta (dava para inserir recebíveis
--    falsos em qualquer loja).
-- 2) TRUNCATE (que passa por cima do RLS) sai de todos os papéis do app.
-- 3) Recebíveis do cartão: pela API só mudam a data prevista e o
--    "recebido"; os valores vêm da venda.
-- 4) Fotos dos produtos: só imagem, até 5 MB.
-- 5) Senha mínima de 8 caracteres ao criar usuário ou trocar a senha.

-- ── 1) anon fora de tudo ─────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, PUBLIC;
-- Usuário logado continua chamando as funções do app (cada uma confere
-- a própria permissão); as internas ficam só para o banco.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
REVOKE EXECUTE ON FUNCTION public.gerar_recebiveis_cartao(UUID, UUID, UUID, TEXT, INTEGER, UUID, NUMERIC, NUMERIC, DATE) FROM authenticated;

-- O que for criado daqui para frente também nasce fechado para o anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;

-- ── 2) TRUNCATE ignora o RLS: ninguém do app precisa ──────────────
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM authenticated;

-- ── 3) Recebíveis: só data prevista e status pela API ──────────────
REVOKE INSERT, UPDATE, DELETE ON public.recebiveis_cartao FROM authenticated;
GRANT SELECT ON public.recebiveis_cartao TO authenticated;
GRANT UPDATE (data_prevista, status, recebido_em) ON public.recebiveis_cartao TO authenticated;

-- ── 4) Bucket de fotos: só imagem, até 5 MB ────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types') THEN
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        file_size_limit = 5242880
    WHERE id = 'produtos';
  END IF;
END;
$$;

-- ── 5) Senha mínima de 8 caracteres ──────────────────────────────
DO $$
DECLARE v_fn RECORD; v_def TEXT;
BEGIN
  FOR v_fn IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('criar_usuario_loja', 'redefinir_senha_usuario')
  LOOP
    v_def := pg_get_functiondef(v_fn.oid);
    v_def := replace(v_def, 'length(p_senha) < 6', 'length(p_senha) < 8');
    v_def := replace(v_def, 'pelo menos 6 caracteres', 'pelo menos 8 caracteres');
    EXECUTE v_def;
  END LOOP;
END;
$$;
