import type { CardDashboardId, PapelUsuario, TelaId } from '../types'

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

// Mesma lista de public.cards_dashboard() no banco.
export const CARDS_DASHBOARD: { id: CardDashboardId; label: string; grupo: 'Agenda' | 'Financeiro' | 'Rankings'; ajuda: string }[] = [
  { id: 'agendamentos_hoje', label: 'Agendamentos',          grupo: 'Agenda',     ajuda: 'Quantos agendamentos há hoje' },
  { id: 'confirmados',       label: 'Confirmados',           grupo: 'Agenda',     ajuda: 'Agendamentos confirmados de hoje' },
  { id: 'concluidos',        label: 'Concluídos',            grupo: 'Agenda',     ajuda: 'Atendimentos finalizados hoje' },
  { id: 'cancelamentos',     label: 'Cancelamentos',         grupo: 'Agenda',     ajuda: 'Cancelados hoje' },
  { id: 'agenda_hoje',       label: 'Agenda de Hoje',        grupo: 'Agenda',     ajuda: 'Lista com os horários do dia' },
  { id: 'faturamento_hoje',  label: 'Faturamento de hoje',   grupo: 'Financeiro', ajuda: 'Valor dos agendamentos de hoje' },
  { id: 'faturamento_mes',   label: 'Faturamento do mês',    grupo: 'Financeiro', ajuda: 'Precisa ver Financeiro' },
  { id: 'despesas_mes',      label: 'Despesas do mês',       grupo: 'Financeiro', ajuda: 'Precisa ver Financeiro' },
  { id: 'lucro_estimado',    label: 'Lucro estimado',        grupo: 'Financeiro', ajuda: 'Precisa ver Financeiro' },
  { id: 'a_receber',         label: 'A Receber',             grupo: 'Financeiro', ajuda: 'Precisa ver Contas a Receber' },
  { id: 'a_pagar',           label: 'A Pagar',               grupo: 'Financeiro', ajuda: 'Precisa ver Contas a Pagar' },
  { id: 'saldo_caixa',       label: 'Saldo de Caixa',        grupo: 'Financeiro', ajuda: 'Saldo do caixa aberto do próprio usuário' },
  { id: 'top_servicos',      label: 'Serviços mais vendidos', grupo: 'Rankings',  ajuda: 'Ranking do mês' },
  { id: 'top_profissionais', label: 'Profissionais — faturamento', grupo: 'Rankings', ajuda: 'Ranking do mês' },
]

/** Papéis que cada papel pode atribuir (mesma regra de papeis_que_posso_atribuir() no banco). */
export function papeisQuePossoAtribuir(papel: PapelUsuario | null): PapelUsuario[] {
  if (papel === 'super_admin') return ['administrador', 'gerente', 'atendente', 'profissional']
  if (papel === 'administrador') return ['gerente', 'atendente', 'profissional']
  if (papel === 'gerente') return ['atendente', 'profissional']
  return []
}

/** Nome para exibir: o nome cadastrado ou, sem ele, a parte do e-mail antes do @. */
export function nomeExibicao(u: { nome?: string | null; email: string }): string {
  return u.nome?.trim() || u.email.split('@')[0]
}
