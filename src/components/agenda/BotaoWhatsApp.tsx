import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../hooks/useLoja'
import { linkWhatsApp, mensagemLembrete, telefoneWhatsApp } from '../../lib/whatsapp'
import type { Agendamento } from '../../types'

/**
 * Abre o WhatsApp com o lembrete do agendamento pronto para o cliente e
 * marca o agendamento como "lembrete enviado". Sem telefone, fica
 * desabilitado.
 */
export default function BotaoWhatsApp({ agendamento: ag, onEnviado, compacto = false }: {
  agendamento: Agendamento
  onEnviado?: (quando: string) => void
  /** Só o ícone (lista da agenda). */
  compacto?: boolean
}) {
  const { nome, mensagemWhatsapp, usarWhatsapp } = useLoja()
  const [marcando, setMarcando] = useState(false)
  const fone = telefoneWhatsApp(ag.cliente?.telefone)
  const enviado = !!ag.lembrete_enviado_em
  const titulo = !fone
    ? 'Cliente sem telefone cadastrado'
    : enviado
      ? `Lembrete já enviado em ${new Date(ag.lembrete_enviado_em!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}. Clique para mandar de novo.`
      : 'Mandar lembrete pelo WhatsApp'

  async function enviar(e: React.MouseEvent) {
    e.stopPropagation()
    if (!fone || marcando) return
    window.open(linkWhatsApp(fone, mensagemLembrete(ag, nome, mensagemWhatsapp)), '_blank', 'noopener')
    setMarcando(true)
    const quando = new Date().toISOString()
    const { error } = await supabase.from('agendamentos').update({ lembrete_enviado_em: quando }).eq('id', ag.id)
    setMarcando(false)
    if (!error) onEnviado?.(quando)
  }

  if (!usarWhatsapp) return null
  if (compacto) {
    return (
      <button
        type="button" className={`btn btn-icon botao-whatsapp${enviado ? ' enviado' : ''}`}
        onClick={enviar} disabled={!fone} title={titulo} aria-label={titulo}
      >
        <MessageCircle size={13} />
      </button>
    )
  }
  return (
    <button type="button" className={`btn btn-secondary botao-whatsapp-grande${enviado ? ' enviado' : ''}`} onClick={enviar} disabled={!fone} title={titulo}>
      <MessageCircle size={13} /> {enviado ? 'Reenviar WhatsApp' : 'Lembrete no WhatsApp'}
    </button>
  )
}
