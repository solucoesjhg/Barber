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

## Fase 8 — Multi-tenant (⚠️ apaga os dados operacionais atuais)

18. `20260909000001_multitenant_schema.sql` — cria `empresas`, **zera clientes/
    produtos/agendamentos/vendas/financeiro/etc.** (combinado com a usuária),
    adiciona `empresa_id` em toda tabela operacional, recria `configuracoes`
    por loja, e promove `adm@dev.com` a `super_admin`
19. `20260909000002_multitenant_rls.sql` — RLS: cada loja só enxerga os
    próprios dados; super_admin só gerencia empresas/usuários, não vê dado
    operacional de nenhuma loja
20. `20260909000003_multitenant_rpcs_caixa.sql` — abrir/fechar caixa, lançar
    movimento e finalizar venda, todos escopados por loja
21. `20260909000004_multitenant_rpcs_financeiro.sql` — contas a pagar/receber
    e DRE escopados por loja
22. `20260909000005_multitenant_rpcs_usuarios.sql` — listar usuários e
    atualizar papel/loja de um usuário (só super_admin vincula/troca loja)
23. `20260909000006_seed_nova_empresa.sql` — toda loja nova nasce com
    configurações, categorias financeiras e formas de pagamento padrão

Depois de rodar tudo isso: `adm@dev.com` vira super administradora da
plataforma (sem loja própria) e usa a tela **Empresas** pra cadastrar as
lojas clientes, e **Usuários** pra vincular o primeiro login de cada uma.

## Permissões por tela (20261019000001)

`20261019000001_permissoes_por_tela.sql` — permissões de **ver / editar por
tela** para cada usuário, mais duas permissões especiais por usuário: **ver
vendas de outros usuários** e **ver custo dos produtos**. Configuradas na
tela **Permissões** (menu Cadastros), por administrador e gerente.

- Sem personalização, cada usuário fica com o padrão do papel (está
  descrito no topo da migração). Administrador tem sempre acesso total.
- As regras valem no banco (RLS e RPCs), não só na tela.
- Usuário desativado deixa de enxergar os dados da loja.
- ⚠️ O custo é protegido por **privilégio de coluna** em `produtos.preco_custo`
  e `itens_comanda.custo_unitario`. Toda migração futura que adicionar
  coluna nessas duas tabelas precisa incluir
  `GRANT SELECT (nova_coluna) ON public.<tabela> TO authenticated;`,
  senão a coluna fica ilegível pela API. Pelo mesmo motivo, o app nunca
  usa `select('*')` nessas tabelas (veja `src/lib/produtos.ts`).
- Pode rodar de novo sem problema (idempotente).

## Administrador cadastra os usuários (20261020000001)

`20261020000001_admin_cadastra_usuarios.sql` — depende da migração de
permissões por tela (`20261019000001`).

- O super admin cria a loja já com o login do administrador (tela
  Empresas → Nova Loja, ou na tela da loja → Cadastrar Administrador).
- O administrador cadastra a equipe em **Usuários → Novo Usuário** (e-mail,
  senha inicial, nome, papel, comissão) e, no cartão de cada usuário,
  edita os dados, troca a senha e define as permissões de tela e os
  cards do Dashboard.
- Administrador cadastra gerente, atendente e profissional; gerente
  cadastra atendente e profissional. Ninguém altera a si mesmo.
- O login é criado direto no Supabase Auth, já confirmado (usa
  `extensions.crypt`, do pgcrypto, que todo projeto Supabase já tem).
- `salvar_permissoes_usuario` ganhou o parâmetro `p_dashboard_cards`
  (a versão de 4 parâmetros é removida).
- Pode rodar de novo sem problema (idempotente).

## Editar venda, venda pela agenda e relatórios por usuário (20261022000002)

`20261022000002_editar_venda_agenda_relatorios.sql` — rodar depois de
`20261022000001_vendas_por_profissional.sql`.

- **Editar venda** (`editar_venda`): administrador e gerente (com Vendas =
  editar) corrigem uma venda já feita — itens, quantidades, profissional,
  cliente, forma de pagamento — e podem tirar a comissão dela. O estoque
  é devolvido e baixado de novo (com registro em movimentações), as
  comissões são recalculadas e o lançamento de caixa da venda é
  atualizado (não cria outro).
- **Venda pela agenda** (`vincular_venda_agendamento`): o "Gerar venda" do
  atendimento liga a venda ao agendamento e marca o agendamento como
  concluído.
- **Relatórios por usuário**: em Usuários → Permissões → Relatórios, o
  administrador/gerente escolhe quais relatórios cada usuário vê
  (`usuario_perfis.relatorios`; vazio = todos). `salvar_permissoes_usuario`
  ganhou `p_relatorios` (a versão de 5 parâmetros é removida).
- **Comissões** não têm mais aprovar nem marcar como paga: tirar a
  comissão de uma venda grava `status = 'cancelada'` (não precisa de
  mudança no banco para isso).
- Pode rodar de novo sem problema (idempotente).
