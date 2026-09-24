-- ================================================================
--  Timezone do banco para America/Sao_Paulo
-- ================================================================
-- Campos DATE com DEFAULT CURRENT_DATE (movimentos_caixa.data,
-- comandas.data etc.) são preenchidos no timezone da sessão do
-- banco, que por padrão no Supabase é UTC. Como o Brasil está 3h
-- atrás do UTC, qualquer registro feito entre ~21h e 23h59 (horário
-- de Brasília) cai depois da meia-noite em UTC — o banco entende que
-- já é o dia seguinte e grava a data errada (um dia à frente do dia
-- real da loja). Combinado com o bug separado de exibição (já
-- corrigido em src/lib/utils.ts — formatDate interpretava
-- "YYYY-MM-DD" como meia-noite UTC e "voltava" um dia ao exibir no
-- fuso local), um lançamento de hoje podia aparecer como se fosse
-- de ontem. Portado do Noir ERP, onde esse exato bug apareceu numa
-- nota de entrada de mercadoria lançada à noite.

ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';

-- Confira depois de rodar (numa aba nova do SQL Editor, pra pegar
-- uma conexão nova com o timezone já aplicado):
--   SHOW timezone;
--   SELECT CURRENT_DATE, NOW();
