-- ================================================================
--  Fase 7 — Administração: auditoria, configurações, usuários, RLS
-- ================================================================

-- ── Configurações da empresa (linha única) ──────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nome_empresa          TEXT NOT NULL DEFAULT 'BarberOS',
  cnpj                  TEXT,
  telefone              TEXT,
  endereco              TEXT,
  logo_url              TEXT,
  horario_abertura      TIME NOT NULL DEFAULT '08:00',
  horario_fechamento    TIME NOT NULL DEFAULT '20:00',
  duracao_padrao_min    INTEGER NOT NULL DEFAULT 30,
  tolerancia_atraso_min INTEGER NOT NULL DEFAULT 10,
  regras_cancelamento   TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.configuracoes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- ── Auditoria ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auditoria (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acao         TEXT NOT NULL CHECK (acao IN ('insert', 'update', 'delete')),
  modulo       TEXT NOT NULL,
  registro_id  UUID,
  dados_antes  JSONB,
  dados_depois JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON public.auditoria (modulo, created_at DESC);
ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.auditoria (usuario_id, acao, modulo, registro_id, dados_antes, dados_depois)
  VALUES (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE((NEW).id, (OLD).id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria ON public.comandas;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.comandas
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.sessoes_caixa;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.sessoes_caixa
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.contas_pagar;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.contas_pagar
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.contas_receber;
CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria ON public.agendamentos;
CREATE TRIGGER trg_auditoria AFTER UPDATE OR DELETE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria();

-- ── Papel: helper pra financeiro sensivel ───────────────────
CREATE OR REPLACE FUNCTION public.pode_gerenciar_financeiro()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuario_perfis
    WHERE usuario_id = auth.uid() AND papel IN ('administrador', 'gerente') AND ativo = true
  );
$$;

-- ── RLS de verdade nas tabelas financeiras sensiveis ────────
-- (agenda, PDV, clientes, produtos etc. continuam abertas pra
-- qualquer autenticado - sao operacao do dia a dia de qualquer
-- atendente. O que muda aqui é só o que é claramente sensível:
-- contas a pagar/receber, aprovação de comissão, configurações e
-- auditoria.)
DROP POLICY IF EXISTS "auth_all" ON public.contas_pagar;
CREATE POLICY "financeiro_gerencia" ON public.contas_pagar
  FOR ALL TO authenticated USING (public.pode_gerenciar_financeiro()) WITH CHECK (public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "auth_all" ON public.contas_receber;
CREATE POLICY "financeiro_gerencia" ON public.contas_receber
  FOR ALL TO authenticated USING (public.pode_gerenciar_financeiro()) WITH CHECK (public.pode_gerenciar_financeiro());

DROP POLICY IF EXISTS "auth_all" ON public.comissoes;
CREATE POLICY "comissoes_ve_proprias_ou_financeiro" ON public.comissoes
  FOR SELECT TO authenticated
  USING (
    public.pode_gerenciar_financeiro()
    OR profissional_id = (SELECT profissional_id FROM public.usuario_perfis WHERE usuario_id = auth.uid())
  );
CREATE POLICY "comissoes_insere_qualquer_autenticado" ON public.comissoes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "comissoes_atualiza_financeiro" ON public.comissoes
  FOR UPDATE TO authenticated USING (public.pode_gerenciar_financeiro()) WITH CHECK (public.pode_gerenciar_financeiro());
CREATE POLICY "comissoes_remove_financeiro" ON public.comissoes
  FOR DELETE TO authenticated USING (public.pode_gerenciar_financeiro());

CREATE POLICY "configuracoes_leitura_geral" ON public.configuracoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "configuracoes_edicao_admin" ON public.configuracoes
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "auditoria_leitura_financeiro" ON public.auditoria
  FOR SELECT TO authenticated USING (public.pode_gerenciar_financeiro());

-- ── Gestão de usuários (RPCs pra tela de Administração) ─────
-- auth.users nao é exposto via API - essas funções expõem só o
-- necessário (id, email, criado em) combinado com o papel.
CREATE OR REPLACE FUNCTION public.listar_usuarios()
RETURNS TABLE (usuario_id UUID, email TEXT, papel TEXT, profissional_id UUID, ativo BOOLEAN, criado_em TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT au.id, au.email, up.papel, up.profissional_id, up.ativo, au.created_at
  FROM auth.users au
  JOIN public.usuario_perfis up ON up.usuario_id = au.id
  WHERE public.is_admin()
  ORDER BY au.created_at;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_papel_usuario(p_usuario_id UUID, p_papel TEXT, p_profissional_id UUID DEFAULT NULL, p_ativo BOOLEAN DEFAULT TRUE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar papéis de usuário.';
  END IF;
  UPDATE public.usuario_perfis
  SET papel = p_papel, profissional_id = p_profissional_id, ativo = p_ativo
  WHERE usuario_id = p_usuario_id;
END;
$$;

-- ── Trava de permissão dentro das RPCs financeiras ──────────
-- As RPCs abaixo são SECURITY DEFINER (rodam como dono da função,
-- ignorando RLS da tabela). Sem essa checagem explícita, um usuário
-- 'atendente' continuaria conseguindo criar/baixar contas mesmo com
-- a RLS restrita acima, só chamando a RPC em vez de mexer na tabela
-- direto. Por isso a trava tem que estar aqui dentro também.

CREATE OR REPLACE FUNCTION public.criar_conta_pagar(
  p_fornecedor_id   UUID,
  p_categoria_id    UUID,
  p_descricao       TEXT,
  p_valor_total     NUMERIC,
  p_data_vencimento DATE,
  p_total_parcelas  INTEGER DEFAULT 1,
  p_observacao      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_pagar (
        fornecedor_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_fornecedor_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$$;

CREATE OR REPLACE FUNCTION public.criar_conta_receber(
  p_cliente_id      UUID,
  p_categoria_id    UUID,
  p_descricao       TEXT,
  p_valor_total     NUMERIC,
  p_data_vencimento DATE,
  p_total_parcelas  INTEGER DEFAULT 1,
  p_observacao      TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo UUID := gen_random_uuid();
  v_parcela NUMERIC(10,2);
  v_soma NUMERIC(10,2) := 0;
  v_valor_ultima NUMERIC(10,2);
  i INTEGER;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;

  IF p_total_parcelas < 1 THEN p_total_parcelas := 1; END IF;
  v_parcela := ROUND(p_valor_total / p_total_parcelas, 2);

  FOR i IN 1..p_total_parcelas LOOP
    IF i < p_total_parcelas THEN
      v_soma := v_soma + v_parcela;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_parcela, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    ELSE
      v_valor_ultima := p_valor_total - v_soma;
      INSERT INTO public.contas_receber (
        cliente_id, categoria_id, descricao, valor, data_vencimento,
        numero_parcela, total_parcelas, grupo_parcelamento, observacao, origem
      ) VALUES (
        p_cliente_id, p_categoria_id,
        p_descricao || CASE WHEN p_total_parcelas > 1 THEN format(' (%s/%s)', i, p_total_parcelas) ELSE '' END,
        v_valor_ultima, (p_data_vencimento + ((i - 1) * INTERVAL '1 month'))::DATE,
        i, p_total_parcelas, v_grupo, p_observacao, 'manual'
      );
    END IF;
  END LOOP;

  RETURN v_grupo;
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_conta_pagar(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta RECORD;
  v_novo_pago NUMERIC(10,2);
  v_sessao_id UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a pagar.';
  END IF;

  SELECT * INTO v_conta FROM public.contas_pagar WHERE id = p_conta_id FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a pagar não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível pagar novamente.', v_conta.status; END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;

  UPDATE public.contas_pagar
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id)
  VALUES ('saida', 'conta_a_pagar', 'Pagamento — ' || v_conta.descricao, p_valor_pago, v_sessao_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.baixar_conta_receber(
  p_conta_id UUID, p_valor_pago NUMERIC, p_forma_pagamento_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta RECORD;
  v_novo_pago NUMERIC(10,2);
  v_sessao_id UUID;
BEGIN
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para gerenciar contas a receber.';
  END IF;

  SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_conta_id FOR UPDATE;
  IF v_conta IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;
  IF v_conta.status IN ('paga', 'cancelada') THEN RAISE EXCEPTION 'Essa conta já está % — não é possível receber novamente.', v_conta.status; END IF;

  v_novo_pago := v_conta.valor_pago + p_valor_pago;

  UPDATE public.contas_receber
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago >= v_conta.valor THEN 'paga' ELSE 'parcial' END,
      data_pagamento = CURRENT_DATE,
      forma_pagamento_id = COALESCE(p_forma_pagamento_id, forma_pagamento_id)
  WHERE id = p_conta_id;

  SELECT id INTO v_sessao_id FROM public.sessoes_caixa WHERE usuario_id = auth.uid() AND status = 'aberto';

  INSERT INTO public.movimentos_caixa (tipo, categoria, descricao, valor, sessao_caixa_id)
  VALUES ('entrada', 'conta_a_receber', 'Recebimento — ' || v_conta.descricao, p_valor_pago, v_sessao_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_dre(p_inicio DATE, p_fim DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
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
  IF NOT public.pode_gerenciar_financeiro() THEN
    RAISE EXCEPTION 'Você não tem permissão para ver a DRE.';
  END IF;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_servicos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'servico' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(ic.preco_unitario * ic.quantidade), 0) INTO v_receita_produtos
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(valor_pago), 0) INTO v_outras_receitas
  FROM public.contas_receber
  WHERE data_pagamento BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(ic.quantidade * COALESCE(ic.custo_unitario, 0)), 0) INTO v_cmv
  FROM public.itens_comanda ic
  JOIN public.comandas c ON c.id = ic.comanda_id
  WHERE ic.tipo = 'produto' AND c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim;

  SELECT COALESCE(SUM(co.valor_comissao), 0) INTO v_comissoes
  FROM public.comissoes co
  JOIN public.comandas c ON c.id = co.comanda_id
  WHERE c.status = 'fechada' AND c.data BETWEEN p_inicio AND p_fim AND co.status <> 'cancelada';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'valor', total) ORDER BY total DESC), '[]'::jsonb),
         COALESCE(SUM(total), 0)
  INTO v_despesas, v_total_despesas
  FROM (
    SELECT COALESCE(cf.nome, 'Sem categoria') AS cat, SUM(cp.valor_pago) AS total
    FROM public.contas_pagar cp
    LEFT JOIN public.categorias_financeiras cf ON cf.id = cp.categoria_id
    WHERE cp.data_pagamento BETWEEN p_inicio AND p_fim
    GROUP BY COALESCE(cf.nome, 'Sem categoria')
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
$$;
