import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { dataLocalISO } from '../../lib/periodo'
import { telefoneWhatsApp } from '../../lib/whatsapp'
import ModalDetalhe from '../ui/ModalDetalhe'
import BotaoWhatsApp from './BotaoWhatsApp'
import type { Agendamento } from '../../types'
import { exibirTelefone } from '../../lib/mascaras'

function amanha() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dataLocalISO(d)
}

/**
 * "Lembretes de amanhã": os agendamentos pendentes e confirmados do dia
 * seguinte, cada um com o botão do WhatsApp. Abre um por um e vai
 * marcando os já enviados.
 */
export default function LembretesModal({ onClose, onEnviado }: {
  onClose: () => void
  onEnviado: (id: string, quando: string) => void
}) {
  const [lista, setLista] = useState<Agendamento[] | null>(null)
  const dia = amanha()

  useEffect(() => {
    let ativo = true
    supabase.from('agendamentos')
      .select('*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*)')
      .in('status', ['pendente', 'confirmado'])
      .gte('data_hora', new Date(`${dia}T00:00:00`).toISOString())
      .lte('data_hora', new Date(`${dia}T23:59:59`).toISOString())
      .order('data_hora')
      .then(({ data }) => { if (ativo) setLista((data ?? []) as Agendamento[]) })
    return () => { ativo = false }
  }, [dia])

  function marcar(id: string, quando: string) {
    setLista(prev => prev?.map(a => a.id === id ? { ...a, lembrete_enviado_em: quando } : a) ?? prev)
    onEnviado(id, quando)
  }

  const enviados = lista?.filter(a => a.lembrete_enviado_em).length ?? 0
  const semTelefone = lista?.filter(a => a.cliente && !telefoneWhatsApp(a.cliente.telefone)).length ?? 0
  const rotuloDia = new Date(`${dia}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).replace(/^./, c => c.toUpperCase())

  return (
    <ModalDetalhe
      icone={<MessageCircle size={18} />}
      titulo="Lembretes de amanhã"
      subtitulo={<span>{rotuloDia}{lista ? ` · ${enviados} de ${lista.length} enviados` : ''}</span>}
      onClose={onClose}
      largura={640}
    >
      {!lista ? (
        <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '32px 0', textAlign: 'center' }}>Carregando...</p>
      ) : lista.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '32px 0', textAlign: 'center' }}>Nenhum agendamento para amanhã.</p>
      ) : (
        <>
          <p className="subtexto" style={{ marginBottom: '10px' }}>
            Cada botão abre o WhatsApp com a mensagem pronta; é só apertar enviar. A mensagem é configurada em Configurações › Agenda.
            {semTelefone > 0 && ` ${semTelefone} sem telefone cadastrado.`}
          </p>
          <div className="lembretes-lista">
            {lista.map(a => (
              <div key={a.id} className={`lembrete-linha${a.lembrete_enviado_em ? ' enviado' : ''}`}>
                <strong className="valor-num">{new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="texto-cortado" style={{ display: 'block', fontSize: '13px', color: 'var(--c-fff)' }}>{a.cliente?.nome ?? 'Sem cliente'}</span>
                  <span className="subtexto texto-cortado" style={{ display: 'block' }}>
                    {[a.servico?.nome, a.profissional?.nome, exibirTelefone(a.cliente?.telefone)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {a.cliente
                  ? <BotaoWhatsApp agendamento={a} onEnviado={q => marcar(a.id, q)} />
                  : <span className="subtexto">Sem cliente</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </ModalDetalhe>
  )
}
