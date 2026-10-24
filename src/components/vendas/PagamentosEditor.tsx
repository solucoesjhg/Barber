import { Check, Plus, X } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import { arredondar, calcularCobranca, maquininhaObrigatoria, percentualTaxa, type TaxasLoja } from '../../lib/taxas'
import PagamentoTaxa from '../PagamentoTaxa'
import type { PagamentoMetodo } from '../../types'

export interface LinhaPagamento {
  id: string
  forma: PagamentoMetodo
  /** Digitado nas formas do meio; com uma forma só ela é o total e, com
   *  várias, a última fica com o que falta. */
  valor: string
  parcelas: number
  maquininhaId: string
  repassar: boolean
}

const FORMAS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix', label: 'Pix' },
  { id: 'credito', label: 'Crédito' },
  { id: 'debito', label: 'Débito' },
  { id: 'dinheiro', label: 'Dinheiro' },
]

let seq = 0
export function novaLinhaPagamento(forma: PagamentoMetodo = 'pix', valor = ''): LinhaPagamento {
  seq += 1
  return { id: `pg${seq}`, forma, valor, parcelas: 1, maquininhaId: '', repassar: false }
}

/** Valor de cada linha: uma linha só é o total; com várias, a última
 *  fica com o que falta para fechar o total. */
export function valoresDasLinhas(linhas: LinhaPagamento[], total: number): number[] {
  if (linhas.length === 1) return [total]
  const digitados = linhas.slice(0, -1).map(l => arredondar(Math.max(0, Number(String(l.valor).replace(',', '.')) || 0)))
  return [...digitados, arredondar(total - digitados.reduce((s, v) => s + v, 0))]
}

/** O que o cliente paga no total (com as taxas repassadas). */
export function totalCobrado(linhas: LinhaPagamento[], total: number, taxas: TaxasLoja): number {
  const valores = valoresDasLinhas(linhas, total)
  return arredondar(linhas.reduce((s, l, i) => s + calcularCobranca(valores[i], percentualTaxa(taxas, l.maquininhaId, l.forma, l.parcelas), l.repassar).cobrado, 0))
}

/** Mensagem de erro (ou '' se está tudo certo). */
export function validarPagamentos(linhas: LinhaPagamento[], total: number, taxas: TaxasLoja): string {
  const valores = valoresDasLinhas(linhas, total)
  if (linhas.length > 1) {
    if (valores.slice(0, -1).some(v => v <= 0)) return 'Informe o valor de cada forma de pagamento.'
    if (valores[valores.length - 1] <= 0) return `As primeiras formas já somam ${formatCurrency(arredondar(total - valores[valores.length - 1]))}: não sobra nada para a última. Ajuste os valores.`
  }
  if (linhas.some(l => maquininhaObrigatoria(l.forma, taxas) && !l.maquininhaId)) return 'Escolha a maquininha do cartão.'
  return ''
}

/** O que vai para finalizar_venda / editar_venda em p_pagamentos. */
export function pagamentosPayload(linhas: LinhaPagamento[], total: number) {
  const valores = valoresDasLinhas(linhas, total)
  return linhas.map((l, i) => ({
    forma: l.forma,
    valor: valores[i],
    parcelas: l.forma === 'credito' ? l.parcelas : 1,
    maquininha_id: l.forma !== 'dinheiro' && l.maquininhaId ? l.maquininhaId : null,
    repassar: l.repassar,
  }))
}

/**
 * Formas de pagamento da venda. Começa com uma (o total inteiro); "Dividir
 * em outra forma" acrescenta outra já com o que falta. Cada forma tem a
 * sua maquininha, parcelas e repasse de taxa.
 */
export default function PagamentosEditor({ linhas, onChange, total, taxas }: {
  linhas: LinhaPagamento[]
  /** O setState das linhas: as linhas mudam por efeito (maquininha única
   *  escolhida sozinha, repasse sugerido), então só atualização funcional. */
  onChange: (atualizar: (prev: LinhaPagamento[]) => LinhaPagamento[]) => void
  total: number
  taxas: TaxasLoja
}) {
  const valores = valoresDasLinhas(linhas, total)
  const dividido = linhas.length > 1
  const restante = valores[valores.length - 1]

  function mudar(id: string, dados: Partial<LinhaPagamento>) {
    onChange(prev => prev.map(l => (l.id === id ? { ...l, ...dados } : l)))
  }

  function dividir() {
    // A primeira deixa de ser "o total" e passa a ter valor próprio.
    onChange(prev => {
      // A que era a última passa a ter valor digitado: o que ela cobria
      // hoje (metade, se era a única); a nova fica com o resto.
      const atual = valoresDasLinhas(prev, total)
      const ultimo = prev.length === 1 ? arredondar(Math.floor(total * 50) / 100) : atual[atual.length - 1]
      const base = prev.map((l, i) => (i === prev.length - 1 ? { ...l, valor: String(ultimo) } : l))
      const usadas = new Set(base.map(l => l.forma))
      const forma = FORMAS.find(f => !usadas.has(f.id))?.id ?? 'pix'
      return [...base, novaLinhaPagamento(forma)]
    })
  }

  function remover(id: string) {
    onChange(prev => {
      const resto = prev.filter(l => l.id !== id)
      return resto.length === 1 ? [{ ...resto[0], valor: '' }] : resto
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {linhas.map((l, i) => (
        <div key={l.id} className={dividido ? 'pagamento-linha' : undefined}>
          {dividido && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="label" style={{ marginBottom: 0 }}>{i + 1}ª forma</span>
              <button type="button" className="btn btn-icon" onClick={() => remover(l.id)} aria-label="Remover esta forma" title="Remover esta forma" style={{ width: '24px', height: '24px' }}>
                <X size={11} />
              </button>
            </div>
          )}
          <div className="pagamento-linha-corpo">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {FORMAS.map(f => (
                  <button
                    key={f.id} type="button" aria-pressed={l.forma === f.id}
                    className={`opcao${l.forma === f.id ? ' marcada' : ''}`}
                    onClick={() => mudar(l.id, { forma: f.id, parcelas: 1 })}
                    style={{ padding: '9px 12px' }}
                  >
                    <span className="opcao-caixa">{l.forma === f.id && <Check size={10} strokeWidth={3} />}</span>
                    <span style={{ fontSize: '13px', color: 'var(--c-fff)' }}>{f.label}</span>
                  </button>
                ))}
              </div>
              {dividido && (i < linhas.length - 1 ? (
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Valor nesta forma</label>
                  <input
                    className="input" type="number" min={0} step={0.01} inputMode="decimal" placeholder="0,00"
                    value={l.valor} onChange={e => mudar(l.id, { valor: e.target.value })}
                  />
                </div>
              ) : (
                <p className="pagamento-restante" style={{ color: restante > 0 ? undefined : '#ef4444' }}>
                  Fica com o restante: <strong className="valor-num">{formatCurrency(restante)}</strong>
                </p>
              ))}
            </div>
            <PagamentoTaxa
              forma={l.forma} parcelas={l.parcelas} onParcelas={n => mudar(l.id, { parcelas: n })}
              maquininhaId={l.maquininhaId} onMaquininha={id => mudar(l.id, { maquininhaId: id })}
              repassar={l.repassar} onRepassar={v => mudar(l.id, { repassar: v })}
              total={valores[i]} taxas={taxas}
            />
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={dividir} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={12} /> Dividir em outra forma
        </button>
        {dividido && <span style={{ fontSize: '12px', color: 'var(--c-66)' }}>Total da venda: {formatCurrency(total)}</span>}
      </div>
    </div>
  )
}
