# Migrations

Este projeto não usa `supabase db push` — as migrations abaixo são aplicadas
manualmente pelo **SQL Editor** do painel do Supabase (Database → SQL Editor),
uma de cada vez, **na ordem dos nomes dos arquivos**.

Todas as migrations são idempotentes (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`),
então rodar uma de novo por engano não duplica dados nem quebra nada.

## Ordem de aplicação

1. `20260904000001_cleanup_legacy_schema.sql` — remove o schema antigo abandonado
2. `20260904000002_categorias_financeiras.sql` — cadastro de categorias
3. `20260904000003_formas_pagamento.sql` — cadastro de formas de pagamento
4. `20260904000004_fornecedores.sql` — cadastro de fornecedores
5. `20260904000005_usuario_perfis.sql` — papéis de acesso (admin/gerente/atendente/profissional)
6. `20260905000001_cadastros_fase2.sql`
7. `20260905000002_agenda_conflitos.sql`
8. `20260905000003_venda_estoque_comissao.sql`
9. `20260905000004_caixa.sql`
10. `20260905000005_contas_pagar_receber.sql`
11. `20260905000006_dre_e_comissoes.sql`
12. `20260905000007_fix_trigger_novo_usuario.sql`
13. `20260905000008_comissao_produto_e_lancamento_caixa.sql`
14. `20260905000009a_configuracoes_auditoria.sql`
15. `20260905000009b_rls_financeiro.sql`
16. `20260905000009c_gestao_usuarios.sql`
17. `20260905000009d_rpcs_financeiro_guardadas.sql`

Depois de rodar a `20260904000005`, todo usuário que já existir no seu projeto
Supabase vira `administrador` automaticamente — ninguém perde acesso.

A Fase 7 (itens 14-17) foi dividida em 4 arquivos menores em vez de um só,
porque a versão original deu timeout de conexão no SQL Editor. Cada um desses
4 é seguro de rodar de novo caso dê timeout no meio.
