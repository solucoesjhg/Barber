import { useEffect } from 'react'
import { formatCurrency } from '../lib/utils'
import { arredondar, formatarPercentual, maquininhaObrigatoria, percentualTaxa, usaMaquininha, type TaxasLoja } from '../lib/taxas'
import type { PagamentoMetodo } from '../types'

/**
 * Abaixo das formas de pagamento: a maquininha (débito e crédito; no Pix
 * é opcional), as parcelas (no crédito) e, quando há taxa, quanto fica
 * de taxa e quanto a loja recebe. O cliente paga o total; a taxa sai do
 * que a loja recebe.
 */
export default function PagamentoTaxa({ forma, parcelas, onParcelas, maquininhaId, onMaquininha, total, taxas }: {
  forma: PagamentoMetodo
  parcelas: number
  onParcelas: (n: number) => void
  maquininhaId: string
  onMaquininha: (id: string) => void
  total: number
  taxas: TaxasLoja
}) {
  const maqs = taxas.maquininhas
  const obrigatoria = maquininhaObrigatoria(forma, taxas)
  const mostraMaquininha = usaMaquininha(forma) && maqs.length > 0

  // Uma maquininha só: já vem escolhida no cartão.
  useEffect(() => {
    if (obrigatoria && !maquininhaId && maqs.length === 1) onMaquininha(maqs[0].id)
  }, [obrigatoria, maquininhaId, maqs, onMaquininha])

  const maq = maqs.find(m => m.id === maquininhaId)
  const pct = percentualTaxa(taxas, maquininhaId, forma, parcelas)
  const taxa = arredondar(total * pct / 100)
  const opcoes = Array.from({ length: taxas.parcelasMaximas }, (_, i) => i + 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      {mostraMaquininha && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Maquininha{obrigatoria ? ' *' : ''}</label>
          <select
            className="input" value={maquininhaId} onChange={e => onMaquininha(e.target.value)}
            style={obrigatoria && !maquininhaId ? { borderStyle: 'dashed', borderColor: 'var(--c-a3)' } : undefined}
          >
            <option value="">{obrigatoria ? 'Escolha a maquininha' : 'Pix direto na conta (sem maquininha)'}</option>
            {maqs.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      )}
      {forma === 'credito' && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Parcelas</label>
          <select className="input" value={parcelas} onChange={e => onParcelas(Number(e.target.value))}>
            {opcoes.map(n => {
              const p = maq?.credito[n] ?? 0
              return (
                <option key={n} value={n}>
                  {n === 1 ? '1x (à vista)' : `${n}x de ${formatCurrency(total / n)}`}{p > 0 ? ` · taxa ${formatarPercentual(p)}` : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}
      {pct > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--c-25)' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-77)' }}>
            <span>Taxa {maq ? maq.nome : 'da maquininha'} ({formatarPercentual(pct)})</span>
            <span className="valor-num">− {formatCurrency(taxa)}</span>
          </span>
          <span style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-a3)', fontWeight: 600 }}>
            <span>A loja recebe</span>
            <span className="valor-num">{formatCurrency(total - taxa)}</span>
          </span>
          {taxas.descontaComissao && <span style={{ color: 'var(--c-66)' }}>A taxa é descontada da base da comissão.</span>}
        </div>
      )}
    </div>
  )
}
