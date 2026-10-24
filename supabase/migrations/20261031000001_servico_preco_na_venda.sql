-- ================================================================
-- Serviço com valor definido na venda
-- ================================================================
-- Alguns serviços não têm preço fixo: são agendados sem valor e o
-- valor é decidido na hora da venda. preco_na_venda = true marca
-- esses serviços (o preço cadastrado fica 0 ou como referência).
-- Idempotente.

ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS preco_na_venda BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.servicos ALTER COLUMN preco SET DEFAULT 0;

-- ----------------------------------------------------------------
-- Agendar para qualquer profissional
-- ----------------------------------------------------------------
-- Quem não tem "ver agendamentos de outros" continua vendo (e
-- alterando) só os agendamentos do profissional vinculado a ele, mas
-- pode criar agendamento para qualquer profissional da loja.
DROP POLICY IF EXISTS "agendamentos_insert" ON public.agendamentos;
CREATE POLICY "agendamentos_insert" ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.minha_empresa() AND public.tem_permissao('agenda', true));
