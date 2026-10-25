import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { erroRateio, ratearParcelas } from '../../lib/parcelas'

/** Soma meses como o banco (31/01 + 1 mês = 28/02; + 2 meses = 31/03). */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const ultimoDia = new Date(a, m - 1 + meses + 1, 0).getDate()
  const data = new Date(a, m - 1 + meses, Math.min(d, ultimoDia))
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`
}

export function vencimentosMensais(primeira: string, parcelas: number): string[] {
  if (!primeira) return []
  return Array.from({ length: parcelas }, (_, i) => somarMeses(primeira, i))
}

/**
 * Datas e valores das parcelas: começam mês a mês a partir do 1º
 * vencimento, com valores iguais; cada data e cada valor pode ser
 * trocado. Mudar o valor de uma recalcula as outras. Mudar o 1º
 * vencimento ou a quantidade recalcula as datas. payload: p_vencimentos
 * e p_valores, só quando algo foi mudado (sem mudança, o banco calcula
 * igual).
 */
export function useVencimentos(primeira: string, parcelas: number, valorTotal = 0) {
  const padrao = useMemo(() => vencimentosMensais(primeira, parcelas), [primeira, parcelas])
  const [datas, setDatas] = useState<string[]>(padrao)
  const [digitados, setDigitados] = useState<string[]>([])
  useEffect(() => { setDatas(padrao); setDigitados(d => d.slice(0, parcelas)) }, [padrao, parcelas])

  const fixos = Array.from({ length: parcelas }, (_, i) => {
    const t = digitados[i] ?? ''
    return parcelas > 1 && t !== '' ? Number(t.replace(',', '.')) || 0 : null
  })
  const valores = ratearParcelas(valorTotal, parcelas, fixos)
  const datasEditadas = datas.some((d, i) => d !== padrao[i])
  const valoresEditados = fixos.some(v => v !== null)

  const erro = datas.some(d => !d)
    ? 'Informe a data de vencimento de todas as parcelas.'
    : datas.findIndex((d, i) => i > 0 && d < datas[i - 1]) > 0
      ? 'As parcelas precisam vencer em ordem (cada uma na mesma data ou depois da anterior).'
      : valorTotal > 0 && valoresEditados ? erroRateio(valorTotal, valores) : ''

  return {
    datas,
    valores,
    editados: fixos.map(v => v !== null),
    digitados,
    mudar: (i: number, valor: string) => setDatas(prev => prev.map((d, j) => (j === i ? valor : d))),
    mudarValor: (i: number, valor: string) => setDigitados(prev => {
      const lista = [...prev]
      while (lista.length <= i) lista.push('')
      lista[i] = valor
      return lista
    }),
    recalcular: () => { setDigitados([]); setDatas(padrao) },
    alterado: datasEditadas || valoresEditados,
    erro,
    payload: parcelas > 1 && (datasEditadas || valoresEditados)
      ? { p_vencimentos: datas, ...(valoresEditados ? { p_valores: valores } : {}) }
      : {},
  }
}

/** Uma linha por parcela: número, data e valor (os dois editáveis). */
export default function VencimentosParcelas({ venc }: { venc: ReturnType<typeof useVencimentos> }) {
  const n = venc.datas.length
  if (n < 2) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <p className="label" style={{ marginBottom: 0 }}>Parcelas: data e valor</p>
        {venc.alterado && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={venc.recalcular} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <RotateCcw size={11} /> Recalcular
          </button>
        )}
      </div>
      <div className="parcelas-lista">
        {venc.datas.map((d, i) => (
          <div key={i} className="parcela-linha" style={{ gridTemplateColumns: '40px minmax(0, 1fr) 120px' }}>
            <span className="subtexto">{i + 1}/{n}</span>
            <input className="input" type="date" value={d} aria-label={`Vencimento da parcela ${i + 1}`} onChange={e => venc.mudar(i, e.target.value)} />
            <input
              className={`input${venc.editados[i] ? ' parcela-editada' : ''}`} type="number" min={0} step={0.01} inputMode="decimal"
              aria-label={`Valor da parcela ${i + 1}`} placeholder={venc.valores[i].toFixed(2)}
              value={venc.digitados[i] ?? ''} onChange={e => venc.mudarValor(i, e.target.value)}
            />
          </div>
        ))}
      </div>
      <p className="subtexto">Mude o valor de uma parcela e as outras se ajustam.</p>
      {venc.erro && <p className="aviso-erro" style={{ marginTop: '4px' }}>{venc.erro}</p>}
    </div>
  )
}
