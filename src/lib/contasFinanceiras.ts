import { supabase } from './supabase'
import { formatCurrency } from './utils'

export interface SaldoConta {
  conta_id: string
  nome: string
  tipo: 'caixa' | 'banco'
  padrao: boolean
  saldo: number
}

/** Contas ativas da loja com o saldo atual (todo o histórico), a padrão primeiro. */
export async function carregarSaldosContas(): Promise<SaldoConta[]> {
  const { data } = await supabase.rpc('saldo_contas_financeiras')
  return ((data ?? []) as SaldoConta[]).map(c => ({ ...c, saldo: Number(c.saldo) }))
}

/**
 * Antes de uma saída de dinheiro: se a conta (a padrão, quando não
 * informada) ficar negativa, pede confirmação. Só avisa, não bloqueia:
 * às vezes o saldo no sistema está atrasado em relação ao banco.
 * Devolve true quando pode seguir.
 */
export async function confirmarSaldoSuficiente(contaId: string | null, valor: number): Promise<boolean> {
  const contas = await carregarSaldosContas()
  const conta = contas.find(c => (contaId ? c.conta_id === contaId : c.padrao))
  if (!conta || conta.saldo - valor >= 0) return true
  return window.confirm(
    `A conta ${conta.nome} tem ${formatCurrency(conta.saldo)} e vai ficar com ${formatCurrency(conta.saldo - valor)}.\n\nConfirmar mesmo assim?`,
  )
}
