/**
 * Rateio das parcelas: as que o usuário digitou ficam com o valor dele e
 * o que falta do total se divide igual nas outras (o arredondamento vai
 * na última automática). Sem nenhuma digitada, é o rateio de sempre.
 */
export function ratearParcelas(total: number, n: number, fixos: (number | null)[]): number[] {
  const r2 = (v: number) => Math.round(v * 100) / 100
  const valores = Array.from({ length: n }, (_, i) => fixos[i] ?? null)
  const autos = valores.map((v, i) => (v === null ? i : -1)).filter(i => i >= 0)
  const resto = r2(total - valores.reduce<number>((s, v) => s + (v ?? 0), 0))
  const cada = autos.length ? Math.floor((resto / autos.length) * 100) / 100 : 0
  const ultima = autos[autos.length - 1]
  return valores.map((v, i) => (v !== null ? r2(v) : i === ultima ? r2(resto - cada * (autos.length - 1)) : r2(cada)))
}

/** Mensagem de erro do rateio (ou ''). */
export function erroRateio(total: number, valores: number[]): string {
  if (valores.some(v => v <= 0)) return 'As parcelas digitadas já somam o valor todo: deixe alguma em branco ou diminua os valores.'
  const soma = Math.round(valores.reduce((s, v) => s + v, 0) * 100) / 100
  if (Math.abs(soma - total) > 0.009) {
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return `As parcelas somam ${fmt(soma)} e o total é ${fmt(total)}. Ajuste os valores.`
  }
  return ''
}
