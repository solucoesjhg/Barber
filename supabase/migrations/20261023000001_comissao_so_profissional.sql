-- ================================================================
-- Comissão só do profissional
--
-- A comissão passa a ser apenas do profissional que atendeu cada
-- item da venda. O usuário (ex.: o login do caixa) não tem mais
-- comissão própria sobre o total da venda.
--
-- finalizar_venda e editar_venda só geram a comissão do usuário quando
-- usuario_perfis.comissao_percentual > 0; zerando a coluna e travando
-- com CHECK, elas deixam de gerar, seja qual for a versão instalada.
-- As comissões de usuário já geradas ficam como estão.
-- ================================================================

UPDATE public.usuario_perfis
SET comissao_percentual = NULL
WHERE comissao_percentual IS NOT NULL;

ALTER TABLE public.usuario_perfis
  DROP CONSTRAINT IF EXISTS usuario_perfis_sem_comissao;
ALTER TABLE public.usuario_perfis
  ADD CONSTRAINT usuario_perfis_sem_comissao CHECK (comissao_percentual IS NULL);
