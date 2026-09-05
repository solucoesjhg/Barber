/* ============================================================
   TIPOS DO SISTEMA ERP — Barbearia & Conveniência
   ============================================================ */

export type AgendamentoStatus = 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'nao_compareceu'
export type PagamentoMetodo = 'pix' | 'credito' | 'debito' | 'dinheiro'
export type ProdutoCategoria = 'bebidas' | 'pomadas' | 'petiscos' | 'outros'
export type MovimentoTipo = 'entrada' | 'saida'
export type ComandaStatus = 'aberta' | 'fechada' | 'cancelada'

/* ── Entidades ────────────────────────────────────────────── */

export interface Profissional {
  id: string
  nome: string
  especialidade: string
  comissao_percentual: number
  ativo: boolean
  telefone?: string
  email?: string
  documento?: string
  valor_fixo?: number
  created_at: string
}

export interface Cliente {
  id: string
  nome: string
  telefone: string
  email?: string
  cpf?: string
  data_nascimento?: string
  endereco?: string
  observacoes?: string
  ativo: boolean
  created_at: string
}

export interface Servico {
  id: string
  nome: string
  preco: number
  duracao_minutos: number
  descricao?: string
  categoria?: string
  comissao_percentual?: number
  ativo: boolean
  profissionais?: Profissional[]
}

export interface ProfissionalServico {
  profissional_id: string
  servico_id: string
}

export interface Produto {
  id: string
  nome: string
  categoria: ProdutoCategoria
  preco_custo: number
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  estoque_maximo?: number
  sku?: string
  unidade: string
  ativo: boolean
}

export interface Agendamento {
  id: string
  cliente_id: string
  profissional_id: string
  servico_id: string
  data_hora: string
  duracao_minutos?: number
  valor?: number
  status: AgendamentoStatus
  observacoes?: string
  created_at: string
  cliente?: Cliente
  profissional?: Profissional
  servico?: Servico
}

export interface ItemComanda {
  id: string
  tipo: 'servico' | 'produto'
  referencia_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  profissional_id?: string
}

export interface Comanda {
  id: string
  cliente_id?: string
  cliente_nome?: string
  data: string
  status: ComandaStatus
  itens: ItemComanda[]
  total: number
  forma_pagamento?: PagamentoMetodo
  created_at: string
}

export interface MovimentoCaixa {
  id: string
  tipo: MovimentoTipo
  categoria: string
  descricao: string
  valor: number
  data: string
  comanda_id?: string
  created_at: string
}

export interface DashboardStats {
  faturamento_dia: number
  agendamentos_dia: number
  clientes_novos: number
  ticket_medio: number
}

/* ── Fundação financeira/administrativa (Fase 1) ─────────────── */

export type PapelUsuario = 'administrador' | 'gerente' | 'atendente' | 'profissional'
export type CategoriaFinanceiraTipo = 'receita' | 'despesa'

export interface CategoriaFinanceira {
  id: string
  nome: string
  tipo: CategoriaFinanceiraTipo
  categoria_pai_id?: string
  ativo: boolean
  created_at: string
}

export interface FormaPagamentoCadastro {
  id: string
  nome: string
  ativo: boolean
  created_at: string
}

export interface Fornecedor {
  id: string
  nome: string
  nome_fantasia?: string
  documento?: string
  telefone?: string
  email?: string
  endereco?: string
  observacoes?: string
  ativo: boolean
  created_at: string
}

export type ComissaoStatus = 'pendente' | 'aprovada' | 'paga' | 'cancelada'
export type MovimentoEstoqueTipo = 'entrada' | 'saida' | 'ajuste' | 'perda' | 'devolucao' | 'venda' | 'inventario'

export interface Comissao {
  id: string
  profissional_id: string
  comanda_id?: string
  item_comanda_id?: string
  valor_base: number
  percentual: number
  valor_comissao: number
  status: ComissaoStatus
  created_at: string
  profissional?: Profissional
}

export interface MovimentacaoEstoque {
  id: string
  produto_id: string
  tipo: MovimentoEstoqueTipo
  quantidade: number
  motivo?: string
  referencia_tipo?: string
  referencia_id?: string
  created_at: string
}

export interface UsuarioPerfil {
  usuario_id: string
  papel: PapelUsuario
  profissional_id?: string
  ativo: boolean
  created_at: string
}
