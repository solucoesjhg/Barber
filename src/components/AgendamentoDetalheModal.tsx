import { useState } from 'react'
import { Check, Clock, Play, ShoppingCart, XCircle, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, initials } from '../lib/utils'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from './ui/ModalDetalhe'
import type { Agendamento, AgendamentoStatus } from '../types'

export const STATUS_AGENDA: Record<AgendamentoStatus, { label: string; cls: string }> = {
  pendente:       { label: 'Pendente',        cls: 'badge badge-pending'   },
  confirmado:     { label: 'Confirmado',      cls: 'badge badge-confirmed' },
  em_atendimento: { label: 'Em atendimento',  cls: 'badge badge-confirmed' },
  concluido:      { label: 'Concluído',       cls: 'badge badge-done'      },
  cancelado:      { label: 'Cancelado',       cls: 'badge badge-canceled'  },
  nao_compareceu: { label: 'Não compareceu',  cls: 'badge badge-canceled'  },
}

/** Venda (não cancelada) gerada a partir do agendamento. */
export function vendaDoAgendamento(ag: Agendamento): string | null {
  return (ag.vendas ?? []).find(v => v.status !== 'cancelada')?.id ?? null
}

/**
 * Card de um agendamento: cliente, serviço, profissional, horário,
 * valor, observação (editável) e as ações do atendimento — confirmar,
 * iniciar, gerar a venda, concluir, não compareceu, cancelar.
 */
export default function AgendamentoDetalheModal({ agendamento: ag, podeEditar, podeVender, verTodasVendas, onClose, onStatus, onObservacaoSalva, onGerarVenda, onVerVenda }: {
  agendamento: Agendamento
  podeEditar: boolean
  podeVender: boolean
  /** Vê as vendas de todos: só assim "sem venda" num concluído é certeza (senão pode ser venda de outro usuário). */
  verTodasVendas: boolean
  onClose: () => void
  onStatus: (status: AgendamentoStatus) => void
  onObservacaoSalva: (observacoes: string) => void
  onGerarVenda: () => void
  onVerVenda: (comandaId: string) => void
}) {
  const [obs, setObs] = useState(ag.observacoes ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)

  const inicio = new Date(ag.data_hora)
  const duracao = ag.duracao_minutos ?? ag.servico?.duracao_minutos ?? 30
  const fim = new Date(inicio.getTime() + duracao * 60000)
  const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const diaTexto = inicio.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const dia = diaTexto.charAt(0).toUpperCase() + diaTexto.slice(1)
  const cfg = STATUS_AGENDA[ag.status]
  const vendaId = vendaDoAgendamento(ag)
  const valor = ag.valor ?? ag.servico?.preco
  const obsAlterada = obs.trim() !== (ag.observacoes ?? '').trim()

  async function salvarObservacao() {
    if (!podeEditar || !obsAlterada || salvando) return
    setSalvando(true); setErro(''); setSalvo(false)
    const texto = obs.trim()
    const { error } = await supabase.from('agendamentos').update({ observacoes: texto || null }).eq('id', ag.id)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onObservacaoSalva(texto)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  const fechado = ag.status === 'cancelado' || ag.status === 'nao_compareceu'
  const podeGerarVenda = podeVender && !vendaId && (
    ag.status === 'em_atendimento' || ag.status === 'confirmado' || (ag.status === 'concluido' && verTodasVendas)
  )

  return (
    <ModalDetalhe
      icone={ag.cliente?.nome ? initials(ag.cliente.nome) : <Clock size={18} />}
      titulo={ag.cliente?.nome ?? 'Sem cliente'}
      subtitulo={<><span>{dia}</span><span>{hora(inicio)} – {hora(fim)}</span><span className={cfg.cls}>{cfg.label}</span></>}
      onClose={onClose}
      onSalvar={salvarObservacao}
      acoes={(podeEditar || vendaId || podeGerarVenda) ? (
        <>
          {vendaId && (
            <button className="btn btn-secondary" onClick={() => onVerVenda(vendaId)}>
              <Receipt size={13} /> Ver venda
            </button>
          )}
          {podeGerarVenda && (
            <button className="btn btn-primary" onClick={onGerarVenda} title="Registra a venda deste atendimento: só falta escolher a forma de pagamento">
              <ShoppingCart size={13} /> Gerar venda
            </button>
          )}
          {podeEditar && ag.status === 'pendente' && (
            <button className="btn btn-secondary" onClick={() => onStatus('confirmado')}><Check size={13} /> Confirmar</button>
          )}
          {podeEditar && ag.status === 'confirmado' && (
            <button className="btn btn-secondary" onClick={() => onStatus('em_atendimento')}><Play size={13} /> Iniciar atendimento</button>
          )}
          {podeEditar && ag.status === 'em_atendimento' && (
            <button className="btn btn-secondary" onClick={() => onStatus('concluido')} title="Conclui o atendimento sem registrar venda">
              <Check size={13} /> Concluir sem venda
            </button>
          )}
          {podeEditar && (ag.status === 'pendente' || ag.status === 'confirmado') && (
            <button className="btn btn-ghost" onClick={() => onStatus('nao_compareceu')}><Clock size={13} /> Não compareceu</button>
          )}
          {podeEditar && !fechado && ag.status !== 'concluido' && (
            <button className="btn btn-ghost" onClick={() => { if (window.confirm('Cancelar este agendamento?')) onStatus('cancelado') }}>
              <XCircle size={13} /> Cancelar
            </button>
          )}
        </>
      ) : undefined}
    >
      <InfoGrade>
        <Info rotulo="Serviço">{ag.servico?.nome}</Info>
        <Info rotulo="Valor">{ag.valor != null ? formatCurrency(Number(ag.valor)) : ag.servico?.preco_na_venda ? 'Definido na venda' : valor != null ? formatCurrency(Number(valor)) : undefined}</Info>
        <Info rotulo="Profissional">{ag.profissional?.nome}</Info>
        <Info rotulo="Duração">{`${duracao} min`}</Info>
        <Info rotulo="Telefone">{ag.cliente?.telefone}</Info>
        <Info rotulo="Venda">{vendaId ? 'Registrada' : undefined}</Info>
      </InfoGrade>

      <SecaoDetalhe titulo="Observação" acao={salvo ? <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--c-a3)' }}>Salvo</span> : undefined}>
        {podeEditar ? (
          <>
            <textarea
              className="input textarea"
              placeholder="Ex: prefere máquina 2 nas laterais, chega 10 min atrasado..."
              value={obs}
              onChange={e => setObs(e.target.value)}
              maxLength={1000}
            />
            {(obsAlterada || erro) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                {erro && <p style={{ fontSize: '12px', color: 'var(--c-a3)', flex: 1 }}>{erro}</p>}
                <span style={{ flex: erro ? 0 : 1 }} />
                <button className="btn btn-ghost btn-sm" onClick={() => setObs(ag.observacoes ?? '')} disabled={salvando}>Desfazer</button>
                <button className="btn btn-primary btn-sm" onClick={salvarObservacao} disabled={salvando || !obsAlterada}>
                  {salvando ? 'Salvando...' : 'Salvar observação (F10)'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="detalhe-valor" style={{ color: ag.observacoes ? 'var(--c-fff)' : 'var(--c-55)', whiteSpace: 'pre-wrap' }}>
            {ag.observacoes || 'Sem observação.'}
          </p>
        )}
      </SecaoDetalhe>
    </ModalDetalhe>
  )
}
