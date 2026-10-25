import { supabase } from './supabase'

/**
 * Valor sugerido para abrir o caixa: o dinheiro que ficou na gaveta no
 * último fechamento (o contado; se fechou sozinho sem contagem, o que
 * deveria ter).
 */
export async function sugestaoAberturaCaixa(): Promise<{ valor: number; fechadoEm: string } | null> {
  const { data } = await supabase.from('sessoes_caixa')
    .select('valor_informado, saldo_esperado, fechado_em')
    .eq('status', 'fechado').not('fechado_em', 'is', null)
    .order('fechado_em', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  const valor = Number(data.valor_informado ?? data.saldo_esperado ?? 0)
  return { valor: Math.max(valor, 0), fechadoEm: data.fechado_em as string }
}

/** "ontem às 22:00", "hoje às 08:10" ou "24/10 às 22:00". */
export function rotuloFechamento(iso: string) {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = (x: Date) => x.toDateString()
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1)
  if (dia(d) === dia(new Date())) return `hoje às ${hora}`
  if (dia(d) === dia(ontem)) return `ontem às ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora}`
}
