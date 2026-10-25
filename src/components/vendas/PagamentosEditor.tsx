import { Check, Plus, RotateCcw, X } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import { dataLocalISO } from '../../lib/periodo'
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
  /** Entrada paga na hora, antes do parcelado (só muda o rótulo). */
  entrada?: boolean
  /** Parcelado: data e valor de cada parcela que o usuário mudou
   *  ('' = automático). As parcelas sem valor dividem o que falta. */
  datasParc?: string[]
  valoresParc?: string[]
}

export interface ParcelaCronograma { data: string; valor: number; editado: boolean }

const num = (t: string | undefined) => Number(String(t ?? '').replace(',', '.')) || 0

/** Soma meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02). */
function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.split('-').map(Number)
  const alvo = new Date(a, m - 1 + meses, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(d, ultimo))
  return dataLocalISO(alvo)
}

/**
 * Parcelas do Parcelado: a 1ª no prazo da loja e as demais mês a mês;
 * valores iguais, menos os que foram digitados — o que falta se divide
 * nas outras (o arredondamento vai na última automática).
 */
export function cronogramaParcelado(l: LinhaPagamento, valor: number, prazoDias: number): ParcelaCronograma[] {
  const n = Math.max(1, l.parcelas)
  const hoje = new Date(); hoje.setDate(hoje.getDate() + prazoDias)
  const primeira = dataLocalISO(hoje)
  const fixos = Array.from({ length: n }, (_, i) => (n > 1 && (l.valoresParc?.[i] ?? '') !== '' ? arredondar(num(l.valoresParc?.[i])) : null))
  const autos = fixos.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0)
  const resto = arredondar(valor - fixos.reduce<number>((t, v) => t + (v ?? 0), 0))
  const cada = autos.length ? Math.floor((resto / autos.length) * 100) / 100 : 0
  return fixos.map((v, i) => ({
    data: l.datasParc?.[i] || somarMeses(primeira, i),
    valor: v !== null ? v : i === autos[autos.length - 1] ? arredondar(resto - cada * (autos.length - 1)) : arredondar(cada),
    editado: v !== null,
  }))
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
  return { id: `pg${seq}`, forma, valor, parcelas: 1, maquininhaId: '', repassar: false, datasParc: [], valoresParc: [] }
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
export function validarPagamentos(linhas: LinhaPagamento[], total: number, taxas: TaxasLoja, prazoDias = 30): string {
  const valores = valoresDasLinhas(linhas, total)
  const hoje = dataLocalISO()
  for (const [i, l] of linhas.entries()) {
    if (l.forma !== 'fiado') continue
    const parc = cronogramaParcelado(l, valores[i], prazoDias)
    if (parc.some(p => p.valor <= 0)) return 'As parcelas digitadas já somam o valor todo: deixe alguma em branco ou diminua os valores.'
    const soma = arredondar(parc.reduce((t, p) => t + p.valor, 0))
    if (Math.abs(soma - valores[i]) > 0.009) return `As parcelas somam ${formatCurrency(soma)} e o parcelado é de ${formatCurrency(valores[i])}. Ajuste os valores.`
    if (parc.some(p => !p.data || p.data < hoje)) return 'A data das parcelas não pode ser antes de hoje.'
  }
  if (linhas.length > 1) {
    if (valores.slice(0, -1).some(v => v <= 0)) return 'Informe o valor de cada forma de pagamento.'
    if (valores[valores.length - 1] <= 0) return `As primeiras formas já somam ${formatCurrency(arredondar(total - valores[valores.length - 1]))}: não sobra nada para a última. Ajuste os valores.`
  }
  if (linhas.some(l => maquininhaObrigatoria(l.forma, taxas) && !l.maquininhaId)) return 'Escolha a maquininha do cartão.'
  return ''
}

/** O que vai para finalizar_venda / editar_venda em p_pagamentos. */
export function pagamentosPayload(linhas: LinhaPagamento[], total: number, prazoDias = 30) {
  const valores = valoresDasLinhas(linhas, total)
  return linhas.map((l, i) => ({
    ...(l.forma === 'fiado' ? { vencimentos: cronogramaParcelado(l, valores[i], prazoDias).map(p => ({ data: p.data, valor: p.valor })) } : {}),
    forma: l.forma,
    valor: valores[i],
    parcelas: l.forma === 'credito' || l.forma === 'fiado' ? l.parcelas : 1,
    maquininha_id: l.forma !== 'dinheiro' && l.maquininhaId ? l.maquininhaId : null,
    repassar: l.repassar,
  }))
}

/**
 * Formas de pagamento da venda. Começa com uma (o total inteiro); "Dividir
 * em outra forma" acrescenta outra já com o que falta. Cada forma tem a
 * sua maquininha, parcelas e repasse de taxa.
 */
export default function PagamentosEditor({ linhas, onChange, total, taxas, permitirFiado = false, prazoDias = 30 }: {
  /** Mostra a forma "Parcelado" (conta a receber do cliente). */
  permitirFiado?: boolean
  /** Dias até a 1ª parcela do Parcelado (Configurações). */
  prazoDias?: number
  linhas: LinhaPagamento[]
  /** O setState das linhas: as linhas mudam por efeito (maquininha única
   *  escolhida sozinha, repasse sugerido), então só atualização funcional. */
  onChange: (atualizar: (prev: LinhaPagamento[]) => LinhaPagamento[]) => void
  total: number
  taxas: TaxasLoja
}) {
  const valores = valoresDasLinhas(linhas, total)
  const formas = permitirFiado ? [...FORMAS, { id: 'fiado' as PagamentoMetodo, label: 'Parcelado' }] : FORMAS
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

  /** Entrada paga na hora: uma forma antes do parcelado, que passa a
   *  ser a última e fica com o restante. */
  function comEntrada(id: string) {
    onChange(prev => {
      const parcelado = prev.find(l => l.id === id)
      if (!parcelado) return prev
      const outras = prev.filter(l => l.id !== id)
      const atual = valoresDasLinhas(prev, total)[prev.findIndex(l => l.id === id)]
      const fixadas = outras.map(l => (l.valor === '' ? { ...l, valor: String(atual) } : l))
      return [...fixadas, { ...novaLinhaPagamento('pix'), entrada: true }, { ...parcelado, valor: '' }]
    })
  }

  function mudarParcela(l: LinhaPagamento, i: number, campo: 'datasParc' | 'valoresParc', v: string) {
    const lista = [...(l[campo] ?? [])]
    while (lista.length <= i) lista.push('')
    lista[i] = v
    mudar(l.id, { [campo]: lista })
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
              <span className="label" style={{ marginBottom: 0 }}>{l.entrada ? 'Entrada (paga agora)' : l.forma === 'fiado' && linhas.some(x => x.entrada) ? 'Parcelado (restante)' : `${i + 1}ª forma`}</span>
              <button type="button" className="btn btn-icon" onClick={() => remover(l.id)} aria-label="Remover esta forma" title="Remover esta forma" style={{ width: '24px', height: '24px' }}>
                <X size={11} />
              </button>
            </div>
          )}
          <div className="pagamento-linha-corpo">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {(l.entrada ? FORMAS : formas).map(f => (
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
            {l.forma === 'fiado' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="label">Parcelas</label>
                  <select className="input" value={l.parcelas} onChange={e => mudar(l.id, { parcelas: Number(e.target.value) })}>
                    {Array.from({ length: 12 }, (_, k) => k + 1).map(n => (
                      <option key={n} value={n}>{n === 1 ? '1x (de uma vez)' : `${n}x`}</option>
                    ))}
                  </select>
                </div>
                <div className="parcelas-lista">
                  {cronogramaParcelado(l, valores[i], prazoDias).map((p, k) => (
                    <div key={k} className="parcela-linha">
                      <span className="subtexto">{k + 1}ª</span>
                      <input className="input" type="date" aria-label={`Vencimento da ${k + 1}ª parcela`} min={dataLocalISO()}
                        value={p.data} onChange={e => mudarParcela(l, k, 'datasParc', e.target.value)} />
                      {l.parcelas > 1 ? (
                        <input className={`input${p.editado ? ' parcela-editada' : ''}`} type="number" min={0} step={0.01} inputMode="decimal"
                          aria-label={`Valor da ${k + 1}ª parcela`} placeholder={p.valor.toFixed(2)}
                          value={l.valoresParc?.[k] ?? ''} onChange={e => mudarParcela(l, k, 'valoresParc', e.target.value)} />
                      ) : <strong className="valor-num" style={{ fontSize: '13px', textAlign: 'right' }}>{formatCurrency(p.valor)}</strong>}
                    </div>
                  ))}
                </div>
                {l.parcelas > 1 && (
                  <p className="pagamento-restante" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <span>Mude o valor de uma parcela e as outras se ajustam.</span>
                    {((l.valoresParc ?? []).some(v => v !== '') || (l.datasParc ?? []).some(v => v !== '')) && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => mudar(l.id, { valoresParc: [], datasParc: [] })} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <RotateCcw size={11} /> Recalcular
                      </button>
                    )}
                  </p>
                )}
                {!linhas.some(x => x.entrada) && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => comEntrada(l.id)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Plus size={12} /> Com entrada (paga agora)
                  </button>
                )}
              </div>
            ) : <PagamentoTaxa
              forma={l.forma} parcelas={l.parcelas} onParcelas={n => mudar(l.id, { parcelas: n })}
              maquininhaId={l.maquininhaId} onMaquininha={id => mudar(l.id, { maquininhaId: id })}
              repassar={l.repassar} onRepassar={v => mudar(l.id, { repassar: v })}
              total={valores[i]} taxas={taxas}
            />}
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
