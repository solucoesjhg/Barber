import { Scissors } from 'lucide-react'
import { formatCurrency, formatDate } from '../../lib/utils'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../ui/ModalDetalhe'

export interface VendaDoProfissional {
  comandaId: string
  data: string
  cliente: string
  /** Itens que o profissional atendeu nessa venda ("Corte, Pomada ×2"). */
  itens: string
  valor: number
  comissao: number
}

/**
 * Relatório de Funcionários: as vendas que formam o atendimento, o
 * faturamento e a comissão de um profissional no período. Clicar numa
 * venda abre o card dela.
 */
export default function VendasProfissionalModal({ nome, periodo, vendas, onAbrirVenda, onClose }: {
  nome: string
  periodo: string
  vendas: VendaDoProfissional[]
  onAbrirVenda: (comandaId: string) => void
  onClose: () => void
}) {
  const faturamento = vendas.reduce((s, v) => s + v.valor, 0)
  const comissao = vendas.reduce((s, v) => s + v.comissao, 0)
  return (
    <ModalDetalhe largura={620} icone={<Scissors size={18} />} titulo={nome} subtitulo={<span>{periodo}</span>} onClose={onClose}>
      <InfoGrade>
        <Info rotulo="Atendimentos">{String(vendas.length)}</Info>
        <Info rotulo="Faturamento">{formatCurrency(faturamento)}</Info>
        <Info rotulo="Comissão">{formatCurrency(comissao)}</Info>
        <Info rotulo="Ticket médio">{formatCurrency(vendas.length > 0 ? faturamento / vendas.length : 0)}</Info>
      </InfoGrade>
      <SecaoDetalhe titulo={`Vendas (${vendas.length})`}>
        {vendas.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhuma venda no período.</p>
        ) : (
          <div className="detalhe-lista">
            {vendas.map(v => (
              <button
                key={v.comandaId} type="button" className="detalhe-lista-item"
                onClick={() => onAbrirVenda(v.comandaId)} title="Ver a venda"
                style={{ cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{v.cliente}</p>
                  <p className="subtexto texto-cortado">{formatDate(v.data)} · {v.itens}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>{formatCurrency(v.valor)}</p>
                  {v.comissao > 0 && <p className="subtexto">comissão {formatCurrency(v.comissao)}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        <div className="detalhe-total">
          <span>Total</span>
          <strong>{formatCurrency(faturamento)}</strong>
        </div>
      </SecaoDetalhe>
    </ModalDetalhe>
  )
}
