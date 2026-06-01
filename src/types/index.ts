export type Papel = 'admin' | 'gerente' | 'recepcionista' | 'barbeiro'
export type StatusAgendamento = 'agendado' | 'confirmado' | 'em_atendimento' | 'finalizado' | 'cancelado' | 'nao_compareceu'
export type StatusFuncionario = 'ativo' | 'inativo' | 'afastado'
export type StatusCaixa = 'aberto' | 'fechado'
export type TipoMovimento = 'entrada' | 'saida'
export type FormaPagamento = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'outro'

export interface Empresa {
  id_em: string
  nome_em: string
  razao_em?: string
  cnpj_em?: string
  fone_em?: string
  email_em?: string
  logo_em?: string
  cidade_em?: string
  uf_em?: string
  hrini_em: string
  hrfim_em: string
  ativo_em: boolean
}

export interface Perfil {
  id_pe: string
  usuari_pe: string
  nome_pe?: string
  avatar_pe?: string
  fone_pe?: string
}

export interface Usuario {
  id_us: string
  perfil_us: string
  empres_us: string
  papel_us: Papel
  status_us: 'ativo' | 'pendente' | 'inativo'
  perfis?: Perfil
}

export interface Funcionario {
  id_fu: string
  empres_fu: string
  nome_fu: string
  foto_fu?: string
  cargo_fu: string
  comiss_fu: number
  status_fu: StatusFuncionario
}

export interface Cliente {
  id_cl: string
  empres_cl: string
  nome_cl: string
  apelid_cl?: string
  fone_cl?: string
  nascim_cl?: string
  obs_cl?: string
}

export interface Servico {
  id_sv: string
  empres_sv: string
  nome_sv: string
  durac_sv: number
  valor_sv: number
  comiss_sv: number
  ativo_sv: boolean
}

export interface Agendamento {
  id_ag: string
  empres_ag: string
  client_ag: string
  funcio_ag: string
  servic_ag: string
  dtini_ag: string
  dtfim_ag: string
  status_ag: StatusAgendamento
  obs_ag?: string
  clientes?: Cliente
  funcionarios?: Funcionario
  servicos?: Servico
}

export interface Caixa {
  id_cx: string
  empres_cx: string
  dtaber_cx: string
  slini_cx: number
  slfim_cx?: number
  status_cx: StatusCaixa
}
