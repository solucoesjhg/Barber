-- ================================================================
-- Lembrete de agendamento pelo WhatsApp (envio manual)
-- ================================================================
-- configuracoes.mensagem_whatsapp: texto da mensagem, com {cliente},
-- {servico}, {profissional}, {data}, {hora} e {loja}. Vazio = padrão.
-- agendamentos.lembrete_enviado_em: quando alguém abriu o WhatsApp para
-- mandar o lembrete (para não mandar duas vezes).
-- Idempotente.

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS mensagem_whatsapp TEXT;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS lembrete_enviado_em TIMESTAMPTZ;
