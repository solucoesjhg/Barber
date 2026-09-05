# Migrations

Este projeto não usa `supabase db push` — as migrations abaixo são aplicadas
manualmente pelo **SQL Editor** do painel do Supabase (Database → SQL Editor),
uma de cada vez, **na ordem dos nomes dos arquivos**.

Todas as migrations são idempotentes (`IF NOT EXISTS` / `ON CONFLICT DO NOTHING`),
então rodar uma de novo por engano não duplica dados nem quebra nada.

## Pendentes de aplicar (Fase 1 — Fundação)

1. `20260904000001_cleanup_legacy_schema.sql` — remove o schema antigo abandonado
2. `20260904000002_categorias_financeiras.sql` — cadastro de categorias
3. `20260904000003_formas_pagamento.sql` — cadastro de formas de pagamento
4. `20260904000004_fornecedores.sql` — cadastro de fornecedores
5. `20260904000005_usuario_perfis.sql` — papéis de acesso (admin/gerente/atendente/profissional)

Depois de rodar a `20260904000005`, todo usuário que já existir no seu projeto
Supabase vira `administrador` automaticamente — ninguém perde acesso.
