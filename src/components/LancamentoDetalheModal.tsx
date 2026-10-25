import { useEffect, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from './ui/ModalDetalhe'
import SeletorConta from './financeiro/SeletorConta'
import type { MovimentoCaixa } from '../types'

const CATEGORIA_LABEL: Record<string, string> = {
  venda: 'Venda', sangria: 'Sangria', suprimento: 'Suprimento', capital_inicial: 'Saldo inicial',
  conta_a_pagar: 'Conta paga', conta_a_receber: 'Conta recebida', compra_mercadoria: 'Compra de mercadoria',
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência', taxa_cartao: 'Taxa de cartão',
  vale: 'Vale de profissional', comissao: 'Pagamento de comissão',
}

/** Lançamentos que o sistema gera já classificados (não trocam de conta). */
const GERADOS_PELO_SISTEMA = ['venda', 'taxa_cartao', 'transferencia', 'conta_a_pagar', 'conta_a_receber', 'comissao', 'vale', 'compra_mercadoria', 'capital_inicial']

export function podeClassificarMovimento(m: MovimentoCaixa) {
  return !m.comanda_id && !m.transferencia_id && !GERADOS_PELO_SISTEMA.includes(m.categoria)
}

// Detalhe de um lançamento sem venda associada (manual, sangria,
// suprimento...) — a linha da lista corta a descrição, aqui mostra
// ela inteira, mais a opção de excluir.
export default function LancamentoDetalheModal({ movimento, onClose, onDelete, podeClassificar = false, onClassificado }: {
  movimento: MovimentoCaixa
  onClose: () => void
  onDelete?: () => Promise<void> | void
  /** Pode escolher/trocar a conta do plano de contas. */
  podeClassificar?: boolean
  onClassificado?: (categoriaId: string | null) => void
}) {
  const [error, setError] = useState('')
  const [contaPlano, setContaPlano] = useState(movimento.categoria_id ?? '')
  const [classificando, setClassificando] = useState(false)
  const classificavel = podeClassificar && podeClassificarMovimento(movimento)

  async function classificar(id: string) {
    const anterior = contaPlano
    setContaPlano(id); setClassificando(true); setError('')
    const { error: err } = await supabase.rpc('classificar_movimento', { p_movimento_id: movimento.id, p_categoria_id: id || null })
    setClassificando(false)
    if (err) { setContaPlano(anterior); setError(err.message); return }
    onClassificado?.(id || null)
  }

  const [excluindo, setExcluindo] = useState(false)
  const [conta, setConta] = useState<string | null>(null)

  useEffect(() => {
    if (!movimento.conta_financeira_id) return
    supabase.from('contas_financeiras').select('nome').eq('id', movimento.conta_financeira_id).maybeSingle()
      .then(({ data }) => setConta((data as { nome: string } | null)?.nome ?? null))
  }, [movimento.conta_financeira_id])

  async function handleExcluir() {
    if (!onDelete) return
    const msg = movimento.transferencia_id
      ? 'Excluir esta transferência? Os dois lançamentos (saída e entrada) são excluídos. Essa ação não pode ser desfeita.'
      : 'Excluir este lançamento? Essa ação não pode ser desfeita.'
    if (!window.confirm(msg)) return
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
        {!classificavel && movimento.conta && <Info rotulo="Plano de contas">{movimento.conta.nome}</Info>}
      </InfoGrade>

      {classificavel && (
        <SecaoDetalhe titulo="Plano de contas">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '360px' }}>
            <SeletorConta tipo={movimento.tipo === 'entrada' ? 'entrada' : 'saida'} valor={contaPlano} onChange={classificar} />
            {classificando && <span className="subtexto">Salvando...</span>}
          </div>
          <p className="subtexto" style={{ marginTop: '6px' }}>{movimento.tipo === 'entrada' ? 'Classificada, a entrada conta em Outras receitas na DRE.' : 'Classificada, a saída entra nas despesas da DRE nessa conta.'}</p>
        </SecaoDetalhe>
      )}

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
