export type Periodo = 'mes' | 'trimestre' | 'ano' | 'personalizado'

export function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function rangeFor(periodo: Periodo, ref: Date, custom: { inicio: string; fim: string }): [string, string] {
  if (periodo === 'personalizado') return [custom.inicio, custom.fim]
  if (periodo === 'mes') {
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    return [toISO(inicio), toISO(fim)]
  }
  if (periodo === 'trimestre') {
    const q = Math.floor(ref.getMonth() / 3)
    const inicio = new Date(ref.getFullYear(), q * 3, 1)
    const fim = new Date(ref.getFullYear(), q * 3 + 3, 0)
    return [toISO(inicio), toISO(fim)]
  }
  const inicio = new Date(ref.getFullYear(), 0, 1)
  const fim = new Date(ref.getFullYear(), 11, 31)
  return [toISO(inicio), toISO(fim)]
}

/* ── Intervalo de datas (filtro de período por calendário) ───── */

export interface Intervalo { inicio: string; fim: string }

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Data local em "YYYY-MM-DD" (toISOString usa UTC e, no Brasil, vira o dia seguinte depois das 21h). */
export function dataLocalISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function deISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function somarDias(s: string, dias: number): string {
  const d = deISO(s)
  d.setDate(d.getDate() + dias)
  return dataLocalISO(d)
}

export function intervaloMes(ref: Date = new Date()): Intervalo {
  return {
    inicio: dataLocalISO(new Date(ref.getFullYear(), ref.getMonth(), 1)),
    fim: dataLocalISO(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)),
  }
}

export type AtalhoPeriodo = 'hoje' | 'ontem' | '7dias' | '30dias' | 'mes' | 'mes_anterior' | 'trimestre' | 'ano'

export const ATALHOS_PERIODO: { id: AtalhoPeriodo; label: string }[] = [
  { id: 'hoje',         label: 'Hoje' },
  { id: 'ontem',        label: 'Ontem' },
  { id: '7dias',        label: 'Últimos 7 dias' },
  { id: '30dias',       label: 'Últimos 30 dias' },
  { id: 'mes',          label: 'Este mês' },
  { id: 'mes_anterior', label: 'Mês passado' },
  { id: 'trimestre',    label: 'Este trimestre' },
  { id: 'ano',          label: 'Este ano' },
]

export function intervaloDoAtalho(id: AtalhoPeriodo, ref: Date = new Date()): Intervalo {
  const hoje = dataLocalISO(ref)
  switch (id) {
    case 'hoje': return { inicio: hoje, fim: hoje }
    case 'ontem': { const o = somarDias(hoje, -1); return { inicio: o, fim: o } }
    case '7dias': return { inicio: somarDias(hoje, -6), fim: hoje }
    case '30dias': return { inicio: somarDias(hoje, -29), fim: hoje }
    case 'mes': return intervaloMes(ref)
    case 'mes_anterior': return intervaloMes(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))
    case 'trimestre': {
      const q = Math.floor(ref.getMonth() / 3)
      return { inicio: dataLocalISO(new Date(ref.getFullYear(), q * 3, 1)), fim: dataLocalISO(new Date(ref.getFullYear(), q * 3 + 3, 0)) }
    }
    case 'ano': return { inicio: `${ref.getFullYear()}-01-01`, fim: `${ref.getFullYear()}-12-31` }
  }
}

/** Qual atalho gera exatamente esse intervalo (para marcar o botão ativo). */
export function atalhoDoIntervalo(i: Intervalo | null): AtalhoPeriodo | null {
  if (!i) return null
  return ATALHOS_PERIODO.find(a => {
    const r = intervaloDoAtalho(a.id)
    return r.inicio === i.inicio && r.fim === i.fim
  })?.id ?? null
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Texto curto do intervalo: "Outubro de 2026", "22/10/2026", "01/10 – 15/10/2026"... */
export function rotuloIntervalo(i: Intervalo | null): string {
  if (!i) return 'Todo o período'
  const a = deISO(i.inicio)
  const b = deISO(i.fim)
  const dm = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
  const dma = (d: Date) => `${dm(d)}/${d.getFullYear()}`
  if (i.inicio === i.fim) return i.inicio === dataLocalISO() ? `Hoje · ${dma(a)}` : dma(a)
  const mes = intervaloMes(a)
  if (mes.inicio === i.inicio && mes.fim === i.fim) {
    const nome = MESES[a.getMonth()]
    return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a.getFullYear()}`
  }
  if (i.inicio === `${a.getFullYear()}-01-01` && i.fim === `${a.getFullYear()}-12-31`) return `Ano de ${a.getFullYear()}`
  return a.getFullYear() === b.getFullYear() ? `${dm(a)} – ${dma(b)}` : `${dma(a)} – ${dma(b)}`
}

/** Mesmo tamanho de intervalo, para trás (-1) ou para frente (+1). Mês inteiro anda de mês em mês. */
export function deslocarIntervalo(i: Intervalo, direcao: -1 | 1): Intervalo {
  const a = deISO(i.inicio)
  const mes = intervaloMes(a)
  if (mes.inicio === i.inicio && mes.fim === i.fim) return intervaloMes(new Date(a.getFullYear(), a.getMonth() + direcao, 1))
  const dias = Math.round((deISO(i.fim).getTime() - a.getTime()) / 86400000) + 1
  return { inicio: somarDias(i.inicio, dias * direcao), fim: somarDias(i.fim, dias * direcao) }
}

export function periodoAnterior(inicio: string, fim: string): [string, string] {
  const di = new Date(`${inicio}T12:00:00`)
  const df = new Date(`${fim}T12:00:00`)
  const dias = Math.round((df.getTime() - di.getTime()) / 86400000) + 1
  const novoFim = new Date(di.getTime() - 86400000)
  const novoInicio = new Date(novoFim.getTime() - (dias - 1) * 86400000)
  return [toISO(novoInicio), toISO(novoFim)]
}
