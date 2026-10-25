-- ================================================================
--  Parcelado: datas e valores de cada parcela escolhidos na venda
-- ================================================================
-- Cada pagamento "fiado" (Parcelado) pode trazer
--   "vencimentos": [{"data": "2026-11-25", "valor": 50.00}, ...]
-- com uma linha por parcela. Sem ele, continua como antes (parcelas
-- iguais, uma por mês, a 1ª no prazo da configuração).

CREATE OR REPLACE FUNCTION public.aplicar_pagamentos_venda(p_comanda_id uuid, p_pagamentos jsonb, p_sessao_id uuid, p_cliente text, p_data date, p_anteriores jsonb DEFAULT '[]'::jsonb, p_conta uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_grupo      UUID;
  v_parcela    NUMERIC(10,2);
  v_i          INTEGER;
  v_venc       JSONB;
  v_e          JSONB;
  v_soma_venc  NUMERIC(10,2);
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
    RAISE EXCEPTION 'O parcelado desta venda já foi recebido (todo ou em parte). Estorne o recebimento em Contas a Receber antes.';
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
        RAISE EXCEPTION 'A loja não trabalha com venda parcelada (Configurações).';
      END IF;
      IF v_c.cliente_id IS NULL THEN
        RAISE EXCEPTION 'Venda parcelada precisa de um cliente cadastrado: escolha o cliente da venda.';
      END IF;
    END IF;
    v_valor := ROUND(COALESCE((v_p->>'valor')::NUMERIC, 0), 2);
    IF v_valor < 0 OR (v_valor = 0 AND v_c.total > 0) THEN
      RAISE EXCEPTION 'Informe o valor de cada forma de pagamento.';
    END IF;
    v_parc := CASE WHEN v_forma = 'fiado' THEN LEAST(GREATEST(COALESCE((v_p->>'parcelas')::INTEGER, 1), 1), 24)
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

    v_rotulo := CASE WHEN v_forma = 'fiado' AND v_parc > 1 THEN 'Parcelado ' || v_parc || 'x' ELSE public.rotulo_pagamento(v_forma, v_parc) END;
    IF v_forma = 'fiado' THEN
      -- Fiado não entra no caixa: vira conta a receber do cliente.
      -- Parcelado: uma conta por mês (a 1ª no prazo do fiado); o
      -- arredondamento fica na última parcela. Com "vencimentos", usa as
      -- datas e os valores escolhidos na venda.
      v_venc := v_p->'vencimentos';
      IF v_cobrado > 0 AND v_venc IS NOT NULL AND jsonb_typeof(v_venc) = 'array' AND jsonb_array_length(v_venc) > 0 THEN
        -- Datas e valores escolhidos na venda.
        IF jsonb_array_length(v_venc) <> v_parc THEN
          RAISE EXCEPTION 'A quantidade de parcelas não bate com as datas informadas.';
        END IF;
        SELECT COALESCE(SUM(ROUND((e->>'valor')::NUMERIC, 2)), 0) INTO v_soma_venc FROM jsonb_array_elements(v_venc) e;
        IF abs(v_soma_venc - v_cobrado) > 0.009 THEN
          RAISE EXCEPTION 'As parcelas somam R$ % e o parcelado é de R$ %. Ajuste os valores.',
            replace(to_char(v_soma_venc, 'FM999999990.00'), '.', ','), replace(to_char(v_cobrado, 'FM999999990.00'), '.', ',');
        END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_venc) e
                   WHERE COALESCE((e->>'valor')::NUMERIC, 0) <= 0 OR NULLIF(e->>'data', '') IS NULL OR (e->>'data')::DATE < p_data) THEN
          RAISE EXCEPTION 'Cada parcela precisa de valor e de uma data a partir do dia da venda.';
        END IF;
        v_grupo := CASE WHEN v_parc > 1 THEN gen_random_uuid() END;
        FOR v_i IN 1..v_parc LOOP
          v_e := v_venc->(v_i - 1);
          INSERT INTO public.contas_receber (cliente_id, descricao, valor, data_emissao, data_vencimento, origem, comanda_id, empresa_id,
                                             numero_parcela, total_parcelas, grupo_parcelamento)
          VALUES (v_c.cliente_id,
                  'Parcelado — ' || COALESCE(NULLIF(trim(p_cliente), ''), 'Cliente') || CASE WHEN v_parc > 1 THEN ' (' || v_i || '/' || v_parc || ')' ELSE '' END,
                  ROUND((v_e->>'valor')::NUMERIC, 2), p_data, (v_e->>'data')::DATE, 'fiado', p_comanda_id, v_c.empresa_id,
                  v_i, v_parc, v_grupo);
        END LOOP;
      ELSIF v_cobrado > 0 THEN
        v_grupo := CASE WHEN v_parc > 1 THEN gen_random_uuid() END;
        v_parcela := ROUND(v_cobrado / v_parc, 2);
        FOR v_i IN 1..v_parc LOOP
          INSERT INTO public.contas_receber (cliente_id, descricao, valor, data_emissao, data_vencimento, origem, comanda_id, empresa_id,
                                             numero_parcela, total_parcelas, grupo_parcelamento)
          VALUES (v_c.cliente_id,
                  'Parcelado — ' || COALESCE(NULLIF(trim(p_cliente), ''), 'Cliente') || CASE WHEN v_parc > 1 THEN ' (' || v_i || '/' || v_parc || ')' ELSE '' END,
                  CASE WHEN v_i = v_parc THEN v_cobrado - v_parcela * (v_parc - 1) ELSE v_parcela END,
                  p_data, (p_data + v_cfg.prazo + make_interval(months => v_i - 1))::DATE, 'fiado', p_comanda_id, v_c.empresa_id,
                  v_i, v_parc, v_grupo);
        END LOOP;
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
$function$
;
