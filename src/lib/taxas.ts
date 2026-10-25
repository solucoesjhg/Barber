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

/** Quando a venda já vem com "repassar a taxa ao cliente" marcado. */
export type RepassePadrao = 'nunca' | 'credito_parcelado' | 'sempre'

export interface TaxasLoja {
  /** Só as ativas (as que aparecem na venda). */
  maquininhas: Maquininha[]
  parcelasMaximas: number
  descontaComissao: boolean
  repassePadrao: RepassePadrao
}

export const TAXAS_VAZIAS: TaxasLoja = { maquininhas: [], parcelasMaximas: 12, descontaComissao: true, repassePadrao: 'nunca' }

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
    repassePadrao: (cfg?.repasse_taxa_padrao as RepassePadrao) ?? 'nunca',
  }
}

export function repasseSugerido(taxas: TaxasLoja, forma: PagamentoMetodo, parcelas: number): boolean {
  if (taxas.repassePadrao === 'sempre') return forma !== 'dinheiro'
  if (taxas.repassePadrao === 'credito_parcelado') return forma === 'credito' && parcelas > 1
  return false
}

/**
 * Mesmo cálculo do banco (calcular_cobranca). Com repasse o cliente paga
 * total / (1 − taxa%): depois do desconto da maquininha a loja fica com
 * o total cheio.
 */
export function calcularCobranca(total: number, pct: number, repassar: boolean) {
  const cobrado = repassar && pct > 0 ? arredondar(total / (1 - pct / 100)) : total
  const taxa = arredondar(cobrado * pct / 100)
  return { cobrado, acrescimo: arredondar(cobrado - total), taxa, liquido: arredondar(cobrado - taxa) }
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
    : forma === 'fiado' && Number(parcelas ?? 1) > 1 ? `Fiado ${parcelas}x`
    : ({ pix: 'Pix', debito: 'Cartão Débito', dinheiro: 'Dinheiro', fiado: 'Fiado' } as Record<string, string>)[forma] ?? forma
  return maquininha ? `${base} · ${maquininha}` : base
}

export const formatarPercentual = (v: number) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`

/** Venda paga em mais de uma forma: "Pix + Cartão Crédito 3x". */
export function rotuloPagamentos(
  pagamentos: { forma: string; parcelas?: number | null }[] | null | undefined,
  forma?: string | null, parcelas?: number | null,
): string {
  if (pagamentos && pagamentos.length > 1) return pagamentos.map(p => rotuloPagamento(p.forma, p.parcelas)).join(' + ')
  return rotuloPagamento(forma, parcelas)
}
