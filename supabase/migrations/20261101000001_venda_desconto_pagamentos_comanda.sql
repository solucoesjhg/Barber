-- ================================================================
-- Venda: desconto, pagamento dividido, comanda aberta e caixa por
-- forma de pagamento
-- ================================================================
-- 1) comandas.desconto: os itens ficam com o preço cheio e o total da
--    venda é itens − desconto. Dar desconto é uma permissão especial
--    (usuario_perfis.dar_desconto; padrão: administrador e gerente).
--    A comissão é proporcional ao que foi cobrado.
-- 2) comanda_pagamentos: uma venda pode ser paga em várias formas
--    (parte no Pix, parte no cartão...). Cada pagamento tem a sua
--    maquininha, parcelas, taxa e repasse. A comanda guarda o resumo
--    (forma principal = a de maior valor, taxa e acréscimo somados).
-- 3) Comanda aberta: salvar_comanda grava os itens com status 'aberta'
--    (sem caixa, estoque nem comissão); finalizar_venda(p_comanda_id)
--    fecha essa mesma comanda.
-- 4) movimentos_caixa.forma_pagamento: cada pagamento entra no caixa
--    separado. O fechamento confere só o dinheiro da gaveta.
-- Idempotente. Depende das migrações até 20261031000001.

-- ----------------------------------------------------------------
-- Estrutura
-- ----------------------------------------------------------------
ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS desconto NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.comandas DROP CONSTRAINT IF EXISTS comandas_desconto_check;
ALTER TABLE public.comandas ADD CONSTRAINT comandas_desconto_check CHECK (desconto >= 0);

CREATE TABLE IF NOT EXISTS public.comanda_pagamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id      UUID NOT NULL REFERENCES public.comandas(id) ON DELETE CASCADE,
  empresa_id      UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  forma           TEXT NOT NULL CHECK (forma IN ('pix', 'credito', 'debito', 'dinheiro')),
  valor           NUMERIC(10,2) NOT NULL CHECK (valor >= 0),
  parcelas        INTEGER NOT NULL DEFAULT 1,
  maquininha_id   UUID REFERENCES public.maquininhas(id) ON DELETE SET NULL,
  taxa_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxa_valor      NUMERIC(10,2) NOT NULL DEFAULT 0,
  acrescimo       NUMERIC(10,2) NOT NULL DEFAULT 0,
  cobrado         NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comanda_pagamentos_comanda ON public.comanda_pagamentos (comanda_id);
ALTER TABLE public.comanda_pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comanda_pagamentos_select" ON public.comanda_pagamentos;
CREATE POLICY "comanda_pagamentos_select" ON public.comanda_pagamentos FOR SELECT TO authenticated
  USING (empresa_id = public.minha_empresa() AND public.comanda_visivel(comanda_id));
GRANT SELECT ON public.comanda_pagamentos TO authenticated;

-- Vendas antigas: um pagamento com o que a comanda já tinha.
INSERT INTO public.comanda_pagamentos (comanda_id, empresa_id, forma, valor, parcelas, maquininha_id, taxa_percentual, taxa_valor, acrescimo, cobrado)
SELECT c.id, c.empresa_id, c.forma_pagamento, c.total, COALESCE(c.parcelas, 1), c.maquininha_id,
       c.taxa_percentual, c.taxa_valor, c.acrescimo, c.total + c.acrescimo
FROM public.comandas c
WHERE c.status = 'fechada' AND c.forma_pagamento IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.comanda_pagamentos p WHERE p.comanda_id = c.id);

ALTER TABLE public.movimentos_caixa ADD COLUMN IF NOT EXISTS forma_pagamento TEXT;
UPDATE public.movimentos_caixa m SET forma_pagamento = c.forma_pagamento
FROM public.comandas c
WHERE m.comanda_id = c.id AND m.categoria = 'venda' AND m.forma_pagamento IS NULL;

-- ----------------------------------------------------------------
-- Permissão especial "Dar desconto na venda"
-- ----------------------------------------------------------------
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS dar_desconto BOOLEAN;

CREATE OR REPLACE FUNCTION public.pode_dar_desconto()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COALESCE((
    SELECT CASE WHEN papel = 'administrador' THEN true
                ELSE COALESCE(dar_desconto, papel = 'gerente') END
    FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND ativo = true AND empresa_id IS NOT NULL
  ), false);
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
    'ver_agendamentos_outros', CASE WHEN up.papel = 'administrador' THEN true
                                    ELSE COALESCE(up.ver_agendamentos_outros, up.papel <> 'profissional') END,
    'ver_custo_produtos', CASE WHEN up.papel = 'administrador' THEN true
                               ELSE COALESCE(up.ver_custo_produtos, up.papel = 'gerente') END,
    'dar_desconto', CASE WHEN up.papel = 'administrador' THEN true
                         ELSE COALESCE(up.dar_desconto, up.papel = 'gerente') END,
    'especiais_personalizados', up.ver_vendas_outros IS NOT NULL OR up.ver_custo_produtos IS NOT NULL
                                OR up.ver_agendamentos_outros IS NOT NULL OR up.dar_desconto IS NOT NULL,
    'dashboard_cards', to_jsonb(CASE WHEN up.papel = 'administrador' THEN public.cards_dashboard()
                                     ELSE COALESCE(up.dashboard_cards, public.cards_dashboard_padrao(up.papel)) END),
    'dashboard_personalizado', up.dashboard_cards IS NOT NULL,
    'relatorios', to_jsonb(CASE WHEN up.papel = 'administrador' THEN public.relatorios_disponiveis()
                                ELSE COALESCE(up.relatorios, public.relatorios_disponiveis()) END),
    'relatorios_personalizado', up.relatorios IS NOT NULL,
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
      'ver_vendas_outros', false, 'ver_agendamentos_outros', false, 'ver_custo_produtos', false, 'dar_desconto', false,
      'especiais_personalizados', false,
      'dashboard_cards', '[]'::jsonb, 'dashboard_personalizado', false,
      'relatorios', '[]'::jsonb, 'relatorios_personalizado', false,
      'telas', (SELECT jsonb_object_agg(tela, jsonb_build_object('ver', false, 'editar', false, 'tem_edicao', tem_edicao, 'personalizado', false))
                FROM public.telas_configuraveis())
    ) INTO v_json
    FROM public.usuario_perfis up WHERE up.usuario_id = auth.uid();
    RETURN v_json;
  END IF;
  RETURN public.permissoes_json(auth.uid());
END;
$$;

DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[], TEXT[], BOOLEAN);
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id              UUID,
  p_telas                   JSONB,
  p_ver_vendas_outros       BOOLEAN,
  p_ver_custo_produtos      BOOLEAN,
  p_dashboard_cards         TEXT[] DEFAULT NULL,
  p_relatorios              TEXT[] DEFAULT NULL,
  p_ver_agendamentos_outros BOOLEAN DEFAULT NULL,
  p_dar_desconto            BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_tela       TEXT;
  v_valor      JSONB;
  v_ver        BOOLEAN;
  v_editar     BOOLEAN;
  v_tem_edicao BOOLEAN;
  v_card       TEXT;
  v_relatorio  TEXT;
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

  IF p_relatorios IS NOT NULL THEN
    FOREACH v_relatorio IN ARRAY p_relatorios LOOP
      IF NOT (v_relatorio = ANY (public.relatorios_disponiveis())) THEN
        RAISE EXCEPTION 'Relatório desconhecido: %', v_relatorio;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.usuario_perfis
  SET ver_vendas_outros = p_ver_vendas_outros, ver_custo_produtos = p_ver_custo_produtos,
      ver_agendamentos_outros = p_ver_agendamentos_outros, dar_desconto = p_dar_desconto,
      dashboard_cards = COALESCE(p_dashboard_cards, dashboard_cards),
      relatorios = COALESCE(p_relatorios, relatorios)
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
  SET ver_vendas_outros = NULL, ver_custo_produtos = NULL, ver_agendamentos_outros = NULL, dar_desconto = NULL,
      dashboard_cards = NULL, relatorios = NULL
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
    NEW.ver_vendas_outros       := NULL;
    NEW.ver_custo_produtos      := NULL;
    NEW.ver_agendamentos_outros := NULL;
    NEW.dar_desconto            := NULL;
    NEW.dashboard_cards         := NULL;
    NEW.relatorios              := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- Itens da venda: validação e gravação (usadas por finalizar_venda,
-- editar_venda e salvar_comanda)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_itens_venda(p_empresa UUID, p_itens JSONB, p_exigir_profissional BOOLEAN)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item JSONB;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'A venda precisa ter ao menos um item.';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    IF COALESCE((v_item->>'quantidade')::INTEGER, 0) <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida para "%".', v_item->>'nome';
    END IF;
    IF COALESCE((v_item->>'preco_unitario')::NUMERIC, -1) < 0 THEN
      RAISE EXCEPTION 'Preço inválido para "%".', v_item->>'nome';
    END IF;
    IF v_item->>'tipo' = 'produto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = p_empresa) THEN
        RAISE EXCEPTION 'Produto "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
    ELSIF v_item->>'tipo' = 'servico' THEN
      IF NOT EXISTS (SELECT 1 FROM public.servicos WHERE id = (v_item->>'referencia_id')::UUID AND empresa_id = p_empresa) THEN
        RAISE EXCEPTION 'Serviço "%" não encontrado no catálogo da sua loja.', v_item->>'nome';
      END IF;
      IF p_exigir_profissional AND NULLIF(v_item->>'profissional_id', '') IS NULL THEN
        RAISE EXCEPTION 'Escolha o profissional do serviço "%".', v_item->>'nome';
      END IF;
    ELSE
      RAISE EXCEPTION 'Item "%" com tipo inválido.', v_item->>'nome';
    END IF;
    IF NULLIF(v_item->>'profissional_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profissionais
      WHERE id = (v_item->>'profissional_id')::UUID AND empresa_id = p_empresa
    ) THEN
      RAISE EXCEPTION 'Profissional do item "%" não encontrado na sua loja.', v_item->>'nome';
    END IF;
  END LOOP;
  RETURN (SELECT COALESCE(SUM((i->>'preco_unitario')::NUMERIC * (i->>'quantidade')::INTEGER), 0) FROM jsonb_array_elements(p_itens) i);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.validar_itens_venda(UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Grava os itens. Com p_baixar_estoque, tira do estoque e guarda o
-- custo (p_custos: custo da época por produto, na edição).
CREATE OR REPLACE FUNCTION public.inserir_itens_venda(p_comanda_id UUID, p_empresa UUID, p_itens JSONB, p_baixar_estoque BOOLEAN, p_custos JSONB DEFAULT '{}'::jsonb, p_motivo TEXT DEFAULT 'Venda PDV')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item    JSONB;
  v_qtd     INTEGER;
  v_produto UUID;
  v_custo   NUMERIC(10,2);
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd := (v_item->>'quantidade')::INTEGER;
    v_produto := CASE WHEN v_item->>'tipo' = 'produto' THEN (v_item->>'referencia_id')::UUID END;
    v_custo := NULL;
    IF v_produto IS NOT NULL AND p_baixar_estoque THEN
      IF COALESCE(p_custos, '{}'::jsonb) ? v_produto::TEXT THEN
        v_custo := (p_custos->>v_produto::TEXT)::NUMERIC;
      ELSE
        SELECT preco_custo INTO v_custo FROM public.produtos WHERE id = v_produto AND empresa_id = p_empresa;
      END IF;
    END IF;

    INSERT INTO public.itens_comanda (comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, custo_unitario, empresa_id)
    VALUES (p_comanda_id, v_item->>'tipo', (v_item->>'referencia_id')::UUID, v_item->>'nome', v_qtd,
            (v_item->>'preco_unitario')::NUMERIC, NULLIF(v_item->>'profissional_id', '')::UUID, v_custo, p_empresa);

    IF v_produto IS NOT NULL AND p_baixar_estoque THEN
      UPDATE public.produtos SET estoque_atual = estoque_atual - v_qtd
      WHERE id = v_produto AND empresa_id = p_empresa;
      INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
      VALUES (v_produto, 'venda', -v_qtd, p_motivo, 'comanda', p_comanda_id, p_empresa);
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.inserir_itens_venda(UUID, UUID, JSONB, BOOLEAN, JSONB, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------
-- Pagamentos da venda: grava cada um, lança no caixa (separado por
-- forma) e a taxa de cada um; atualiza o resumo na comanda.
-- p_anteriores: pagamentos que a venda tinha (na edição, a mesma
-- forma/parcelas/maquininha mantém a taxa da época).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aplicar_pagamentos_venda(
  p_comanda_id UUID, p_pagamentos JSONB, p_sessao_id UUID, p_cliente TEXT, p_data DATE,
  p_anteriores JSONB DEFAULT '[]'::jsonb, p_conta UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_c          RECORD;
  v_p          JSONB;
  v_ant        JSONB;
  v_forma      TEXT;
  v_valor      NUMERIC(10,2);
  v_parc       INTEGER;
  v_maq        UUID;
  v_maq_nome   TEXT;
  v_pct        NUMERIC(5,2);
  v_cobrado    NUMERIC(10,2);
  v_acr        NUMERIC(10,2);
  v_taxa       NUMERIC(10,2);
  v_soma       NUMERIC(10,2) := 0;
  v_cobr_total NUMERIC(10,2) := 0;
  v_acr_total  NUMERIC(10,2) := 0;
  v_taxa_total NUMERIC(10,2) := 0;
  v_maior      NUMERIC(10,2) := -1;
  v_princ      TEXT;
  v_princ_parc INTEGER := 1;
  v_princ_maq  UUID;
  v_qtd        INTEGER;
  v_conta      UUID := COALESCE(p_conta, public.conta_financeira_padrao());
  v_rotulo     TEXT;
BEGIN
  SELECT id, empresa_id, total INTO v_c FROM public.comandas WHERE id = p_comanda_id;
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento.';
  END IF;
  v_qtd := jsonb_array_length(p_pagamentos);

  DELETE FROM public.comanda_pagamentos WHERE comanda_id = p_comanda_id;
  DELETE FROM public.movimentos_caixa WHERE comanda_id = p_comanda_id AND categoria IN ('venda', 'taxa_cartao');

  FOR v_p IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    v_forma := v_p->>'forma';
    IF v_forma IS NULL OR v_forma NOT IN ('pix', 'credito', 'debito', 'dinheiro') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida.';
    END IF;
    v_valor := ROUND(COALESCE((v_p->>'valor')::NUMERIC, 0), 2);
    IF v_valor < 0 OR (v_valor = 0 AND v_c.total > 0) THEN
      RAISE EXCEPTION 'Informe o valor de cada forma de pagamento.';
    END IF;
    v_parc := public.validar_parcelas(v_c.empresa_id, v_forma, COALESCE((v_p->>'parcelas')::INTEGER, 1));

    SELECT a INTO v_ant FROM jsonb_array_elements(COALESCE(p_anteriores, '[]'::jsonb)) a
    WHERE a->>'forma' = v_forma AND COALESCE((a->>'parcelas')::INTEGER, 1) = v_parc
      AND NULLIF(a->>'maquininha_id', '') IS NOT DISTINCT FROM NULLIF(v_p->>'maquininha_id', '')
    LIMIT 1;
    IF v_ant IS NOT NULL THEN
      v_maq := NULLIF(v_ant->>'maquininha_id', '')::UUID;
      v_pct := COALESCE((v_ant->>'taxa_percentual')::NUMERIC, 0);
    ELSE
      v_maq := public.validar_maquininha(v_c.empresa_id, v_forma, NULLIF(v_p->>'maquininha_id', '')::UUID);
      v_pct := CASE WHEN v_maq IS NULL THEN 0 ELSE public.taxa_maquininha(v_maq, v_forma, v_parc) END;
    END IF;

    SELECT * INTO v_cobrado, v_acr, v_taxa
    FROM public.calcular_cobranca(v_valor, v_pct, COALESCE((v_p->>'repassar')::BOOLEAN, false));

    INSERT INTO public.comanda_pagamentos (comanda_id, empresa_id, forma, valor, parcelas, maquininha_id, taxa_percentual, taxa_valor, acrescimo, cobrado)
    VALUES (p_comanda_id, v_c.empresa_id, v_forma, v_valor, v_parc, v_maq, v_pct, v_taxa, v_acr, v_cobrado);

    v_rotulo := public.rotulo_pagamento(v_forma, v_parc);
    IF v_cobrado > 0 THEN
      INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, comanda_id, sessao_caixa_id, conta_financeira_id, empresa_id, forma_pagamento)
      VALUES ('entrada', 'venda',
              'Venda — ' || COALESCE(NULLIF(trim(p_cliente), ''), 'Balcão') || CASE WHEN v_qtd > 1 THEN ' (' || v_rotulo || ')' ELSE '' END,
              v_cobrado, p_data, p_comanda_id, p_sessao_id, v_conta, v_c.empresa_id, v_forma);
    END IF;

    IF v_taxa > 0 THEN
      SELECT nome INTO v_maq_nome FROM public.maquininhas WHERE id = v_maq;
      INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, data, comanda_id, conta_financeira_id, empresa_id, forma_pagamento)
      VALUES ('saida', 'taxa_cartao',
              'Taxa ' || COALESCE(v_maq_nome || ' · ', '') || v_rotulo
                || ' (' || replace(to_char(v_pct, 'FM990.00'), '.', ',') || '%)',
              v_taxa, p_data, p_comanda_id, v_conta, v_c.empresa_id, v_forma);
    END IF;

    v_soma := v_soma + v_valor;
    v_cobr_total := v_cobr_total + v_cobrado;
    v_acr_total := v_acr_total + v_acr;
    v_taxa_total := v_taxa_total + v_taxa;
    IF v_valor > v_maior THEN
      v_maior := v_valor; v_princ := v_forma; v_princ_parc := v_parc; v_princ_maq := v_maq;
    END IF;
  END LOOP;

  IF abs(v_soma - v_c.total) > 0.009 THEN
    RAISE EXCEPTION 'Os pagamentos somam R$ % e a venda é de R$ %. Ajuste os valores.',
      replace(to_char(v_soma, 'FM999999990.00'), '.', ','), replace(to_char(v_c.total, 'FM999999990.00'), '.', ',');
  END IF;

  UPDATE public.comandas
  SET forma_pagamento = v_princ,
      parcelas        = v_princ_parc,
      maquininha_id   = v_princ_maq,
      taxa_valor      = v_taxa_total,
      acrescimo       = v_acr_total,
      taxa_percentual = CASE WHEN v_cobr_total > 0 THEN LEAST(ROUND(v_taxa_total / v_cobr_total * 100, 2), 999.99) ELSE 0 END
  WHERE id = p_comanda_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.aplicar_pagamentos_venda(UUID, JSONB, UUID, TEXT, DATE, JSONB, UUID) FROM PUBLIC, anon, authenticated;

-- Comissão sobre o que foi cobrado: com desconto, cada item entra
-- proporcional (total / soma dos itens).
CREATE OR REPLACE FUNCTION public.gerar_comissoes_venda(p_comanda_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comanda  RECORD;
  v_item     RECORD;
  v_desconta BOOLEAN;
  v_pct      NUMERIC(5,2);
  v_bruto    NUMERIC(10,2);
  v_taxa     NUMERIC(10,2);
  v_fator    NUMERIC;
BEGIN
  SELECT id, empresa_id, taxa_percentual, acrescimo, total, desconto INTO v_comanda FROM public.comandas WHERE id = p_comanda_id;
  SELECT COALESCE(comissao_desconta_taxa, true) INTO v_desconta FROM public.configuracoes WHERE empresa_id = v_comanda.empresa_id;
  -- Taxa repassada ao cliente: a loja não perdeu nada, a base fica cheia.
  v_desconta := COALESCE(v_desconta, true) AND COALESCE(v_comanda.acrescimo, 0) = 0;
  v_fator := CASE WHEN COALESCE(v_comanda.total, 0) + COALESCE(v_comanda.desconto, 0) > 0
                  THEN v_comanda.total / (v_comanda.total + COALESCE(v_comanda.desconto, 0)) ELSE 1 END;

  FOR v_item IN
    SELECT id, tipo, referencia_id, quantidade, preco_unitario, profissional_id
    FROM public.itens_comanda WHERE comanda_id = p_comanda_id AND profissional_id IS NOT NULL
  LOOP
    v_pct := NULL;
    IF v_item.tipo = 'servico' THEN
      SELECT comissao_percentual INTO v_pct FROM public.servicos WHERE id = v_item.referencia_id AND empresa_id = v_comanda.empresa_id;
    ELSE
      SELECT comissao_percentual INTO v_pct FROM public.produtos WHERE id = v_item.referencia_id AND empresa_id = v_comanda.empresa_id;
    END IF;
    IF v_pct IS NULL THEN
      SELECT comissao_percentual INTO v_pct FROM public.profissionais WHERE id = v_item.profissional_id AND empresa_id = v_comanda.empresa_id;
    END IF;
    CONTINUE WHEN v_pct IS NULL OR v_pct <= 0;

    v_bruto := ROUND(v_item.preco_unitario * v_item.quantidade * v_fator, 2);
    v_taxa  := CASE WHEN v_desconta THEN ROUND(v_bruto * v_comanda.taxa_percentual / 100, 2) ELSE 0 END;

    INSERT INTO public.comissoes (profissional_id, comanda_id, item_comanda_id, valor_base, taxa_valor, percentual, valor_comissao, status, empresa_id)
    VALUES (v_item.profissional_id, p_comanda_id, v_item.id, v_bruto - v_taxa, v_taxa, v_pct,
            ROUND((v_bruto - v_taxa) * v_pct / 100, 2), 'pendente', v_comanda.empresa_id);
  END LOOP;
END;
$function$;

-- ----------------------------------------------------------------
-- finalizar_venda: desconto, vários pagamentos e fechar comanda aberta
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.finalizar_venda(text, uuid, text, jsonb, uuid, integer, uuid, boolean);
CREATE OR REPLACE FUNCTION public.finalizar_venda(
  p_cliente_nome        TEXT,
  p_cliente_id          UUID,
  p_forma_pagamento     TEXT,
  p_itens               JSONB,
  p_conta_financeira_id UUID DEFAULT NULL,
  p_parcelas            INTEGER DEFAULT 1,
  p_maquininha_id       UUID DEFAULT NULL,
  p_repassar_taxa       BOOLEAN DEFAULT false,
  p_desconto            NUMERIC DEFAULT 0,
  p_pagamentos          JSONB DEFAULT NULL,
  p_comanda_id          UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa    UUID := public.minha_empresa();
  v_comanda_id UUID;
  v_sessao_id  UUID;
  v_subtotal   NUMERIC(10,2);
  v_desconto   NUMERIC(10,2) := ROUND(COALESCE(p_desconto, 0), 2);
  v_total      NUMERIC(10,2);
  v_pagamentos JSONB;
  v_cliente    TEXT := COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão');
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

  v_subtotal := public.validar_itens_venda(v_empresa, p_itens, true);
  IF v_desconto < 0 OR v_desconto > v_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido.';
  END IF;
  IF v_desconto > 0 AND NOT public.pode_dar_desconto() THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para dar desconto.';
  END IF;
  v_total := v_subtotal - v_desconto;

  v_pagamentos := COALESCE(p_pagamentos, jsonb_build_array(jsonb_build_object(
    'forma', p_forma_pagamento, 'valor', v_total, 'parcelas', COALESCE(p_parcelas, 1),
    'maquininha_id', p_maquininha_id, 'repassar', COALESCE(p_repassar_taxa, false))));

  PERFORM public.fechar_caixas_vencidos(v_empresa);
  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE empresa_id = v_empresa AND status = 'aberto';
  IF v_sessao_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum caixa aberto. Abra o caixa antes de vender.';
  END IF;

  IF p_comanda_id IS NOT NULL THEN
    SELECT id INTO v_comanda_id FROM public.comandas
    WHERE id = p_comanda_id AND empresa_id = v_empresa AND status = 'aberta'
    FOR UPDATE;
    IF v_comanda_id IS NULL THEN
      RAISE EXCEPTION 'Comanda não encontrada ou já fechada.';
    END IF;
    DELETE FROM public.itens_comanda WHERE comanda_id = v_comanda_id;
    UPDATE public.comandas
    SET cliente_nome = v_cliente, cliente_id = COALESCE(p_cliente_id, cliente_id), status = 'fechada',
        total = v_total, desconto = v_desconto, data = CURRENT_DATE, created_at = now(), usuario_id = auth.uid()
    WHERE id = v_comanda_id;
  ELSE
    INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, desconto, empresa_id, usuario_id)
    VALUES (p_cliente_id, v_cliente, 'fechada', v_total, v_desconto, v_empresa, auth.uid())
    RETURNING id INTO v_comanda_id;
  END IF;

  PERFORM public.inserir_itens_venda(v_comanda_id, v_empresa, p_itens, true);
  PERFORM public.aplicar_pagamentos_venda(v_comanda_id, v_pagamentos, v_sessao_id, v_cliente, CURRENT_DATE, '[]'::jsonb, p_conta_financeira_id);
  PERFORM public.gerar_comissoes_venda(v_comanda_id);

  RETURN v_comanda_id;
END;
$$;

-- ----------------------------------------------------------------
-- editar_venda: também desconto e vários pagamentos
-- ----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.editar_venda(uuid, text, text, jsonb, boolean, integer, uuid, boolean);
CREATE OR REPLACE FUNCTION public.editar_venda(
  p_comanda_id      UUID,
  p_cliente_nome    TEXT,
  p_forma_pagamento TEXT,
  p_itens           JSONB,
  p_sem_comissao    BOOLEAN DEFAULT false,
  p_parcelas        INTEGER DEFAULT 1,
  p_maquininha_id   UUID DEFAULT NULL,
  p_repassar_taxa   BOOLEAN DEFAULT false,
  p_desconto        NUMERIC DEFAULT NULL,
  p_pagamentos      JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa        UUID := public.minha_empresa();
  v_comanda        RECORD;
  v_antigo         RECORD;
  v_custos_antigos JSONB := '{}'::jsonb;
  v_anteriores     JSONB;
  v_subtotal       NUMERIC(10,2);
  v_desconto       NUMERIC(10,2);
  v_total          NUMERIC(10,2);
  v_pagamentos     JSONB;
  v_sessao_id      UUID;
  v_conta          UUID;
  v_cliente        TEXT := COALESCE(NULLIF(trim(p_cliente_nome), ''), 'Balcão');
BEGIN
  IF NOT (public.pode_gerenciar_equipe() AND public.tem_permissao('pdv', true)) THEN
    RAISE EXCEPTION 'Só administrador ou gerente (com permissão de editar Vendas) pode editar uma venda.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;

  SELECT * INTO v_comanda FROM public.comandas
  WHERE id = p_comanda_id AND empresa_id = v_empresa
  FOR UPDATE;
  IF v_comanda IS NULL THEN
    RAISE EXCEPTION 'Venda não encontrada.';
  END IF;
  IF v_comanda.status <> 'fechada' THEN
    RAISE EXCEPTION 'Só é possível editar vendas fechadas.';
  END IF;

  v_subtotal := public.validar_itens_venda(v_empresa, p_itens, true);
  v_desconto := ROUND(COALESCE(p_desconto, v_comanda.desconto, 0), 2);
  IF v_desconto < 0 OR v_desconto > v_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido.';
  END IF;
  IF v_desconto > 0 AND v_desconto <> COALESCE(v_comanda.desconto, 0) AND NOT public.pode_dar_desconto() THEN
    RAISE EXCEPTION 'Seu usuário não tem permissão para dar desconto.';
  END IF;
  v_total := v_subtotal - v_desconto;

  -- Pagamentos que a venda tinha (para manter a taxa da época).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('forma', forma, 'parcelas', parcelas, 'maquininha_id', maquininha_id, 'taxa_percentual', taxa_percentual)), '[]'::jsonb)
  INTO v_anteriores FROM public.comanda_pagamentos WHERE comanda_id = p_comanda_id;
  IF v_anteriores = '[]'::jsonb AND v_comanda.forma_pagamento IS NOT NULL THEN
    v_anteriores := jsonb_build_array(jsonb_build_object('forma', v_comanda.forma_pagamento, 'parcelas', COALESCE(v_comanda.parcelas, 1),
      'maquininha_id', v_comanda.maquininha_id, 'taxa_percentual', v_comanda.taxa_percentual));
  END IF;

  -- O caixa e a conta em que a venda entrou continuam os mesmos.
  SELECT sessao_caixa_id, conta_financeira_id INTO v_sessao_id, v_conta FROM public.movimentos_caixa
  WHERE comanda_id = p_comanda_id AND categoria = 'venda' ORDER BY created_at LIMIT 1;

  -- Devolve ao estoque os produtos antigos e guarda o custo da época.
  FOR v_antigo IN
    SELECT referencia_id, quantidade, custo_unitario FROM public.itens_comanda
    WHERE comanda_id = p_comanda_id AND tipo = 'produto'
  LOOP
    UPDATE public.produtos SET estoque_atual = estoque_atual + v_antigo.quantidade
    WHERE id = v_antigo.referencia_id AND empresa_id = v_empresa;
    INSERT INTO public.movimentacoes_estoque (produto_id, tipo, quantidade, motivo, referencia_tipo, referencia_id, empresa_id)
    VALUES (v_antigo.referencia_id, 'devolucao', v_antigo.quantidade, 'Estorno por edição de venda', 'comanda', p_comanda_id, v_empresa);
    IF v_antigo.custo_unitario IS NOT NULL THEN
      v_custos_antigos := v_custos_antigos || jsonb_build_object(v_antigo.referencia_id::TEXT, v_antigo.custo_unitario);
    END IF;
  END LOOP;

  DELETE FROM public.comissoes WHERE comanda_id = p_comanda_id;
  DELETE FROM public.itens_comanda WHERE comanda_id = p_comanda_id;

  UPDATE public.comandas SET cliente_nome = v_cliente, total = v_total, desconto = v_desconto WHERE id = p_comanda_id;

  PERFORM public.inserir_itens_venda(p_comanda_id, v_empresa, p_itens, true, v_custos_antigos, 'Venda (edição)');

  v_pagamentos := COALESCE(p_pagamentos, jsonb_build_array(jsonb_build_object(
    'forma', p_forma_pagamento, 'valor', v_total, 'parcelas', COALESCE(p_parcelas, 1),
    'maquininha_id', p_maquininha_id, 'repassar', COALESCE(p_repassar_taxa, false))));
  PERFORM public.aplicar_pagamentos_venda(p_comanda_id, v_pagamentos, v_sessao_id, v_cliente, v_comanda.data, v_anteriores, v_conta);

  IF NOT COALESCE(p_sem_comissao, false) THEN
    PERFORM public.gerar_comissoes_venda(p_comanda_id);
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- Comanda aberta
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.salvar_comanda(
  p_comanda_id     UUID,
  p_cliente_nome   TEXT,
  p_cliente_id     UUID,
  p_itens          JSONB,
  p_agendamento_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa  UUID := public.minha_empresa();
  v_id       UUID;
  v_subtotal NUMERIC(10,2);
  v_cliente  TEXT := NULLIF(trim(p_cliente_nome), '');
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF p_agendamento_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agendamentos WHERE id = p_agendamento_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Agendamento não encontrado.';
  END IF;
  v_subtotal := public.validar_itens_venda(v_empresa, p_itens, false);

  IF p_comanda_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.comandas
    WHERE id = p_comanda_id AND empresa_id = v_empresa AND status = 'aberta'
    FOR UPDATE;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Comanda não encontrada ou já fechada.';
    END IF;
    DELETE FROM public.itens_comanda WHERE comanda_id = v_id;
    UPDATE public.comandas
    SET cliente_nome = COALESCE(v_cliente, 'Balcão'), cliente_id = COALESCE(p_cliente_id, cliente_id),
        total = v_subtotal, agendamento_id = COALESCE(p_agendamento_id, agendamento_id)
    WHERE id = v_id;
  ELSE
    INSERT INTO public.comandas (cliente_id, cliente_nome, status, total, agendamento_id, empresa_id, usuario_id)
    VALUES (p_cliente_id, COALESCE(v_cliente, 'Balcão'), 'aberta', v_subtotal, p_agendamento_id, v_empresa, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  -- Comanda aberta não mexe no estoque, no caixa nem nas comissões.
  PERFORM public.inserir_itens_venda(v_id, v_empresa, p_itens, false);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.excluir_comanda_aberta(p_comanda_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  DELETE FROM public.comandas
  WHERE id = p_comanda_id AND empresa_id = public.minha_empresa() AND status = 'aberta';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada ou já fechada.';
  END IF;
END;
$$;

-- Ligar a venda ao agendamento também vale para quem fechou a comanda.
CREATE OR REPLACE FUNCTION public.vincular_venda_agendamento(p_comanda_id uuid, p_agendamento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa UUID := public.minha_empresa();
BEGIN
  IF NOT public.tem_permissao('pdv', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar vendas.';
  END IF;
  IF v_empresa IS NULL THEN
    RAISE EXCEPTION 'Seu usuário ainda não está vinculado a nenhuma loja.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.comandas
    WHERE id = p_comanda_id AND empresa_id = v_empresa
      AND (usuario_id = auth.uid() OR public.pode_ver_vendas_outros())
  ) THEN
    RAISE EXCEPTION 'Venda não encontrada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agendamentos WHERE id = p_agendamento_id AND empresa_id = v_empresa) THEN
    RAISE EXCEPTION 'Agendamento não encontrado.';
  END IF;

  UPDATE public.comandas SET agendamento_id = p_agendamento_id WHERE id = p_comanda_id;
  UPDATE public.agendamentos SET status = 'concluido'
  WHERE id = p_agendamento_id AND status NOT IN ('cancelado', 'nao_compareceu');
END;
$function$;

-- ----------------------------------------------------------------
-- Caixa: o fechamento confere o dinheiro da gaveta
-- ----------------------------------------------------------------
-- Conta como dinheiro: vendas em dinheiro, entradas sem forma
-- (suprimento, recebimentos) e todas as saídas (sangria, pagamentos).
CREATE OR REPLACE FUNCTION public.saldo_dinheiro_caixa(p_sessao_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.valor_inicial
    + COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.valor ELSE -m.valor END)
                FROM public.movimentos_caixa m
                WHERE m.sessao_caixa_id = s.id
                  AND (m.tipo = 'saida' OR m.forma_pagamento IS NULL OR m.forma_pagamento = 'dinheiro')), 0)
  FROM public.sessoes_caixa s WHERE s.id = p_sessao_id;
$$;
REVOKE EXECUTE ON FUNCTION public.saldo_dinheiro_caixa(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_dinheiro_caixa(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fechar_caixa(p_sessao_id uuid, p_valor_informado numeric, p_observacao text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_esperado NUMERIC;
BEGIN
  IF NOT public.tem_permissao('caixa', true) THEN
    RAISE EXCEPTION 'Você não tem permissão para operar o caixa.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sessoes_caixa
    WHERE id = p_sessao_id AND status = 'aberto' AND empresa_id = public.minha_empresa()
  ) THEN
    RAISE EXCEPTION 'Sessão de caixa não encontrada ou já fechada.';
  END IF;

  v_esperado := public.saldo_dinheiro_caixa(p_sessao_id);

  UPDATE public.sessoes_caixa
  SET status = 'fechado',
      fechado_em = NOW(),
      saldo_esperado = v_esperado,
      valor_informado = p_valor_informado,
      diferenca = p_valor_informado - v_esperado,
      observacao_fechamento = p_observacao,
      fechado_por = auth.uid()
  WHERE id = p_sessao_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fechar_caixas_vencidos(p_empresa uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sessao   RECORD;
  v_qtd      INTEGER := 0;
BEGIN
  FOR v_sessao IN
    SELECT sc.id, cfg.horario_fechamento,
           public.limite_fechamento_caixa(sc.aberto_em, cfg.horario_fechamento) AS limite
    FROM public.sessoes_caixa sc
    JOIN public.configuracoes cfg ON cfg.empresa_id = sc.empresa_id
    WHERE sc.status = 'aberto'
      AND cfg.fechamento_automatico
      AND (p_empresa IS NULL OR sc.empresa_id = p_empresa)
      AND now() >= public.limite_fechamento_caixa(sc.aberto_em, cfg.horario_fechamento)
    FOR UPDATE OF sc SKIP LOCKED
  LOOP
    UPDATE public.sessoes_caixa
    SET status = 'fechado',
        fechado_em = v_sessao.limite,
        saldo_esperado = public.saldo_dinheiro_caixa(v_sessao.id),
        valor_informado = NULL,
        diferenca = NULL,
        observacao_fechamento = 'Fechado automaticamente no horário de fechamento da loja ('
          || to_char(v_sessao.horario_fechamento, 'HH24:MI') || ').'
    WHERE id = v_sessao.id;
    v_qtd := v_qtd + 1;
  END LOOP;
  RETURN v_qtd;
END;
$function$;

-- ----------------------------------------------------------------
-- DRE: descontos saem da receita
-- ----------------------------------------------------------------
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
  v_descontos        NUMERIC(12,2);
  v_outras_receitas  NUMERIC(12,2);
  v_cmv              NUMERIC(12,2);
  v_comissoes        NUMERIC(12,2);
  v_taxas            NUMERIC(12,2);
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

  SELECT COALESCE(SUM(desconto), 0) INTO v_descontos
  FROM public.comandas
  WHERE status = 'fechada' AND data BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

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

  -- Só a taxa que a loja absorveu (a repassada o cliente pagou no acréscimo).
  SELECT COALESCE(SUM(GREATEST(taxa_valor - acrescimo, 0)), 0) INTO v_taxas
  FROM public.comandas
  WHERE status = 'fechada' AND data BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa;

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

  v_receita_bruta := v_receita_servicos + v_receita_produtos - v_descontos + v_outras_receitas;
  v_lucro_bruto   := v_receita_bruta - (v_cmv + v_comissoes + v_taxas);

  RETURN jsonb_build_object(
    'periodo_inicio', p_inicio,
    'periodo_fim', p_fim,
    'receita_servicos', v_receita_servicos,
    'receita_produtos', v_receita_produtos,
    'descontos', v_descontos,
    'outras_receitas', v_outras_receitas,
    'receita_bruta', v_receita_bruta,
    'cmv', v_cmv,
    'comissoes', v_comissoes,
    'taxas_pagamento', v_taxas,
    'custos_total', v_cmv + v_comissoes + v_taxas,
    'lucro_bruto', v_lucro_bruto,
    'despesas_por_categoria', v_despesas,
    'despesas_total', v_total_despesas,
    'resultado_operacional', v_lucro_bruto - v_total_despesas
  );
END;
$function$;
