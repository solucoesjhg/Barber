import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '../../lib/utils'

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
 * Datas das parcelas: começam mês a mês a partir do 1º vencimento e
 * cada uma pode ser trocada. Mudar o 1º vencimento ou a quantidade
 * recalcula todas. payload: as datas para p_vencimentos, só quando
 * alguma foi mudada (sem mudança, o banco calcula igual, mês a mês).
 */
export function useVencimentos(primeira: string, parcelas: number) {
  const padrao = useMemo(() => vencimentosMensais(primeira, parcelas), [primeira, parcelas])
  const [datas, setDatas] = useState<string[]>(padrao)
  useEffect(() => { setDatas(padrao) }, [padrao])
  const editado = datas.some((d, i) => d !== padrao[i])
  const erro = datas.some(d => !d)
    ? 'Informe a data de vencimento de todas as parcelas.'
    : datas.findIndex((d, i) => i > 0 && d < datas[i - 1]) > 0
      ? 'As parcelas precisam vencer em ordem (cada uma na mesma data ou depois da anterior).'
      : ''
  return {
    datas,
    mudar: (i: number, valor: string) => setDatas(prev => prev.map((d, j) => (j === i ? valor : d))),
    erro,
    payload: parcelas > 1 && editado ? { p_vencimentos: datas } : {},
  }
}

/** Lista "1ª · R$ 333,33 · [data]" com o mesmo rateio do banco (a última leva o arredondamento). */
export default function VencimentosParcelas({ datas, valorTotal, onMudar, erro }: {
  datas: string[]
  valorTotal: number
  onMudar: (i: number, valor: string) => void
  erro?: string
}) {
  const n = datas.length
  if (n < 2) return null
  const parcela = Math.round((valorTotal / n) * 100) / 100
  const ultima = Math.round((valorTotal - parcela * (n - 1)) * 100) / 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <p className="label" style={{ marginBottom: '2px' }}>Vencimento de cada parcela</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '240px', overflowY: 'auto', paddingRight: '2px' }}>
        {datas.map((d, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr minmax(130px, 160px)', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-a3)' }}>{i + 1}/{n}</span>
            <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-77)' }}>{valorTotal > 0 ? formatCurrency(i === n - 1 ? ultima : parcela) : '—'}</span>
            <input
              className="input" type="date" value={d}
              aria-label={`Vencimento da parcela ${i + 1}`}
              onChange={e => onMudar(i, e.target.value)}
              style={{ padding: '6px 10px', fontSize: '12px' }}
            />
          </div>
        ))}
      </div>
      {erro && <p className="aviso-erro" style={{ marginTop: '4px' }}>{erro}</p>}
    </div>
  )
}
