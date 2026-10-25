import type { Agendamento } from '../types'

export const MENSAGEM_PADRAO =
  'Olá, {cliente}! Passando para confirmar seu horário na {loja}: {servico} com {profissional}, {data} às {hora}. Pode confirmar? Responda SIM ou nos avise se precisar remarcar.'

/** Só os dígitos, com o 55 do Brasil quando o número vem sem DDI. */
export function telefoneWhatsApp(telefone?: string | null): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.length <= 11 ? `55${d}` : d
}

/** Mensagem do lembrete com os dados do agendamento. */
export function mensagemLembrete(ag: Agendamento, loja: string | null, modelo?: string | null): string {
  const quando = new Date(ag.data_hora)
  const hoje = new Date()
  const amanha = new Date(); amanha.setDate(hoje.getDate() + 1)
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const data = mesmoDia(quando, hoje) ? 'hoje'
    : mesmoDia(quando, amanha) ? 'amanhã'
      : quando.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  const valores: Record<string, string> = {
    cliente: (ag.cliente?.nome ?? '').split(' ')[0] || 'tudo bem',
    servico: ag.servico?.nome ?? 'seu atendimento',
    profissional: ag.profissional?.nome?.split(' ')[0] ?? 'a equipe',
    data,
    hora: quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    loja: loja ?? 'barbearia',
  }
  return (modelo?.trim() || MENSAGEM_PADRAO).replace(/\{(\w+)\}/g, (m, chave: string) => valores[chave] ?? m)
}

/** Link que abre o WhatsApp (app ou Web) com a mensagem pronta. */
export function linkWhatsApp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
}
