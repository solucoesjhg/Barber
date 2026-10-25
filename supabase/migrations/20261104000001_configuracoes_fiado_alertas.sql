-- ================================================================
-- Configurações novas, desconto máximo, fiado e alertas
-- ================================================================
-- Configurações da loja:
-- - agendamento_confirmado: o agendamento já nasce "confirmado";
-- - estoque_zerado: venda de produto sem estoque é permitida, avisada
--   (padrão) ou bloqueada;
-- - caixa_valor_inicial: valor que já vem na abertura do caixa;
-- - cor_destaque: cor da loja nos botões principais e no menu;
-- - permitir_fiado / fiado_prazo_dias: venda fiado vira conta a receber
--   do cliente, com vencimento em N dias.
-- Desconto máximo (%) por usuário (permissões especiais). Vale no
-- banco: uma venda não grava desconto acima do limite de quem registra.
-- alertas_loja(): o que aparece no sininho.
-- Idempotente. Depende das migrações até 20261103000001.

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS agendamento_confirmado BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS estoque_zerado TEXT NOT NULL DEFAULT 'avisar';
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_estoque_zerado_check;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_estoque_zerado_check CHECK (estoque_zerado IN ('permitir', 'avisar', 'bloquear'));
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS caixa_valor_inicial NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS cor_destaque TEXT;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS permitir_fiado BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS fiado_prazo_dias INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.configuracoes DROP CONSTRAINT IF EXISTS configuracoes_fiado_prazo_check;
ALTER TABLE public.configuracoes ADD CONSTRAINT configuracoes_fiado_prazo_check CHECK (fiado_prazo_dias BETWEEN 0 AND 365);

-- ----------------------------------------------------------------
-- Agendamento já confirmado
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agendamento_status_inicial()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pendente' AND EXISTS (
    SELECT 1 FROM public.configuracoes WHERE empresa_id = NEW.empresa_id AND agendamento_confirmado
  ) THEN
    NEW.status := 'confirmado';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_agendamento_status_inicial ON public.agendamentos;
CREATE TRIGGER trg_agendamento_status_inicial
  BEFORE INSERT ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.agendamento_status_inicial();

-- ----------------------------------------------------------------
-- Desconto máximo por usuário
-- ----------------------------------------------------------------
ALTER TABLE public.usuario_perfis ADD COLUMN IF NOT EXISTS desconto_maximo NUMERIC(5,2);

-- % máximo de desconto do usuário logado (NULL = sem limite).
CREATE OR REPLACE FUNCTION public.meu_desconto_maximo()
RETURNS NUMERIC
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT CASE WHEN papel = 'administrador' THEN NULL ELSE desconto_maximo END
  FROM public.usuario_perfis WHERE usuario_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.validar_desconto_maximo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limite NUMERIC := public.meu_desconto_maximo();
  v_pct    NUMERIC;
BEGIN
  IF COALESCE(NEW.desconto, 0) <= 0 OR v_limite IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.desconto IS NOT DISTINCT FROM OLD.desconto THEN
    RETURN NEW;
  END IF;
  v_pct := NEW.desconto / NULLIF(NEW.total + NEW.desconto, 0) * 100;
  IF v_pct > v_limite + 0.001 THEN
    RAISE EXCEPTION 'Desconto de % passa o seu limite de %.',
      replace(to_char(v_pct, 'FM990.0'), '.', ',') || '%', replace(to_char(v_limite, 'FM990.0'), '.', ',') || '%';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validar_desconto_maximo ON public.comandas;
CREATE TRIGGER trg_validar_desconto_maximo
  BEFORE INSERT OR UPDATE OF desconto, total ON public.comandas
  FOR EACH ROW EXECUTE FUNCTION public.validar_desconto_maximo();


-- ----------------------------------------------------------------
-- Permissões: devolve, salva e restaura o desconto máximo
-- ----------------------------------------------------------------
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
    'desconto_maximo', CASE WHEN up.papel = 'administrador' THEN NULL ELSE up.desconto_maximo END,
    'especiais_personalizados', up.ver_vendas_outros IS NOT NULL OR up.ver_custo_produtos IS NOT NULL
                                OR up.ver_agendamentos_outros IS NOT NULL OR up.dar_desconto IS NOT NULL
                                OR up.desconto_maximo IS NOT NULL,
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

DROP FUNCTION IF EXISTS public.salvar_permissoes_usuario(UUID, JSONB, BOOLEAN, BOOLEAN, TEXT[], TEXT[], BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION public.salvar_permissoes_usuario(
  p_usuario_id              UUID,
  p_telas                   JSONB,
  p_ver_vendas_outros       BOOLEAN,
  p_ver_custo_produtos      BOOLEAN,
  p_dashboard_cards         TEXT[] DEFAULT NULL,
  p_relatorios              TEXT[] DEFAULT NULL,
  p_ver_agendamentos_outros BOOLEAN DEFAULT NULL,
  p_dar_desconto            BOOLEAN DEFAULT NULL,
  p_desconto_maximo         NUMERIC DEFAULT NULL
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
      desconto_maximo = CASE WHEN p_desconto_maximo IS NULL THEN NULL ELSE LEAST(GREATEST(p_desconto_maximo, 0), 100) END,
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
  SET ver_vendas_outros = NULL, ver_custo_produtos = NULL, ver_agendamentos_outros = NULL, dar_desconto = NULL, desconto_maximo = NULL,
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
    NEW.desconto_maximo         := NULL;
    NEW.dashboard_cards         := NULL;
    NEW.relatorios              := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- Estoque zerado: bloquear (quando a loja escolheu) na gravação
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inserir_itens_venda(p_comanda_id UUID, p_empresa UUID, p_itens JSONB, p_baixar_estoque BOOLEAN, p_custos JSONB DEFAULT '{}'::jsonb, p_motivo TEXT DEFAULT 'Venda PDV')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item    JSONB;
  v_qtd     INTEGER;
  v_produto UUID;
  v_custo   NUMERIC(10,2);
  v_regra   TEXT;
  v_estoque NUMERIC;
BEGIN
  SELECT COALESCE(estoque_zerado, 'avisar') INTO v_regra FROM public.configuracoes WHERE empresa_id = p_empresa;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
  LOOP
    v_qtd := (v_item->>'quantidade')::INTEGER;
    v_produto := CASE WHEN v_item->>'tipo' = 'produto' THEN (v_item->>'referencia_id')::UUID END;
    v_custo := NULL;
    -- Loja que bloqueia venda sem estoque: o produto precisa ter a quantidade.
    IF v_produto IS NOT NULL AND p_baixar_estoque AND v_regra = 'bloquear' THEN
      SELECT estoque_atual INTO v_estoque FROM public.produtos WHERE id = v_produto AND empresa_id = p_empresa;
      IF COALESCE(v_estoque, 0) < v_qtd THEN
        RAISE EXCEPTION 'Sem estoque de "%" (tem %, a venda pede %).', v_item->>'nome', COALESCE(v_estoque, 0), v_qtd;
      END IF;
    END IF;
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

-- ----------------------------------------------------------------
-- Fiado
-- ----------------------------------------------------------------
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS comanda_id UUID REFERENCES public.comandas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contas_receber_comanda ON public.contas_receber (comanda_id);

ALTER TABLE public.comandas DROP CONSTRAINT IF EXISTS comandas_forma_pagamento_check;
ALTER TABLE public.comandas ADD CONSTRAINT comandas_forma_pagamento_check CHECK (forma_pagamento IN ('pix', 'credito', 'debito', 'dinheiro', 'fiado'));
ALTER TABLE public.comanda_pagamentos DROP CONSTRAINT IF EXISTS comanda_pagamentos_forma_check;
ALTER TABLE public.comanda_pagamentos ADD CONSTRAINT comanda_pagamentos_forma_check CHECK (forma IN ('pix', 'credito', 'debito', 'dinheiro', 'fiado'));

CREATE OR REPLACE FUNCTION public.rotulo_pagamento(p_forma text, p_parcelas integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_forma
    WHEN 'credito' THEN 'Crédito ' || COALESCE(p_parcelas, 1) || 'x'
    WHEN 'debito' THEN 'Débito'
    WHEN 'pix' THEN 'Pix'
    WHEN 'dinheiro' THEN 'Dinheiro'
    WHEN 'fiado' THEN 'Fiado'
    ELSE COALESCE(p_forma, '')
  END;
$function$;


-- ----------------------------------------------------------------
-- Pagamentos: fiado vira conta a receber do cliente
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
  v_cfg        RECORD;
BEGIN
  SELECT id, empresa_id, total, cliente_id, cliente_nome INTO v_c FROM public.comandas WHERE id = p_comanda_id;
  SELECT COALESCE(permitir_fiado, true) AS permitir, COALESCE(fiado_prazo_dias, 30) AS prazo
  INTO v_cfg FROM public.configuracoes WHERE empresa_id = v_c.empresa_id;
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
    RAISE EXCEPTION 'Escolha a forma de pagamento.';
  END IF;
  v_qtd := jsonb_array_length(p_pagamentos);

  -- Fiado já recebido (todo ou em parte) não pode ser refeito.
  IF EXISTS (SELECT 1 FROM public.contas_receber WHERE comanda_id = p_comanda_id AND (valor_pago > 0 OR status = 'paga')) THEN
    RAISE EXCEPTION 'O fiado desta venda já foi recebido (todo ou em parte). Estorne o recebimento em Contas a Receber antes.';
  END IF;
  DELETE FROM public.contas_receber WHERE comanda_id = p_comanda_id;
  DELETE FROM public.comanda_pagamentos WHERE comanda_id = p_comanda_id;
  DELETE FROM public.movimentos_caixa WHERE comanda_id = p_comanda_id AND categoria IN ('venda', 'taxa_cartao');

  FOR v_p IN SELECT * FROM jsonb_array_elements(p_pagamentos)
  LOOP
    v_forma := v_p->>'forma';
    IF v_forma IS NULL OR v_forma NOT IN ('pix', 'credito', 'debito', 'dinheiro', 'fiado') THEN
      RAISE EXCEPTION 'Forma de pagamento inválida.';
    END IF;
    IF v_forma = 'fiado' THEN
      IF NOT COALESCE(v_cfg.permitir, true) THEN
        RAISE EXCEPTION 'A loja não trabalha com fiado (Configurações).';
      END IF;
      IF v_c.cliente_id IS NULL THEN
        RAISE EXCEPTION 'Fiado precisa de um cliente cadastrado: escolha o cliente da venda.';
      END IF;
    END IF;
    v_valor := ROUND(COALESCE((v_p->>'valor')::NUMERIC, 0), 2);
    IF v_valor < 0 OR (v_valor = 0 AND v_c.total > 0) THEN
      RAISE EXCEPTION 'Informe o valor de cada forma de pagamento.';
    END IF;
    v_parc := CASE WHEN v_forma = 'fiado' THEN 1
                   ELSE public.validar_parcelas(v_c.empresa_id, v_forma, COALESCE((v_p->>'parcelas')::INTEGER, 1)) END;

    SELECT a INTO v_ant FROM jsonb_array_elements(COALESCE(p_anteriores, '[]'::jsonb)) a
    WHERE a->>'forma' = v_forma AND COALESCE((a->>'parcelas')::INTEGER, 1) = v_parc
      AND NULLIF(a->>'maquininha_id', '') IS NOT DISTINCT FROM NULLIF(v_p->>'maquininha_id', '')
    LIMIT 1;
    IF v_ant IS NOT NULL THEN
      v_maq := NULLIF(v_ant->>'maquininha_id', '')::UUID;
      v_pct := COALESCE((v_ant->>'taxa_percentual')::NUMERIC, 0);
    ELSIF v_forma = 'fiado' THEN
      v_maq := NULL;
      v_pct := 0;
    ELSE
      v_maq := public.validar_maquininha(v_c.empresa_id, v_forma, NULLIF(v_p->>'maquininha_id', '')::UUID);
      v_pct := CASE WHEN v_maq IS NULL THEN 0 ELSE public.taxa_maquininha(v_maq, v_forma, v_parc) END;
    END IF;

    SELECT * INTO v_cobrado, v_acr, v_taxa
    FROM public.calcular_cobranca(v_valor, v_pct, COALESCE((v_p->>'repassar')::BOOLEAN, false));

    INSERT INTO public.comanda_pagamentos (comanda_id, empresa_id, forma, valor, parcelas, maquininha_id, taxa_percentual, taxa_valor, acrescimo, cobrado)
    VALUES (p_comanda_id, v_c.empresa_id, v_forma, v_valor, v_parc, v_maq, v_pct, v_taxa, v_acr, v_cobrado);

    v_rotulo := public.rotulo_pagamento(v_forma, v_parc);
    IF v_forma = 'fiado' THEN
      -- Fiado não entra no caixa: vira conta a receber do cliente.
      IF v_cobrado > 0 THEN
        INSERT INTO public.contas_receber (cliente_id, descricao, valor, data_emissao, data_vencimento, origem, comanda_id, empresa_id)
        VALUES (v_c.cliente_id, 'Fiado — ' || COALESCE(NULLIF(trim(p_cliente), ''), 'Cliente'), v_cobrado, p_data,
                p_data + v_cfg.prazo, 'fiado', p_comanda_id, v_c.empresa_id);
      END IF;
    ELSIF v_cobrado > 0 THEN
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

-- ----------------------------------------------------------------
-- DRE: recebimento de fiado não conta de novo como receita
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
  WHERE data_pagamento BETWEEN p_inicio AND p_fim AND empresa_id = v_empresa
    AND comanda_id IS NULL; -- fiado de venda já entrou como receita da venda

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

-- ----------------------------------------------------------------
-- Alertas do sininho
-- ----------------------------------------------------------------
-- Cada alerta: tipo, nivel (aviso|urgente), titulo, detalhe, link.
-- Só entram os que o usuário pode ver.
CREATE OR REPLACE FUNCTION public.alertas_loja()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa UUID := public.minha_empresa();
  v_hoje    DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_lista   JSONB := '[]'::jsonb;
  v_n       INTEGER;
  v_valor   NUMERIC;
  v_txt     TEXT;
  v_cfg     RECORD;
  v_sessao  RECORD;
  v_mens    RECORD;
BEGIN
  IF v_empresa IS NULL THEN
    RETURN v_lista;
  END IF;
  SELECT * INTO v_cfg FROM public.configuracoes WHERE empresa_id = v_empresa;

  -- Estoque baixo (loja que controla estoque mínimo) ou zerado.
  IF public.tem_permissao('produtos') THEN
    SELECT count(*), string_agg(nome, ', ' ORDER BY nome) INTO v_n, v_txt FROM (
      SELECT nome FROM public.produtos
      WHERE empresa_id = v_empresa AND ativo
        AND (estoque_atual <= 0 OR (COALESCE(v_cfg.controla_estoque_minimo, true) AND estoque_atual <= estoque_minimo AND estoque_minimo > 0))
      ORDER BY nome LIMIT 50
    ) p;
    IF v_n > 0 THEN
      v_lista := v_lista || jsonb_build_object('tipo', 'estoque', 'nivel', 'aviso',
        'titulo', v_n || CASE WHEN v_n = 1 THEN ' produto com estoque baixo' ELSE ' produtos com estoque baixo' END,
        'detalhe', left(v_txt, 160), 'link', '/produtos');
    END IF;
  END IF;

  -- Contas a pagar vencidas e vencendo hoje.
  IF public.tem_permissao('contas_pagar') THEN
    SELECT count(*), COALESCE(sum(valor - valor_pago), 0) INTO v_n, v_valor FROM public.contas_pagar
    WHERE empresa_id = v_empresa AND status IN ('aberta', 'parcial') AND data_vencimento < v_hoje;
    IF v_n > 0 THEN
      v_lista := v_lista || jsonb_build_object('tipo', 'pagar_atrasada', 'nivel', 'urgente',
        'titulo', v_n || CASE WHEN v_n = 1 THEN ' conta a pagar vencida' ELSE ' contas a pagar vencidas' END,
        'detalhe', 'Total de R$ ' || replace(to_char(v_valor, 'FM999999990.00'), '.', ','), 'link', '/contas-pagar');
    END IF;
    SELECT count(*), COALESCE(sum(valor - valor_pago), 0) INTO v_n, v_valor FROM public.contas_pagar
    WHERE empresa_id = v_empresa AND status IN ('aberta', 'parcial') AND data_vencimento = v_hoje;
    IF v_n > 0 THEN
      v_lista := v_lista || jsonb_build_object('tipo', 'pagar_hoje', 'nivel', 'aviso',
        'titulo', v_n || CASE WHEN v_n = 1 THEN ' conta vence hoje' ELSE ' contas vencem hoje' END,
        'detalhe', 'Total de R$ ' || replace(to_char(v_valor, 'FM999999990.00'), '.', ','), 'link', '/contas-pagar');
    END IF;
  END IF;

  -- A receber vencido (inclui fiado).
  IF public.tem_permissao('contas_receber') THEN
    SELECT count(*), COALESCE(sum(valor - valor_pago), 0)
    INTO v_n, v_valor FROM public.contas_receber
    WHERE empresa_id = v_empresa AND status IN ('aberta', 'parcial') AND data_vencimento < v_hoje;
    IF v_n > 0 THEN
      v_lista := v_lista || jsonb_build_object('tipo', 'receber_atrasada', 'nivel', 'urgente',
        'titulo', v_n || CASE WHEN v_n = 1 THEN ' conta a receber vencida' ELSE ' contas a receber vencidas' END,
        'detalhe', 'Total de R$ ' || replace(to_char(v_valor, 'FM999999990.00'), '.', ',') || ' (inclui fiado)', 'link', '/contas-receber');
    END IF;
  END IF;

  -- Caixa aberto há mais de 12 horas.
  IF public.tem_permissao('caixa') THEN
    SELECT aberto_em INTO v_sessao FROM public.sessoes_caixa WHERE empresa_id = v_empresa AND status = 'aberto';
    IF v_sessao IS NOT NULL AND v_sessao.aberto_em < now() - interval '12 hours' THEN
      v_lista := v_lista || jsonb_build_object('tipo', 'caixa', 'nivel', 'aviso',
        'titulo', 'Caixa aberto há muito tempo',
        'detalhe', 'Aberto desde ' || to_char(v_sessao.aberto_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '. Confira e feche.', 'link', '/caixa');
    END IF;
  END IF;

  -- Agendamentos pendentes de hoje (sem confirmar).
  IF public.tem_permissao('agenda') THEN
    SELECT count(*) INTO v_n FROM public.agendamentos
    WHERE empresa_id = v_empresa AND status = 'pendente' AND public.agendamento_visivel(profissional_id)
      AND (data_hora AT TIME ZONE 'America/Sao_Paulo')::DATE = v_hoje;
    IF v_n > 0 THEN
      v_lista := v_lista || jsonb_build_object('tipo', 'agenda', 'nivel', 'aviso',
        'titulo', v_n || CASE WHEN v_n = 1 THEN ' agendamento de hoje sem confirmar' ELSE ' agendamentos de hoje sem confirmar' END,
        'detalhe', 'Confirme com os clientes.', 'link', '/agenda');
    END IF;
  END IF;

  -- Mensalidade do sistema (só para o administrador da loja).
  IF public.meu_papel() = 'administrador' THEN
    FOR v_mens IN
      SELECT valor, vencimento FROM public.mensalidades
      WHERE empresa_id = v_empresa AND status = 'pendente' AND vencimento <= v_hoje + 5
      ORDER BY vencimento LIMIT 3
    LOOP
      v_lista := v_lista || jsonb_build_object('tipo', 'mensalidade',
        'nivel', CASE WHEN v_mens.vencimento < v_hoje THEN 'urgente' ELSE 'aviso' END,
        'titulo', CASE WHEN v_mens.vencimento < v_hoje THEN 'Mensalidade do sistema vencida'
                       WHEN v_mens.vencimento = v_hoje THEN 'Mensalidade do sistema vence hoje'
                       ELSE 'Mensalidade do sistema vence em ' || to_char(v_mens.vencimento, 'DD/MM') END,
        'detalhe', 'R$ ' || replace(to_char(v_mens.valor, 'FM999999990.00'), '.', ',') || ' · fale com o suporte para pagar.', 'link', NULL);
    END LOOP;
  END IF;

  RETURN v_lista;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.alertas_loja() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.alertas_loja() TO authenticated;
