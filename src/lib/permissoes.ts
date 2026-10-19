import type { PapelUsuario, TelaId } from '../types'

export interface TelaDef {
  id: TelaId
  label: string
  rota: string
  grupo: 'Geral' | 'Cadastros' | 'Movimentos' | 'Relatórios'
  /** false = tela só de consulta (não tem "editar"). */
  temEdicao: boolean
  /** O que "editar" libera nessa tela — texto de ajuda da tela de Permissões. */
  editarDescricao?: string
}

// Mesma lista e ordem de public.telas_configuraveis() no banco.
export const TELAS: TelaDef[] = [
  { id: 'dashboard',      label: 'Dashboard',        rota: '/dashboard',      grupo: 'Geral',      temEdicao: false },
  { id: 'clientes',       label: 'Clientes',         rota: '/clientes',       grupo: 'Cadastros',  temEdicao: true, editarDescricao: 'Cadastrar, editar e ativar/desativar clientes' },
  { id: 'profissionais',  label: 'Profissionais',    rota: '/profissionais',  grupo: 'Cadastros',  temEdicao: true, editarDescricao: 'Cadastrar e editar profissionais' },
  { id: 'produtos',       label: 'Produtos e Serviços', rota: '/produtos',    grupo: 'Cadastros',  temEdicao: true, editarDescricao: 'Cadastrar produtos e serviços, preços, fotos, etiquetas e entrada de mercadoria' },
  { id: 'fornecedores',   label: 'Fornecedores',     rota: '/fornecedores',   grupo: 'Cadastros',  temEdicao: true, editarDescricao: 'Cadastrar e editar fornecedores' },
  { id: 'categorias',     label: 'Categorias',       rota: '/categorias',     grupo: 'Cadastros',  temEdicao: true, editarDescricao: 'Plano de contas e formas de pagamento' },
  { id: 'agenda',         label: 'Agenda',           rota: '/agenda',         grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Criar agendamentos e mudar o status' },
  { id: 'pdv',            label: 'PDV',              rota: '/pdv',            grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Registrar vendas' },
  { id: 'caixa',          label: 'Caixa',            rota: '/caixa',          grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Abrir e fechar o próprio caixa, sangria e suprimento' },
  { id: 'financeiro',     label: 'Financeiro',       rota: '/financeiro',     grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Contas Caixa/Banco, lançar e excluir movimentos' },
  { id: 'contas_pagar',   label: 'Contas a Pagar',   rota: '/contas-pagar',   grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Lançar contas e registrar pagamentos' },
  { id: 'contas_receber', label: 'Contas a Receber', rota: '/contas-receber', grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Lançar contas e registrar recebimentos' },
  { id: 'comissoes',      label: 'Comissões',        rota: '/comissoes',      grupo: 'Movimentos', temEdicao: true, editarDescricao: 'Ver as comissões de todos e mudar o status (sem isso, vê só as próprias)' },
  { id: 'dre',            label: 'DRE',              rota: '/dre',            grupo: 'Relatórios', temEdicao: false },
  { id: 'relatorios',     label: 'Relatórios',       rota: '/relatorios',     grupo: 'Relatórios', temEdicao: false },
  { id: 'auditoria',      label: 'Auditoria',        rota: '/auditoria',      grupo: 'Relatórios', temEdicao: false },
  { id: 'configuracoes',  label: 'Configurações',    rota: '/configuracoes',  grupo: 'Geral',      temEdicao: true, editarDescricao: 'Alterar os dados e horários da loja' },
]

export const GRUPOS_TELAS: TelaDef['grupo'][] = ['Geral', 'Cadastros', 'Movimentos', 'Relatórios']

export const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}
