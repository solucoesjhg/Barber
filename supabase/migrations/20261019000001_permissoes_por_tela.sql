-- ================================================================
--  Permissões por tela (ver / editar) + permissões especiais por
--  usuário (ver vendas de outros usuários, ver custo dos produtos)
-- ================================================================
-- Até aqui o acesso era decidido só pelo papel (administrador,
-- gerente, atendente, profissional), e boa parte das regras existia
-- só na tela. Esta migração:
--
-- 1) Cria public.usuario_permissoes: uma linha por (usuário, tela)
--    com pode_ver / pode_editar. Sem linha = vale o padrão do papel
--    (public.permissao_padrao). Administrador tem sempre acesso total.
-- 2) Adiciona em usuario_perfis as permissões especiais
--    ver_vendas_outros e ver_custo_produtos (NULL = padrão do papel).
-- 3) Cria as funções que as políticas e as RPCs usam:
--    tem_permissao(tela, editar), pode_ver_vendas_outros(),
--    pode_ver_custo_produtos(), e as RPCs da tela de Permissões
--    (minhas_permissoes, permissoes_usuario, salvar_permissoes_usuario,
--    restaurar_permissoes_padrao).
-- 4) Reescreve as políticas de RLS e as checagens das RPCs pra usar
--    essas permissões — a regra vale no banco, não só na tela.
-- 5) Esconde o custo (produtos.preco_custo e itens_comanda.custo_unitario)
--    de quem não tem ver_custo_produtos, por privilégio de coluna.
--    ⚠️ A partir daqui, coluna nova em produtos ou itens_comanda
--    precisa de GRANT SELECT (coluna) TO authenticated na própria
--    migração, senão ninguém consegue ler a coluna pela API.
-- 6) Fecha brechas de permissão encontradas na revisão:
--    - gerente/administrador conseguiam dar UPDATE direto em
--      usuario_perfis (inclusive virar super_admin) — agora só via RPC;
--    - usuário desativado continuava acessando a loja;
--    - conta financeira de outra loja era aceita nas RPCs de caixa.
--
-- Padrão por papel (quando o usuário não tem permissão personalizada):
--   administrador: tudo, sempre (não é configurável).
--   gerente:       vê e edita tudo, menos editar Configurações;
--                  vê vendas de todos e o custo dos produtos.
--   atendente / profissional: Dashboard, Agenda, PDV, Caixa e Clientes
--                  (ver e editar); Produtos, Profissionais e Comissões
--                  (só ver). Não vê vendas de outros nem custo.
--
-- Quem configura: administrador configura gerente, atendente e
-- profissional; gerente configura atendente e profissional. Ninguém
-- configura a si mesmo. A tela Usuários/Permissões continua restrita
-- a administrador e gerente (não é delegável, pra ninguém conseguir
-- se dar mais permissão).
--
-- Idempotente: pode rodar de novo sem duplicar nada.

-- ----------------------------------------------------------------
-- 1) Estrutura
-- ----------------------------------------------------------------

ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS ver_vendas_outros  BOOLEAN;
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS ver_custo_produtos BOOLEAN;

-- Rede de segurança: o padrão antigo era 'administrador'.
ALTER TABLE public.usuario_perfis ALTER COLUMN papel SET DEFAULT 'atendente';

CREATE TABLE IF NOT EXISTS public.usuario_permissoes (
  usuario_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id  UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tela        TEXT NOT NULL CHECK (tela IN (
    'dashboard', 'agenda', 'pdv', 'caixa', 'financeiro', 'contas_pagar',
    'contas_receber', 'comissoes', 'clientes', 'profissionais', 'produtos',
    'fornecedores', 'categorias', 'dre', 'relatorios', 'auditoria', 'configuracoes'
  )),
  pode_ver    BOOLEAN NOT NULL DEFAULT false,
  pode_editar BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, tela),
  CONSTRAINT editar_exige_ver CHECK (NOT pode_editar OR pode_ver)
);
CREATE INDEX IF NOT EXISTS idx_usuario_permissoes_empresa ON public.usuario_permissoes (empresa_id);

ALTER TABLE public.usuario_permissoes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- 2) Funções de permissão
-- ----------------------------------------------------------------

-- Usuário desativado deixa de enxergar a loja (todas as políticas
-- "empresa_id = minha_empresa()" passam a negar).
CREATE OR REPLACE FUNCTION public.minha_empresa()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT empresa_id FROM public.usuario_perfis WHERE usuario_id = auth.uid() AND ativo = true;
$$;

-- Lista de telas configuráveis, na ordem em que aparecem no menu.
-- tem_edicao = false: tela só de consulta (não tem "editar").
CREATE OR REPLACE FUNCTION public.telas_configuraveis()
RETURNS TABLE (tela TEXT, tem_edicao BOOLEAN)
LANGUAGE sql IMMUTABLE
AS $$
  VALUES
    ('dashboard', false), ('clientes', true), ('profissionais', true), ('produtos', true),
    ('fornecedores', true), ('categorias', true), ('agenda', true), ('pdv', true),
    ('caixa', true), ('financeiro', true), ('contas_pagar', true), ('contas_receber', true),
    ('comissoes', true), ('dre', false), ('relatorios', false), ('auditoria', false),
    ('configuracoes', true);
$$;

-- Padrão do papel pra uma tela (quando não há linha em usuario_permissoes).
CREATE OR REPLACE FUNCTION public.permissao_padrao(p_papel TEXT, p_tela TEXT, OUT pode_ver BOOLEAN, OUT pode_editar BOOLEAN)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_papel IN ('administrador', 'gerente') THEN true
      WHEN p_papel IN ('atendente', 'profissional') THEN
        p_tela IN ('dashboard', 'agenda', 'pdv', 'caixa', 'clientes', 'produtos', 'profissionais', 'comissoes')
      ELSE false
    END,
    CASE
      WHEN p_papel = 'administrador' THEN true
      WHEN p_papel = 'gerente' THEN p_tela <> 'configuracoes'
      WHEN p_papel IN ('atendente', 'profissional') THEN
        p_tela IN ('agenda', 'pdv', 'caixa', 'clientes')
      ELSE false
    END;
$$;

-- Permissão efetiva de um usuário (uso interno; não exposta à API).
CREATE OR REPLACE FUNCTION public.permissao_efetiva(p_usuario_id UUID, p_tela TEXT, OUT pode_ver BOOLEAN, OUT pode_editar BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    CASE WHEN up.papel = 'administrador' THEN true ELSE COALESCE(pu.pode_ver, pp.pode_ver) END,
    CASE WHEN up.papel = 'administrador' THEN true
         WHEN NOT tc.tem_edicao THEN false
         ELSE COALESCE(pu.pode_editar, pp.pode_editar) END
  FROM public.usuario_perfis up
  JOIN public.telas_configuraveis() tc ON tc.tela = p_tela
  CROSS JOIN LATERAL public.permissao_padrao(up.papel, p_tela) pp
  LEFT JOIN public.usuario_permissoes pu ON pu.usuario_id = up.usuario_id AND pu.tela = p_tela
  WHERE up.usuario_id = p_usuario_id;
$$;
REVOKE EXECUTE ON FUNCTION public.permissao_efetiva(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- O usuário logado (ativo e vinculado a uma loja) pode ver / editar a tela?
CREATE OR REPLACE FUNCTION public.tem_permissao(p_tela TEXT, p_editar BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN p_editar THEN pe.pode_editar ELSE pe.pode_ver END
    FROM public.usuario_perfis up
    CROSS JOIN LATERAL public.permissao_efetiva(up.usuario_id, p_tela) pe
    WHERE up.usuario_id = auth.uid() AND up.ativo = true AND up.empresa_id IS NOT NULL
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_vendas_outros()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN papel = 'administrador' THEN true
                ELSE COALESCE(ver_vendas_outros, papel = 'gerente') END
    FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND ativo = true AND empresa_id IS NOT NULL
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.pode_ver_custo_produtos()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN papel = 'administrador' THEN true
                ELSE COALESCE(ver_custo_produtos, papel = 'gerente') END
    FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND ativo = true AND empresa_id IS NOT NULL
  ), false);
$$;

-- Produtos (e serviços, fotos, estoque) agora seguem a permissão da
-- tela Produtos. As políticas de produtos/produto_fotos/storage já
-- chamam esta função, então passam a respeitar a regra nova sem
-- precisar recriá-las.
CREATE OR REPLACE FUNCTION public.pode_gerenciar_produtos()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT public.tem_permissao('produtos', true);
$$;

-- Quem logado pode configurar as permissões do usuário alvo?
-- administrador: gerente/atendente/profissional da loja;
-- gerente: atendente/profissional da loja; nunca a si mesmo.
CREATE OR REPLACE FUNCTION public.pode_configurar_permissoes(p_usuario_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_perfis eu
    JOIN public.usuario_perfis alvo ON alvo.usuario_id = p_usuario_id
    WHERE eu.usuario_id = auth.uid()
      AND eu.ativo = true
      AND eu.empresa_id IS NOT NULL
      AND alvo.empresa_id = eu.empresa_id
      AND alvo.usuario_id <> eu.usuario_id
      AND (
        (eu.papel = 'administrador' AND alvo.papel IN ('gerente', 'atendente', 'profissional'))
        OR (eu.papel = 'gerente' AND alvo.papel IN ('atendente', 'profissional'))
      )
  );
$$;

-- ----------------------------------------------------------------
-- 3) RPCs da tela de Permissões
-- ----------------------------------------------------------------

-- Monta o JSON de permissões de um usuário (uso interno).
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

-- Permissões do usuário logado (menu, rotas e botões do app).
-- Usuário sem loja, inativo ou super_admin recebe tudo negado.
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
      'telas', (SELECT jsonb_object_agg(tela, jsonb_build_object('ver', false, 'editar', false, 'tem_edicao', tem_edicao, 'personalizado', false))
                FROM public.telas_configuraveis())
    ) INTO v_json
    FROM public.usuario_perfis up WHERE up.usuario_id = auth.uid();
    RETURN v_json;
  END IF;
  RETURN public.permissoes_json(auth.uid());
END;
$$;

-- Permissões de outro usuário, pra tela de configuração.
CREATE OR REPLACE FUNCTION public.permissoes_usuario(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = p_usuario_id AND empresa_id = public.minha_empresa()
  ) OR NOT public.pode_gerenciar_equipe() THEN
    RAISE EXCEPTION 'Você não tem permissão para ver as permissões desse usuário.';
  END IF;
  RETURN public.permissoes_json(p_usuario_id) || jsonb_build_object('pode_configurar', public.pode_configurar_permissoes(p_usuario_id));
END;
$$;

-- Salva as permissões do usuário. p_telas = {"clientes": {"ver": true, "editar": false}, ...};
-- telas ausentes do JSON ficam como estão. "editar" sem "ver" é gravado como ver = true.
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id         UUID,
  p_telas              JSONB,
  p_ver_vendas_outros  BOOLEAN,
  p_ver_custo_produtos BOOLEAN
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

  UPDATE public.usuario_perfis
  SET ver_vendas_outros = p_ver_vendas_outros, ver_custo_produtos = p_ver_custo_produtos
  WHERE usuario_id = p_usuario_id;

  RETURN public.permissoes_usuario(p_usuario_id);
END;
$$;

-- Volta o usuário pro padrão do papel (apaga as personalizações).
CREATE OR REPLACE FUNCTION public.restaurar_permissoes_padrao(p_usuario_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.pode_configurar_permissoes(p_usuario_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar as permissões desse usuário.';
  END IF;
  DELETE FROM public.usuario_permissoes WHERE usuario_id = p_usuario_id;
  UPDATE public.usuario_perfis SET ver_vendas_outros = NULL, ver_custo_produtos = NULL WHERE usuario_id = p_usuario_id;
  RETURN public.permissoes_usuario(p_usuario_id);
END;
$$;

-- Trocar o papel ou a loja do usuário zera as personalizações: as
-- permissões passam a ser as do papel novo, em vez de herdar
-- restrições (ou liberações) pensadas pro papel antigo.
CREATE OR REPLACE FUNCTION public.limpar_permissoes_ao_trocar_papel()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.papel IS DISTINCT FROM OLD.papel OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    DELETE FROM public.usuario_permissoes WHERE usuario_id = NEW.usuario_id;
    NEW.ver_vendas_outros  := NULL;
    NEW.ver_custo_produtos := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_permissoes_ao_trocar_papel ON public.usuario_perfis;
CREATE TRIGGER trg_limpar_permissoes_ao_trocar_papel
  BEFORE UPDATE ON public.usuario_perfis
  FOR EACH ROW EXECUTE FUNCTION public.limpar_permissoes_ao_trocar_papel();

-- Custo dos produtos da loja, só pra quem tem ver_custo_produtos.
CREATE OR REPLACE FUNCTION public.custos_produtos()
RETURNS TABLE (produto_id UUID, preco_custo NUMERIC)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT p.id, p.preco_custo
  FROM public.produtos p
  WHERE p.empresa_id = public.minha_empresa() AND public.pode_ver_custo_produtos();
$$;

-- ----------------------------------------------------------------
-- 4) RLS
-- ----------------------------------------------------------------
-- Cadastros que outras telas consultam (clientes na Agenda, produtos
-- no PDV etc.) continuam legíveis pra loja toda; a escrita exige
-- "editar" na tela dona do cadastro. Comandas, caixa e movimentos só
-- são escritos pelas RPCs (SECURITY DEFINER), então ficam sem
-- política de escrita pra API.

-- usuario_permissoes: o próprio usuário e a gestão da loja leem;
-- escrita só pelas RPCs acima.
DROP POLICY IF EXISTS "usuario_permissoes_select" ON public.usuario_permissoes;
CREATE POLICY "usuario_permissoes_select" ON public.usuario_permissoes FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR (public.pode_gerenciar_equipe() AND empresa_id = public.minha_empresa()));

-- usuario_perfis: UPDATE direto só pro super_admin. Gestão da loja
-- altera papel/comissão/ativo pela RPC atualizar_papel_usuario, que
-- não deixa conceder super_admin (antes dava pra fazer UPDATE direto
-- em papel = 'super_admin', inclusive no próprio perfil).
DROP POLICY IF EXISTS "usuario_perfis_update" ON public.usuario_perfis;
CREATE POLICY "usuario_perfis_update" ON public.usuario_perfis FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Leitura pra loja toda + escrita pra quem edita a tela informada.
CREATE OR REPLACE FUNCTION pg_temp.politicas_cadastro(p_tabela TEXT, p_tela TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "empresa_isolada" ON public.%I', p_tabela);
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', p_tabela, p_tabela);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', p_tabela, p_tabela);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', p_tabela, p_tabela);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', p_tabela, p_tabela);
  EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (empresa_id = public.minha_empresa())', p_tabela, p_tabela);
  EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao(%L, true))', p_tabela, p_tabela, p_tela);
  EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (empresa_id = public.minha_empresa() AND public.tem_permissao(%L, true)) WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao(%L, true))', p_tabela, p_tabela, p_tela, p_tela);
  EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (empresa_id = public.minha_empresa() AND public.tem_permissao(%L, true))', p_tabela, p_tabela, p_tela);
END;
$$;

DO $$
BEGIN
  PERFORM pg_temp.politicas_cadastro('clientes', 'clientes');
  PERFORM pg_temp.politicas_cadastro('profissionais', 'profissionais');
  PERFORM pg_temp.politicas_cadastro('servicos', 'produtos');
  PERFORM pg_temp.politicas_cadastro('profissional_servicos', 'produtos');
  PERFORM pg_temp.politicas_cadastro('movimentacoes_estoque', 'produtos');
  PERFORM pg_temp.politicas_cadastro('fornecedores', 'fornecedores');
  PERFORM pg_temp.politicas_cadastro('categorias_financeiras', 'categorias');
  PERFORM pg_temp.politicas_cadastro('formas_pagamento', 'categorias');
  PERFORM pg_temp.politicas_cadastro('agendamentos', 'agenda');
END $$;

-- Vendas: cada um vê as próprias; quem tem ver_vendas_outros vê todas.
-- Comandas antigas (antes de usuario_id existir) ficam só pra quem vê todas.
DROP POLICY IF EXISTS "empresa_isolada" ON public.comandas;
DROP POLICY IF EXISTS "comandas_select" ON public.comandas;
CREATE POLICY "comandas_select" ON public.comandas FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND (public.pode_ver_vendas_outros() OR usuario_id = auth.uid()));

DROP POLICY IF EXISTS "empresa_isolada" ON public.itens_comanda;
DROP POLICY IF EXISTS "itens_comanda_select" ON public.itens_comanda;
CREATE POLICY "itens_comanda_select" ON public.itens_comanda FOR SELECT TO authenticated
  USING (
    empresa_id = public.minha_empresa()
    AND (
      public.pode_ver_vendas_outros()
      OR EXISTS (SELECT 1 FROM public.comandas c WHERE c.id = comanda_id AND c.usuario_id = auth.uid())
    )
  );

-- Caixa: cada um vê as próprias sessões; Financeiro (ver) vê tudo;
-- quem vê vendas de outros vê as sessões e as entradas de venda.
DROP POLICY IF EXISTS "empresa_isolada" ON public.sessoes_caixa;
DROP POLICY IF EXISTS "sessoes_caixa_select" ON public.sessoes_caixa;
CREATE POLICY "sessoes_caixa_select" ON public.sessoes_caixa FOR SELECT TO authenticated
  USING (
    empresa_id = public.minha_empresa()
    AND (usuario_id = auth.uid() OR public.tem_permissao('financeiro') OR public.pode_ver_vendas_outros())
  );

DROP POLICY IF EXISTS "empresa_isolada" ON public.movimentos_caixa;
DROP POLICY IF EXISTS "movimentos_caixa_select" ON public.movimentos_caixa;
CREATE POLICY "movimentos_caixa_select" ON public.movimentos_caixa FOR SELECT TO authenticated
  USING (
    empresa_id = public.minha_empresa()
    AND (
      public.tem_permissao('financeiro')
      OR (comanda_id IS NOT NULL AND public.pode_ver_vendas_outros())
      OR EXISTS (SELECT 1 FROM public.sessoes_caixa s WHERE s.id = sessao_caixa_id AND s.usuario_id = auth.uid())
    )
  );

-- Contas a pagar / a receber
DROP POLICY IF EXISTS "financeiro_gerencia" ON public.contas_pagar;
DROP POLICY IF EXISTS "contas_pagar_select" ON public.contas_pagar;
DROP POLICY IF EXISTS "contas_pagar_escrita" ON public.contas_pagar;
CREATE POLICY "contas_pagar_select" ON public.contas_pagar FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('contas_pagar'));
CREATE POLICY "contas_pagar_escrita" ON public.contas_pagar FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('contas_pagar', true))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('contas_pagar', true));

DROP POLICY IF EXISTS "financeiro_gerencia" ON public.contas_receber;
DROP POLICY IF EXISTS "contas_receber_select" ON public.contas_receber;
DROP POLICY IF EXISTS "contas_receber_escrita" ON public.contas_receber;
CREATE POLICY "contas_receber_select" ON public.contas_receber FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('contas_receber'));
CREATE POLICY "contas_receber_escrita" ON public.contas_receber FOR ALL TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('contas_receber', true))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('contas_receber', true));

-- Contas financeiras (Caixa/Banco): leitura pra loja, escrita pra quem edita Financeiro.
DROP POLICY IF EXISTS "insert_financeiro" ON public.contas_financeiras;
DROP POLICY IF EXISTS "update_financeiro" ON public.contas_financeiras;
DROP POLICY IF EXISTS "delete_financeiro" ON public.contas_financeiras;
CREATE POLICY "insert_financeiro" ON public.contas_financeiras FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('financeiro', true));
CREATE POLICY "update_financeiro" ON public.contas_financeiras FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('financeiro', true))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('financeiro', true));
CREATE POLICY "delete_financeiro" ON public.contas_financeiras FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('financeiro', true));

-- Comissões: quem edita a tela vê e altera todas; os demais veem as próprias.
-- Inserção só pela RPC finalizar_venda (antes qualquer um da loja
-- conseguia inserir comissão pra si mesmo pela API).
DROP POLICY IF EXISTS "comissoes_insere_qualquer_autenticado" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_ve_proprias_ou_financeiro" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_atualiza_financeiro" ON public.comissoes;
DROP POLICY IF EXISTS "comissoes_remove_financeiro" ON public.comissoes;
CREATE POLICY "comissoes_ve_proprias_ou_financeiro" ON public.comissoes FOR SELECT TO authenticated
  USING (
    empresa_id = public.minha_empresa()
    AND (
      public.tem_permissao('comissoes', true)
      OR profissional_id = (SELECT profissional_id FROM public.usuario_perfis WHERE usuario_id = auth.uid())
      OR usuario_id = auth.uid()
    )
  );
CREATE POLICY "comissoes_atualiza_financeiro" ON public.comissoes FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('comissoes', true))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('comissoes', true));
CREATE POLICY "comissoes_remove_financeiro" ON public.comissoes FOR DELETE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('comissoes', true));

-- Configurações da loja
DROP POLICY IF EXISTS "configuracoes_edicao_admin" ON public.configuracoes;
DROP POLICY IF EXISTS "configuracoes_insert_admin" ON public.configuracoes;
CREATE POLICY "configuracoes_edicao_admin" ON public.configuracoes FOR UPDATE TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true))
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true));
CREATE POLICY "configuracoes_insert_admin" ON public.configuracoes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('configuracoes', true));

-- Auditoria
DROP POLICY IF EXISTS "auditoria_leitura_financeiro" ON public.auditoria;
CREATE POLICY "auditoria_leitura_financeiro" ON public.auditoria FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.tem_permissao('auditoria'));

-- ----------------------------------------------------------------
-- 5) Custo dos produtos: privilégio de coluna
-- ----------------------------------------------------------------
-- RLS filtra linhas, não colunas. Pra esconder o custo, a API deixa
-- de ler preco_custo / custo_unitario direto (e "select=*" nessas
-- tabelas passa a dar erro — o app pede as colunas pelo nome). Quem
-- tem ver_custo_produtos lê o custo pela RPC custos_produtos().
-- INSERT/UPDATE continuam permitidos (gravar o custo não revela nada).
REVOKE SELECT ON public.produtos FROM anon, authenticated;
GRANT SELECT (id, nome, categoria, preco_venda, estoque_atual, estoque_minimo, ativo, sku, unidade,
              estoque_maximo, comissao_percentual, empresa_id, foto_url)
  ON public.produtos TO authenticated;

REVOKE SELECT ON public.itens_comanda FROM anon, authenticated;
GRANT SELECT (id, comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, empresa_id)
  ON public.itens_comanda TO authenticated;

-- ----------------------------------------------------------------
-- 6) RPCs: checagem pela permissão da tela
-- ----------------------------------------------------------------
-- Mesmo corpo da versão anterior de cada função; só muda a checagem
-- de permissão (antes: papel administrador/gerente ou nenhuma) e,
-- onde a RPC aceita p_conta_financeira_id, passa a recusar conta de
-- outra loja. Mesmas assinaturas — não cria sobrecarga.
--   abrir_caixa / fechar_caixa ............ Caixa (editar)
--   registrar_movimento_caixa ............. Caixa ou Financeiro (editar)
--   finalizar_venda ....................... PDV (editar)
--   registrar_entrada_produtos ............ Produtos (editar) + ver custo
--   criar/baixar_conta_pagar .............. Contas a Pagar (editar)
--   criar/baixar_conta_receber ............ Contas a Receber (editar)
--   registrar_capital_inicial,
--   excluir_movimento_caixa ............... Financeiro (editar)
--   calcular_dre .......................... DRE (ver); vira SECURITY
--                                           DEFINER porque lê o custo

CREATE OR REPLACE FUNCTION public.abrir_caixa(p_valor_inicial numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT public.tem_permissao('caixa', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto') THEN
    RAISE EXCEPTION 'Você já tem um caixa aberto.';
  END IF;

  INSERT INTO public.sessoes_caixa (usuario_id, empresa_id, valor_inicial)
  VALUES (auth.uid(), v_empresa, COALESCE(p_valor_inicial, 0))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fechar_caixa(p_sessao_id uuid, p_valor_informado numeric, p_observacao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicial  NUMERIC;
  v_entradas NUMERIC;
  v_saidas   NUMERIC;
  v_esperado NUMERIC;
BEGIN
  IF NOT public.tem_permissao('caixa', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa.';
  END IF;
  SELECT valor_inicial INTO v_inicial
  FROM public.sessoes_caixa
  WHERE id = p_sessao_id AND status = 'aberto' AND usuario_id = auth.uid() AND empresa_id = public.minha_empresa();

  IF v_inicial IS NULL THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada ou já fechada.';
  END IF;

  SELECT COALESCE(SUM(valor) FILTER (WHERE tipo = 'entrada'), 0),
         COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)
  INTO v_entradas, v_saidas
  FROM public.movimentos_caixa
  WHERE sessao_caixa_id = p_sessao_id;

  v_esperado := v_inicial + v_entradas - v_saidas;

  UPDATE public.sessoes_caixa
  SET status = 'fechado',
      fechado_em = NOW(),
      saldo_esperado = v_esperado,
      valor_informado = p_valor_informado,
      diferenca = p_valor_informado - v_esperado,
      observacao_fechamento = p_observacao
  WHERE id = p_sessao_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimento_caixa(p_tipo text, p_categoria text, p_descricao text, p_valor numeric, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sessao_id UUID;
  v_empresa   UUID := public.minha_empresa();
  v_conta     UUID;
  v_id        UUID;
BEGIN
  IF NOT (public.tem_permissao('caixa', true) OR public.tem_permissao('financeiro', true)) THEN
    RAISE EXCEPTION 'Você não tem permissão para lançar movimentos no caixa.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de lançar movimentos.';
  END IF;

  v_conta := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES (p_tipo, p_categoria, p_descricao, p_valor, v_sessao_id, v_conta, v_empresa)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalizar_venda(p_cliente_nome text, p_cliente_id uuid, p_forma_pagamento text, p_itens jsonb, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa             UUID := public.minha_empresa();
  v_comanda_id          UUID;
  v_sessao_id           UUID;
  v_total               NUMERIC(10,2) := 0;
  v_item                JSONB;
  v_item_id             UUID;
  v_profissional_id     UUID;
  v_comissao_percentual NUMERIC(5,2);
  v_valor               NUMERIC(10,2);
  v_qtd                 INTEGER;
  v_custo_unitario      NUMERIC(10,2);
  v_comissao_usuario    NUMERIC(5,2);
  v_conta_fin           UUID;
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total
  FROM jsonb_array_elements(p_itens) i;

  INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, forma_pagamento, empresa_id, usuario_id)
  VALUES (p_cliente_id, COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), 'fechada', v_total, p_forma_pagamento, v_empresa, auth.uid())
  RETURNING id INTO v_comanda_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd             := (v_item->>'quantidade')::INTEGER;
    v_valor           := (v_item->>'preco_unitario')::NUMERIC;
    v_profissional_id := NULLIF(v_item->>'profissional_id', '')::UUID;
    v_comissao_percentual := NULL;
    v_custo_unitario  := NULL;

    IF v_item->>'tipo' = 'produto' THEN
      SELECT preco_custo INTO v_custo_unitario FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, empresa_id)
    VALUES (v_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd, v_valor, v_profissional_id, v_custo_unitario, v_empresa)
    RETURNING id INTO v_item_id;

    IF v_item->>'tipo' = 'produto' THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;

      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES ((v_item->>'referencia_id')::UUID, 'venda', -v_qtd, 'Venda PDV', 'comanda', v_comanda_id, v_empresa);
    END IF;

    IF v_profissional_id IS NOT NULL THEN
      IF v_item->>'tipo' = 'servico' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      ELSIF v_item->>'tipo' = 'produto' THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NULL THEN
        SELECT comissao_percentual INTO v_comissao_percentual
        FROM public.profissionais WHERE id = v_profissional_id AND empresa_id = v_empresa;
      END IF;

      IF v_comissao_percentual IS NOT NULL AND v_comissao_percentual > 0 THEN
        INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
        VALUES (
          v_profissional_id, v_comanda_id, v_item_id,
          v_valor * v_qtd, v_comissao_percentual,
          ROUND(v_valor * v_qtd * v_comissao_percentual / 100, 2),
          'pendente', v_empresa
        );
      END IF;
    END IF;
  END LOOP;

  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());
  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, comanda_id, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'venda', 'Venda — ' || COALESCE(NULLIF(p_cliente_nome, ''), 'Balcão'), v_total, v_comanda_id, v_sessao_id, v_conta_fin, v_empresa);

  SELECT comissao_percentual INTO v_comissao_usuario FROM public.usuario_perfis WHERE usuario_id = auth.uid();
  IF v_comissao_usuario IS NOT NULL AND v_comissao_usuario > 0 THEN
    INSERT INTO public.comissoes (usuario_id, comanda_id, valor_base, percentual, valor_comissao, status, empresa_id)
    VALUES (auth.uid(), v_comanda_id, v_total, v_comissao_usuario, ROUND(v_total * v_comissao_usuario / 100, 2), 'pendente', v_empresa);
  END IF;

  RETURN v_comanda_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_entrada_produtos(p_itens jsonb, p_frete numeric DEFAULT 0, p_despesas numeric DEFAULT 0, p_margem_vista numeric DEFAULT 0, p_desconto numeric DEFAULT 0, p_a_vista boolean DEFAULT true, p_conta_financeira_id uuid DEFAULT NULL::uuid, p_fornecedor_id uuid DEFAULT NULL::uuid, p_data_vencimento date DEFAULT NULL::date, p_parcelas integer DEFAULT 1)
 RETURNS TABLE(produto_id uuid, nome text, quantidade integer, custo_unitario numeric, preco_venda numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_empresa           UUID := public.minha_empresa();
  v_item              JSONB;
  v_total_pago        NUMERIC := 0;
  v_proporcao         NUMERIC;
  v_custo_unitario    NUMERIC;
  v_preco_vista       NUMERIC;
  v_produto_id        UUID;
  v_qtd               INTEGER;
  v_valor_pago        NUMERIC;
  v_itens_desc        TEXT[] := ARRAY[]::TEXT[];
  v_total_entrada     NUMERIC(10,2);
  v_descricao         TEXT;
  v_conta_fin         UUID;
  v_categoria_despesa UUID;
BEGIN
  IF NOT (public.tem_permissao('produtos', true) AND public.pode_ver_custo_produtos()) THEN
    RAISE EXCEPTION 'Você não tem permissão para dar entrada de mercadoria (precisa editar Produtos e ver o custo).';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um item na entrada.';
  END IF;

  SELECT COALESCE(SUM((i->>'valor_pago_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0)
  INTO v_total_pago
  FROM jsonb_array_elements(p_itens) i;

  IF v_total_pago <= 0 THEN
    RAISE EXCEPTION 'Informe o valor pago dos itens.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd        := (v_item->>'quantidade')::INTEGER;
    v_valor_pago := (v_item->>'valor_pago_unitario')::NUMERIC;

    IF v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_item->>'nome';
    END IF;
    IF v_valor_pago IS NULL OR v_valor_pago < 0 THEN
      RAISE EXCEPTION 'Valor pago inválido para "%".', v_item->>'nome';
    END IF;

    v_proporcao      := (v_valor_pago * v_qtd) / v_total_pago;
    v_custo_unitario := v_valor_pago + (v_proporcao * (COALESCE(p_frete, 0) + COALESCE(p_despesas, 0) - COALESCE(p_desconto, 0))) / v_qtd;

    v_preco_vista := CASE
      WHEN NULLIF(v_item->>'preco_venda', '') IS NOT NULL THEN (v_item->>'preco_venda')::NUMERIC
      ELSE ROUND(v_custo_unitario * (1 + p_margem_vista / 100), 2)
    END;

    v_produto_id := NULLIF(v_item->>'produto_id', '')::UUID;

    IF v_produto_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto_id AND empresa_id = v_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;

      UPDATE public.produtos SET
        preco_custo   = ROUND(v_custo_unitario, 2),
        preco_venda   = v_preco_vista,
        estoque_atual = estoque_atual + v_qtd
      WHERE id = v_produto_id;
    ELSE
      IF NULLIF(trim(v_item->>'nome'), '') IS NULL THEN
        RAISE EXCEPTION 'Informe o nome do produto novo.';
      END IF;

      INSERT INTO public.produtos (nome, categoria, preco_custo, preco_venda, estoque_atual, unidade, empresa_id)
      VALUES (
        trim(v_item->>'nome'),
        COALESCE(NULLIF(v_item->>'categoria', ''), 'outros'),
        ROUND(v_custo_unitario, 2),
        v_preco_vista,
        v_qtd,
        'un',
        v_empresa
      )
      RETURNING id INTO v_produto_id;
    END IF;

    INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, empresa_id)
    VALUES (v_produto_id, 'entrada', v_qtd, 'Entrada de mercadoria', 'entrada_manual', v_empresa);

    v_itens_desc := array_append(v_itens_desc, trim(v_item->>'nome') || ' (' || v_qtd || 'un)');

    produto_id     := v_produto_id;
    nome           := trim(v_item->>'nome');
    quantidade     := v_qtd;
    custo_unitario := ROUND(v_custo_unitario, 2);
    preco_venda    := v_preco_vista;
    RETURN NEXT;
  END LOOP;

  v_total_entrada := ROUND(v_total_pago + COALESCE(p_frete, 0) + COALESCE(p_despesas, 0) - COALESCE(p_desconto, 0), 2);
  v_descricao := 'Entrada de mercadoria: ' || array_to_string(v_itens_desc, ', ')
    || ' — peças ' || to_char(v_total_pago, 'FM999999990.00')
    || ', frete ' || to_char(COALESCE(p_frete, 0), 'FM999999990.00')
    || ', despesas ' || to_char(COALESCE(p_despesas, 0), 'FM999999990.00')
    || ', desconto ' || to_char(COALESCE(p_desconto, 0), 'FM999999990.00');

  IF p_a_vista THEN
    v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());
    INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
    VALUES ('saida', 'compra_mercadoria', v_descricao, v_total_entrada, NULL, v_conta_fin, v_empresa);
  ELSE
    SELECT id INTO v_categoria_despesa
    FROM public.categorias_financeiras
    WHERE empresa_id = v_empresa AND tipo = 'despesa' AND nome = 'Produtos para revenda'
    LIMIT 1;

    PERFORM public.criar_conta_pagar(
      p_fornecedor_id,
      v_categoria_despesa,
      v_descricao,
      v_total_entrada,
      COALESCE(p_data_vencimento, (CURRENT_DATE + INTERVAL '30 days')::DATE),
      GREATEST(1, COALESCE(p_parcelas, 1)),
      NULL
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_conta_pagar(p_fornecedor_id uuid, p_categoria_id uuid, p_descricao text, p_valor_total numeric, p_data_vencimento date, p_total_parcelas integer DEFAULT 1, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.tem_permissao('contas_pagar', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_conta_receber(p_cliente_id uuid, p_categoria_id uuid, p_descricao text, p_valor_total numeric, p_data_vencimento date, p_total_parcelas integer DEFAULT 1, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.tem_permissao('contas_receber', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem, empresa_id
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual', v_empresa
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(p_conta_id uuid, p_valor_pago numeric, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_conta      RECORD;
  v_novo_pago  NUMERIC(10,2);
  v_sessao_id  UUID;
  v_conta_fin  UUID;
BEGIN
  IF NOT public.tem_permissao('contas_pagar', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT * INTO v_conta FROM public.contas_pagar WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível pagar novamente.', v_conta.status; END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
  IF v_conta.valor_pago + p_valor_pago > v_conta.valor THEN
    RAISE EXCEPTION 'Valor pago (%) excede o saldo restante (%) dessa conta.', p_valor_pago, (v_conta.valor - v_conta.valor_pago);
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;
  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  UPDATE public.contas_pagar
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('saida', 'conta_a_pagar', 'Pagamento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_conta_fin, v_empresa);
END;
$function$;

CREATE OR REPLACE FUNCTION public.baixar_conta_receber(p_conta_id uuid, p_valor_pago numeric, p_forma_pagamento_id uuid DEFAULT NULL::uuid, p_conta_financeira_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_conta      RECORD;
  v_novo_pago  NUMERIC(10,2);
  v_sessao_id  UUID;
  v_conta_fin  UUID;
BEGIN
  IF NOT public.tem_permissao('contas_receber', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;

  IF p_conta_financeira_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa
  ) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada na sua loja.';
  END IF;


  SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_conta_id AND empresa_id = v_empresa FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível receber novamente.', v_conta.status; END IF;
  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN RAISE EXCEPTION 'Informe um valor maior que zero.'; END IF;
  IF v_conta.valor_pago + p_valor_pago > v_conta.valor THEN
    RAISE EXCEPTION 'Valor recebido (%) excede o saldo restante (%) dessa conta.', p_valor_pago, (v_conta.valor - v_conta.valor_pago);
  END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;
  v_conta_fin := COALESCE(p_conta_financeira_id, public.conta_financeira_padrao());

  UPDATE public.contas_receber
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'conta_a_receber', 'Recebimento — ' || v_conta.descricao, p_valor_pago, v_sessao_id, v_conta_fin, v_empresa);
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_capital_inicial(p_conta_financeira_id uuid, p_valor numeric, p_data date DEFAULT CURRENT_DATE, p_observacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_id      UUID;
BEGIN
  IF NOT public.tem_permissao('financeiro', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar capital inicial.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contas_financeiras WHERE id = p_conta_financeira_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Conta financeira não encontrada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.movimentos_caixa WHERE conta_financeira_id = p_conta_financeira_id AND categoria = 'capital_inicial') THEN
    RAISE EXCEPTION 'Essa conta já tem um saldo inicial lançado.';
  END IF;

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, conta_financeira_id, empresa_id)
  VALUES ('entrada', 'capital_inicial', COALESCE(NULLIF(p_observacao, ''), 'Saldo inicial'), p_valor, p_data, p_conta_financeira_id, v_empresa)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_movimento_caixa(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT public.tem_permissao('financeiro', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir lançamentos financeiros.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  DELETE FROM public.movimentos_caixa WHERE id = p_id AND empresa_id = v_empresa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calcular_dre(p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_receita_servicos NUMERIC(12,2);
  v_receita_produtos NUMERIC(12,2);
  v_outras_receitas  NUMERIC(12,2);
  v_cmv              NUMERIC(12,2);
  v_comissoes        NUMERIC(12,2);
  v_despesas         JSONB;
  v_total_despesas   NUMERIC(12,2);
  v_receita_bruta    NUMERIC(12,2);
  v_lucro_bruto      NUMERIC(12,2);
BEGIN
  IF NOT public.tem_permissao('dre') THEN
    RAISE EXCEPTION 'Você não tem permissão para ver a DRE.';
  END IF;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_servicos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'servico' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_produtos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_outras_receitas
  FROM public.contas_receber
  WHERE data_pagamento BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

  SELECT COALESCE(SUM(ic.quantidade * COALESCE(ic.custo_unitario, 0)), 0) INTO v_cmv
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND c.empresa_id = v_empresa;

  SELECT COALESCE(SUM(co.valor_comissao), 0) INTO v_comissoes
  FROM public.comissoes co
  JOIN public.comandas c ON c.id = co.comanda_id
  WHERE c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND co.status <> 'cancelada' AND c.empresa_id = v_empresa;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'valor', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(SUM(total), 0)
  INTO v_despesas, v_total_despesas
  FROM (
    SELECT COALESCE(pai.nome, cf.nome, 'Sem categoria') AS cat, SUM(cp.valor_pago) AS total
    FROM public.contas_pagar cp
    LEFT JOIN public.categorias_financeiras cf ON cf.id = cp.categoria_id
    LEFT JOIN public.categorias_financeiras pai ON pai.id = cf.categoria_pai_id
    WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim AND cp.empresa_id = v_empresa
    GROUP BY COALESCE(pai.nome, cf.nome, 'Sem categoria')
  ) t;

  v_receita_bruta := v_receita_servicos + v_receita_produtos + v_outras_receitas;
  v_lucro_bruto   := v_receita_bruta - (v_cmv + v_comissoes);

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'receita_servicos', v_receita_servicos,
    'receita_produtos', v_receita_produtos,
    'outras_receitas', v_outras_receitas,
    'receita_bruta', v_receita_bruta,
    'cmv', v_cmv,
    'comissoes', v_comissoes,
    'custos_total', v_cmv + v_comissoes,
    'lucro_bruto', v_lucro_bruto,
    'despesas_por_categoria', v_despesas,
    'despesas_total', v_total_despesas,
    'resultado_operacional', v_lucro_bruto - v_total_despesas
  );
END;
$function$;

