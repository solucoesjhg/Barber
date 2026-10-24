import { supabase } from './supabase'
import type { PagamentoMetodo } from '../types'

/** Taxas da loja por forma de pagamento (crédito: por número de parcelas). */
export interface TaxasLoja {
  pix: number
  debito: number
  credito: Record<number, number>
  parcelasMaximas: number
  descontaComissao: boolean
}

export const TAXAS_VAZIAS: TaxasLoja = { pix: 0, debito: 0, credito: {}, parcelasMaximas: 12, descontaComissao: true }

export async function carregarTaxas(): Promise<TaxasLoja> {
  const [{ data: linhas }, { data: cfg }] = await Promise.all([
    supabase.from('taxas_pagamento').select('forma_pagamento, parcelas, percentual'),
    supabase.from('configuracoes').select('parcelas_maximas, comissao_desconta_taxa').maybeSingle(),
  ])
  const taxas: TaxasLoja = {
    ...TAXAS_VAZIAS,
    credito: {},
    parcelasMaximas: Number(cfg?.parcelas_maximas ?? 12),
    descontaComissao: cfg?.comissao_desconta_taxa ?? true,
  }
  for (const l of (linhas ?? []) as { forma_pagamento: string; parcelas: number; percentual: number }[]) {
    const pct = Number(l.percentual)
    if (l.forma_pagamento === 'pix') taxas.pix = pct
    else if (l.forma_pagamento === 'debito') taxas.debito = pct
    else if (l.forma_pagamento === 'credito') taxas.credito[l.parcelas] = pct
  }
  return taxas
}

/** % que o banco vai aplicar (a mesma regra de taxa_pagamento). */
export function percentualTaxa(taxas: TaxasLoja, forma: PagamentoMetodo, parcelas: number): number {
  if (forma === 'pix') return taxas.pix
  if (forma === 'debito') return taxas.debito
  if (forma === 'credito') return taxas.credito[Math.max(1, parcelas)] ?? 0
  return 0
}

export const arredondar = (v: number) => Math.round(v * 100) / 100

/** "Cartão Crédito 3x", "Pix"... */
export function rotuloPagamento(forma?: string | null, parcelas?: number | null): string {
  if (!forma) return '—'
  if (forma === 'credito') return `Cartão Crédito ${Math.max(1, Number(parcelas ?? 1))}x`
  return ({ pix: 'Pix', debito: 'Cartão Débito', dinheiro: 'Dinheiro' } as Record<string, string>)[forma] ?? forma
}

export const formatarPercentual = (v: number) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
