import { useEffect, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from './ui/ModalDetalhe'
import type { MovimentoCaixa } from '../types'

const CATEGORIA_LABEL: Record<string, string> = {
  venda: 'Venda', sangria: 'Sangria', suprimento: 'Suprimento', capital_inicial: 'Saldo inicial',
  conta_a_pagar: 'Conta paga', conta_a_receber: 'Conta recebida', compra_mercadoria: 'Compra de mercadoria',
  entrada: 'Entrada', saida: 'Saída',
}

// Detalhe de um lançamento sem venda associada (manual, sangria,
// suprimento...) — a linha da lista corta a descrição, aqui mostra
// ela inteira, mais a opção de excluir.
export default function LancamentoDetalheModal({ movimento, onClose, onDelete }: {
  movimento: MovimentoCaixa
  onClose: () => void
  onDelete?: () => Promise<void> | void
}) {
  const [excluindo, setExcluindo] = useState(false)
  const [error, setError] = useState('')
  const [conta, setConta] = useState<string | null>(null)

  useEffect(() => {
    if (!movimento.conta_financeira_id) return
    supabase.from('contas_financeiras').select('nome').eq('id', movimento.conta_financeira_id).maybeSingle()
      .then(({ data }) => setConta((data as { nome: string } | null)?.nome ?? null))
  }, [movimento.conta_financeira_id])

  async function handleExcluir() {
    if (!onDelete) return
    if (!window.confirm('Excluir este lançamento? Essa ação não pode ser desfeita.')) return
    setExcluindo(true); setError('')
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setExcluindo(false)
    }
  }

  const entrada = movimento.tipo === 'entrada'

  return (
    <ModalDetalhe
      largura={440}
      icone={entrada ? <ArrowUpRight size={18} style={{ color: 'var(--c-fff)' }} /> : <ArrowDownRight size={18} />}
      titulo={entrada ? 'Entrada' : 'Saída'}
      subtitulo={formatDateTime(movimento.created_at ?? movimento.data)}
      onClose={onClose}
      acoes={onDelete ? (
        <button className="btn btn-secondary" style={{ color: 'var(--c-a3)' }} onClick={handleExcluir} disabled={excluindo}>
          <Trash2 size={13} /> {excluindo ? 'Excluindo...' : 'Excluir lançamento'}
        </button>
      ) : undefined}
    >
      <InfoGrade>
        <Info rotulo="Categoria">{CATEGORIA_LABEL[movimento.categoria] ?? movimento.categoria}</Info>
        <Info rotulo="Data">{formatDate(movimento.data)}</Info>
        <Info rotulo="Conta">{conta}</Info>
        <Info rotulo="Origem">{movimento.sessao_caixa_id ? 'Caixa' : 'Financeiro'}</Info>
      </InfoGrade>

      <SecaoDetalhe titulo="Descrição">
        <p className="detalhe-valor" style={{ color: 'var(--c-a3)', whiteSpace: 'pre-wrap' }}>{movimento.descricao}</p>
      </SecaoDetalhe>

      <div className="detalhe-total">
        <span>Valor</span>
        <strong style={{ color: entrada ? 'var(--c-fff)' : 'var(--c-a3)' }}>{entrada ? '+' : '−'}{formatCurrency(movimento.valor)}</strong>
      </div>

      {error && <p className="aviso-erro" style={{ marginTop: '12px' }}>{error}</p>}
    </ModalDetalhe>
  )
}
