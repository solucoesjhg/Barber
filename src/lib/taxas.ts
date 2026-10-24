import { supabase } from './supabase'
import type { PagamentoMetodo } from '../types'

/** Uma maquininha e as taxas dela (crédito: por número de parcelas). */
export interface Maquininha {
  id: string
  nome: string
  ativo: boolean
  pix: number
  debito: number
  credito: Record<number, number>
}

export interface TaxasLoja {
  /** Só as ativas (as que aparecem na venda). */
  maquininhas: Maquininha[]
  parcelasMaximas: number
  descontaComissao: boolean
}

export const TAXAS_VAZIAS: TaxasLoja = { maquininhas: [], parcelasMaximas: 12, descontaComissao: true }

export async function carregarMaquininhas(todas = false): Promise<Maquininha[]> {
  const [{ data: maqs }, { data: linhas }] = await Promise.all([
    supabase.from('maquininhas').select('id, nome, ativo').order('nome'),
    supabase.from('taxas_maquininha').select('maquininha_id, forma_pagamento, parcelas, percentual'),
  ])
  const lista: Maquininha[] = ((maqs ?? []) as { id: string; nome: string; ativo: boolean }[])
    .filter(m => todas || m.ativo)
    .map(m => ({ ...m, pix: 0, debito: 0, credito: {} }))
  const porId = new Map(lista.map(m => [m.id, m]))
  for (const l of (linhas ?? []) as { maquininha_id: string; forma_pagamento: string; parcelas: number; percentual: number }[]) {
    const m = porId.get(l.maquininha_id)
    if (!m) continue
    const pct = Number(l.percentual)
    if (l.forma_pagamento === 'pix') m.pix = pct
    else if (l.forma_pagamento === 'debito') m.debito = pct
    else if (l.forma_pagamento === 'credito') m.credito[l.parcelas] = pct
  }
  return lista
}

export async function carregarTaxas(): Promise<TaxasLoja> {
  const [maquininhas, { data: cfg }] = await Promise.all([
    carregarMaquininhas(),
    supabase.from('configuracoes').select('*').maybeSingle(),
  ])
  return {
    maquininhas,
    parcelasMaximas: Number(cfg?.parcelas_maximas ?? 12),
    descontaComissao: cfg?.comissao_desconta_taxa ?? true,
  }
}

/** Débito e crédito passam pela maquininha; no Pix ela é opcional. */
export const usaMaquininha = (forma: PagamentoMetodo) => forma === 'debito' || forma === 'credito' || forma === 'pix'
export const maquininhaObrigatoria = (forma: PagamentoMetodo, taxas: TaxasLoja) =>
  (forma === 'debito' || forma === 'credito') && taxas.maquininhas.length > 0

/** % que o banco vai aplicar (a mesma regra de taxa_maquininha). */
export function percentualTaxa(taxas: TaxasLoja, maquininhaId: string, forma: PagamentoMetodo, parcelas: number): number {
  const m = taxas.maquininhas.find(x => x.id === maquininhaId)
  if (!m) return 0
  if (forma === 'pix') return m.pix
  if (forma === 'debito') return m.debito
  if (forma === 'credito') return m.credito[Math.max(1, parcelas)] ?? 0
  return 0
}

export const arredondar = (v: number) => Math.round(v * 100) / 100

/** "Cartão Crédito 3x", "Pix", "Cartão Débito · Stone"... */
export function rotuloPagamento(forma?: string | null, parcelas?: number | null, maquininha?: string | null): string {
  if (!forma) return '—'
  const base = forma === 'credito'
    ? `Cartão Crédito ${Math.max(1, Number(parcelas ?? 1))}x`
    : ({ pix: 'Pix', debito: 'Cartão Débito', dinheiro: 'Dinheiro' } as Record<string, string>)[forma] ?? forma
  return maquininha ? `${base} · ${maquininha}` : base
}

export const formatarPercentual = (v: number) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
