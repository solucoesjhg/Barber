-- ================================================================
--  "Fiado" passa a se chamar "Parcelado" na tela
-- ================================================================
-- Só os textos mudam: o valor gravado continua 'fiado' (forma de
-- pagamento, origem da conta a receber), então nada quebra.

-- ── 1) Textos gerados pelas funções (rótulo do pagamento, descrição
--    da conta a receber, mensagens de erro e o alerta do sininho) ──
DO $$
DECLARE
  v_fn  RECORD;
  v_def TEXT;
BEGIN
  FOR v_fn IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('rotulo_pagamento', 'aplicar_pagamentos_venda', 'alertas_loja')
  LOOP
    v_def := pg_get_functiondef(v_fn.oid);
    v_def := replace(v_def, '''Fiado '' ||', '''Parcelado '' ||');
    v_def := replace(v_def, 'ELSE ''Fiado'' END', 'ELSE ''Parcelado'' END');
    v_def := replace(v_def, '''Fiado — ''', '''Parcelado — ''');
    v_def := replace(v_def, 'O fiado desta venda', 'O parcelado desta venda');
    v_def := replace(v_def, 'trabalha com fiado', 'trabalha com venda parcelada');
    v_def := replace(v_def, '''Fiado precisa', '''Venda parcelada precisa');
    v_def := replace(v_def, '(inclui fiado)', '(inclui parcelado)');
    EXECUTE v_def;
  END LOOP;
END;
$$;

-- ── 2) Descrições que já foram gravadas ───────────────────────────
UPDATE public.contas_receber SET descricao = 'Parcelado — ' || substr(descricao, length('Fiado — ') + 1)
WHERE descricao LIKE 'Fiado — %';
UPDATE public.movimentos_caixa SET descricao = replace(descricao, '(Fiado', '(Parcelado')
WHERE descricao LIKE '%(Fiado%';
