import { useEffect, useRef } from 'react'
import { formatCurrency } from '../lib/utils'
import {
  calcularCobranca, formatarPercentual, maquininhaObrigatoria, percentualTaxa, repasseSugerido, usaMaquininha, type TaxasLoja,
} from '../lib/taxas'
import type { PagamentoMetodo } from '../types'

/**
 * Abaixo das formas de pagamento: a maquininha (débito e crédito; no Pix
 * é opcional), as parcelas (no crédito), se a taxa é repassada ao cliente
 * e quanto fica de taxa e quanto a loja recebe.
 */
export default function PagamentoTaxa({ forma, parcelas, onParcelas, maquininhaId, onMaquininha, repassar, onRepassar, total, taxas }: {
  forma: PagamentoMetodo
  parcelas: number
  onParcelas: (n: number) => void
  maquininhaId: string
  onMaquininha: (id: string) => void
  repassar: boolean
  onRepassar: (v: boolean) => void
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

  // Repasse sugerido pela loja ao trocar a forma ou as parcelas (não na
  // abertura, para a edição de uma venda manter o que ela tinha).
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return }
    onRepassar(repasseSugerido(taxas, forma, parcelas))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forma, parcelas, taxas.repassePadrao])

  const maq = maqs.find(m => m.id === maquininhaId)
  const pct = percentualTaxa(taxas, maquininhaId, forma, parcelas)
  const c = calcularCobranca(total, pct, repassar)
  const opcoes = Array.from({ length: taxas.parcelasMaximas }, (_, i) => i + 1)
  const linha = (rotulo: string, valor: string, forte = false) => (
    <span style={{ display: 'flex', justifyContent: 'space-between', color: forte ? 'var(--c-a3)' : 'var(--c-77)', fontWeight: forte ? 600 : 400 }}>
      <span>{rotulo}</span><span className="valor-num">{valor}</span>
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
              const valorParcela = calcularCobranca(total, p, repassar).cobrado / n
              return (
                <option key={n} value={n}>
                  {n === 1 ? '1x (à vista)' : `${n}x de ${formatCurrency(valorParcela)}`}{p > 0 ? ` · taxa ${formatarPercentual(p)}` : ''}
                </option>
              )
            })}
          </select>
        </div>
      )}
      {pct > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--c-25)' }}>
          <label className="check-rotulo" style={{ marginBottom: '4px' }} title="O cliente paga a taxa: o valor cobrado sobe para a loja receber o valor cheio">
            <input type="checkbox" checked={repassar} onChange={e => onRepassar(e.target.checked)} />
            Repassar a taxa ao cliente
          </label>
          {repassar && linha('Acréscimo da taxa (cliente paga)', `+ ${formatCurrency(c.acrescimo)}`)}
          {linha(`Taxa ${maq ? maq.nome : 'da maquininha'} (${formatarPercentual(pct)})`, `− ${formatCurrency(c.taxa)}`)}
          {linha('A loja recebe', formatCurrency(c.liquido), true)}
          {!repassar && taxas.descontaComissao && <span style={{ color: 'var(--c-66)' }}>A taxa é descontada da base da comissão.</span>}
        </div>
      )}
    </div>
  )
}
