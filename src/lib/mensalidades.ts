import { dataLocalISO } from './periodo'
import type { Mensalidade } from '../types'

/** Situação na tela: a pendente com vencimento passado é "atrasada". */
export type SituacaoMensalidade = 'paga' | 'cancelada' | 'atrasada' | 'pendente'

export function situacaoMensalidade(m: Pick<Mensalidade, 'status' | 'vencimento'>): SituacaoMensalidade {
  if (m.status === 'paga' || m.status === 'cancelada') return m.status
  return m.vencimento < dataLocalISO() ? 'atrasada' : 'pendente'
}

export const SITUACAO_LABEL: Record<SituacaoMensalidade, string> = {
  paga: 'Paga', cancelada: 'Cancelada', atrasada: 'Atrasada', pendente: 'A vencer',
}

export const SITUACAO_CLASSE: Record<SituacaoMensalidade, string> = {
  paga: 'badge badge-done', cancelada: 'badge badge-canceled', atrasada: 'badge badge-atrasada', pendente: 'badge badge-confirmed',
}

/** "outubro de 2026" */
export function rotuloCompetencia(competencia: string): string {
  const [a, m] = competencia.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** Primeiro dia do mês da data (YYYY-MM-01). */
export function inicioDoMes(iso: string = dataLocalISO()): string {
  return `${iso.slice(0, 7)}-01`
}

export const FORMAS_RECEBIMENTO = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro']
