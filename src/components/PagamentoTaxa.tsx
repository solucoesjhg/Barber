import { formatCurrency } from '../lib/utils'
import { arredondar, formatarPercentual, percentualTaxa, type TaxasLoja } from '../lib/taxas'
import type { PagamentoMetodo } from '../types'

/**
 * Abaixo das formas de pagamento: parcelas (no crédito) e, quando a loja
 * tem taxa para a forma escolhida, quanto fica de taxa e quanto a loja
 * recebe. O cliente paga o total; a taxa sai do que a loja recebe.
 */
export default function PagamentoTaxa({ forma, parcelas, onParcelas, total, taxas }: {
  forma: PagamentoMetodo
  parcelas: number
  onParcelas: (n: number) => void
  total: number
  taxas: TaxasLoja
}) {
  const pct = percentualTaxa(taxas, forma, parcelas)
  const taxa = arredondar(total * pct / 100)
  const opcoes = Array.from({ length: taxas.parcelasMaximas }, (_, i) => i + 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      {forma === 'credito' && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Parcelas</label>
          <select className="input" value={parcelas} onChange={e => onParcelas(Number(e.target.value))}>
            {opcoes.map(n => {
              const p = taxas.credito[n] ?? 0
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
            <span>Taxa da maquininha ({formatarPercentual(pct)})</span>
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
