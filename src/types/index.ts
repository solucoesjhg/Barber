/* ============================================================
   TIPOS DO SISTEMA ERP — Barbearia & Conveniência
   ============================================================ */

export type AgendamentoStatus = 'pendente' | 'confirmado' | 'em_atendimento' | 'concluido' | 'cancelado' | 'nao_compareceu'
export type PagamentoMetodo = 'pix' | 'credito' | 'debito' | 'dinheiro' | 'fiado'
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
  /** Sem preço fixo: o valor é decidido na hora da venda. */
  preco_na_venda?: boolean
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
  comissao_percentual?: number
  ativo: boolean
  foto_url?: string
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
  /** Vendas geradas a partir deste agendamento (comandas.agendamento_id). */
  vendas?: { id: string; status: ComandaStatus }[]
  /** Quando o lembrete foi aberto no WhatsApp. */
  lembrete_enviado_em?: string | null
}

export interface ItemComanda {
  id: string
  tipo: 'servico' | 'produto'
  referencia_id: string
  nome: string
  quantidade: number
  preco_unitario: number
  profissional_id?: string
  /** Só na tela: serviço com valor decidido na venda (precisa informar). */
  preco_na_venda?: boolean
}

export interface Comanda {
  id: string
  cliente_id?: string
  cliente_nome?: string
  usuario_id?: string
  data: string
  status: ComandaStatus
  itens: ItemComanda[]
  total: number
  forma_pagamento?: PagamentoMetodo
  /** Crédito: número de parcelas (1 = à vista). */
  parcelas?: number
  maquininha_id?: string | null
  /** Taxa da maquininha gravada na venda (% e R$). */
  taxa_percentual?: number
  taxa_valor?: number
  /** Taxa repassada ao cliente: o que ele pagou a mais (total + acréscimo = cobrado). */
  acrescimo?: number
  /** Desconto dado na venda (o total já vem sem ele). */
  desconto?: number
  agendamento_id?: string | null
  created_at: string
  /** Formas usadas no pagamento (venda paga em mais de uma forma). */
  pagamentos?: PagamentoComanda[]
}

/** Uma parte do pagamento da venda (comanda_pagamentos). */
export interface PagamentoComanda {
  forma: PagamentoMetodo
  valor: number
  parcelas: number
  maquininha_id?: string | null
  taxa_percentual?: number
  taxa_valor?: number
  acrescimo?: number
  cobrado?: number
}

export interface MovimentoCaixa {
  id: string
  tipo: MovimentoTipo
  categoria: string
  descricao: string
  valor: number
  data: string
  comanda_id?: string
  sessao_caixa_id?: string
  /** Venda: forma de pagamento desta entrada (o caixa separa por forma). */
  forma_pagamento?: PagamentoMetodo | null
  conta_financeira_id?: string
  /** Os dois lados de uma transferência entre contas têm o mesmo id. */
  transferencia_id?: string | null
  created_at: string
}

export interface ContaFinanceira {
  id: string
  nome: string
  tipo: 'caixa' | 'banco'
  padrao: boolean
  ativo: boolean
  created_at: string
}

export type SessaoCaixaStatus = 'aberto' | 'fechado'

export interface SessaoCaixa {
  id: string
  usuario_id: string
  valor_inicial: number
  aberto_em: string
  fechado_em?: string
  saldo_esperado?: number
  valor_informado?: number
  diferenca?: number
  observacao_fechamento?: string
  status: SessaoCaixaStatus
  /** Quem fechou (caixa único da loja: pode ser outra pessoa). */
  fechado_por?: string | null
}

export interface DashboardStats {
  faturamento_dia: number
  agendamentos_dia: number
  clientes_novos: number
  ticket_medio: number
}

/* ── Fundação financeira/administrativa (Fase 1) ─────────────── */

export type PapelUsuario = 'super_admin' | 'administrador' | 'gerente' | 'atendente' | 'profissional'

export interface Empresa {
  id: string
  nome: string
  codigo?: string
  cnpj?: string
  telefone?: string
  email?: string
  /** false = loja bloqueada: a equipe não acessa nada. */
  ativo: boolean
  created_at: string
  responsavel?: string | null
  endereco?: string | null
  cidade?: string | null
  observacoes?: string | null
  motivo_bloqueio?: string | null
  bloqueada_em?: string | null
  /** Cobrança da plataforma (mensalidade do Barber). */
  plano?: string | null
  valor_mensalidade?: number
  dia_vencimento?: number
  cobranca_ativa?: boolean
}

/** Uma linha do painel do super admin (painel_empresas). */
export interface PainelEmpresa extends Empresa {
  usuarios_ativos: number
  ultimo_acesso: string | null
  vendas_mes: number
  faturamento_mes: number
  mensalidades_atrasadas: number
  valor_atrasado: number
  proximo_vencimento: string | null
}

export interface Mensalidade {
  id: string
  empresa_id: string
  tipo: 'mensalidade' | 'avulsa'
  competencia: string
  descricao?: string | null
  valor: number
  vencimento: string
  status: 'pendente' | 'paga' | 'cancelada'
  pago_em?: string | null
  valor_pago?: number | null
  forma_pagamento?: string | null
  observacao?: string | null
  created_at: string
  empresa?: { nome: string } | null
}
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
  profissional_id?: string
  usuario_id?: string
  comanda_id?: string
  item_comanda_id?: string
  valor_base: number
  /** Parte da taxa do cartão descontada da base. */
  taxa_valor?: number
  percentual: number
  valor_comissao: number
  status: ComissaoStatus
  created_at: string
  /** Fechamento em que a comissão foi paga. */
  fechamento_id?: string | null
  profissional?: Profissional
  item?: { nome: string; quantidade: number } | null
  comanda?: { id: string; data: string; cliente_nome?: string | null; total: number; forma_pagamento?: string | null; parcelas?: number | null } | null
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

export type ContaStatus = 'aberta' | 'parcial' | 'paga' | 'cancelada'

export interface ContaPagar {
  id: string
  fornecedor_id?: string
  categoria_id?: string
  descricao: string
  valor: number
  valor_pago: number
  data_emissao: string
  data_vencimento: string
  data_pagamento?: string
  forma_pagamento_id?: string
  status: ContaStatus
  centro_custo?: string
  observacao?: string
  origem: string
  numero_parcela: number
  total_parcelas: number
  grupo_parcelamento?: string
  created_at: string
  fornecedor?: Fornecedor
  categoria?: CategoriaFinanceira
}

export interface ContaReceber {
  id: string
  cliente_id?: string
  categoria_id?: string
  descricao: string
  valor: number
  valor_pago: number
  data_emissao: string
  data_vencimento: string
  data_pagamento?: string
  forma_pagamento_id?: string
  status: ContaStatus
  observacao?: string
  origem: string
  numero_parcela: number
  total_parcelas: number
  grupo_parcelamento?: string
  created_at: string
  cliente?: Cliente
  categoria?: CategoriaFinanceira
}

export interface Auditoria {
  id: string
  usuario_id?: string
  acao: 'insert' | 'update' | 'delete'
  modulo: string
  registro_id?: string
  dados_antes?: Record<string, unknown>
  dados_depois?: Record<string, unknown>
  created_at: string
}

export interface Configuracoes {
  empresa_id: string
  nome_empresa: string
  cnpj?: string
  telefone?: string
  endereco?: string
  logo_url?: string
  horario_abertura: string
  horario_fechamento: string
  duracao_padrao_min: number
  tolerancia_atraso_min: number
  regras_cancelamento?: string
  fechamento_automatico?: boolean
  comissao_desconta_taxa?: boolean
  parcelas_maximas?: number
  controla_estoque_minimo?: boolean
  /** Agendamento já nasce confirmado. */
  agendamento_confirmado?: boolean
  /** Venda de produto sem estoque: permitir, avisar ou bloquear. */
  estoque_zerado?: 'permitir' | 'avisar' | 'bloquear'
  /** Valor que já vem na abertura do caixa (troco). */
  caixa_valor_inicial?: number
  /** Cor da loja (#rrggbb) nos botões principais; vazio = padrão. */
  cor_destaque?: string | null
  permitir_fiado?: boolean
  fiado_prazo_dias?: number
  /** Texto do lembrete de WhatsApp ({cliente}, {servico}...); vazio = padrão. */
  mensagem_whatsapp?: string | null
  updated_at: string
}

export interface UsuarioListado {
  usuario_id: string
  email: string
  papel: PapelUsuario
  profissional_id?: string
  ativo: boolean
  criado_em: string
  empresa_id?: string
  empresa_nome?: string
  comissao_percentual?: number | null
  nome?: string | null
}

export interface UsuarioPerfil {
  usuario_id: string
  papel: PapelUsuario
  profissional_id?: string
  empresa_id?: string
  ativo: boolean
  created_at: string
}

/* ── Permissões por tela ──────────────────────────────────── */

export type TelaId =
  | 'dashboard' | 'agenda' | 'pdv' | 'caixa' | 'financeiro' | 'contas_pagar'
  | 'contas_receber' | 'comissoes' | 'clientes' | 'profissionais' | 'produtos'
  | 'fornecedores' | 'categorias' | 'dre' | 'relatorios' | 'auditoria' | 'configuracoes'

export type CardDashboardId =
  | 'agendamentos_hoje' | 'confirmados' | 'concluidos' | 'cancelamentos' | 'faturamento_hoje'
  | 'faturamento_mes' | 'despesas_mes' | 'lucro_estimado' | 'a_receber' | 'a_pagar' | 'saldo_caixa'
  | 'top_servicos' | 'top_profissionais' | 'agenda_hoje'

/** Abas da tela Relatórios (cada uma pode ser liberada separadamente). */
export type RelatorioId = 'vendas' | 'caixa' | 'comissoes' | 'clientes' | 'produtos' | 'profissionais' | 'agenda'

export interface PermissaoTela {
  ver: boolean
  editar: boolean
  tem_edicao: boolean
  personalizado: boolean
}

/** Retorno de minhas_permissoes() / permissoes_usuario(). */
export interface PermissoesUsuario {
  usuario_id: string
  papel: PapelUsuario | null
  acesso_total: boolean
  gerenciar_equipe: boolean
  ver_vendas_outros: boolean
  /** Ausente = banco sem a migração (vê todos). */
  ver_agendamentos_outros?: boolean
  /** Ausente = banco sem a migração (sem desconto). */
  dar_desconto?: boolean
  /** % máximo de desconto (null = sem limite). */
  desconto_maximo?: number | null
  ver_custo_produtos: boolean
  especiais_personalizados: boolean
  /** Cards que aparecem no Dashboard (ids de CARDS_DASHBOARD). */
  dashboard_cards: CardDashboardId[]
  dashboard_personalizado: boolean
  /** Relatórios liberados. Ausente = banco ainda sem a migração de relatórios (todos liberados). */
  relatorios?: RelatorioId[]
  relatorios_personalizado?: boolean
  telas: Record<TelaId, PermissaoTela>
  /** Só em permissoes_usuario(): quem está logado pode alterar esse usuário. */
  pode_configurar?: boolean
}

/** Fechamento de comissão de um período (o "holerite" do profissional). */
export interface FechamentoComissao {
  id: string
  profissional_id: string
  inicio: string
  fim: string
  total_comissoes: number
  total_vales: number
  valor_pago: number
  observacao?: string | null
  usuario_id?: string | null
  created_at: string
  profissional?: { nome: string } | null
}

/** Vale (adiantamento) dado ao profissional, descontado no fechamento. */
export interface ValeProfissional {
  id: string
  profissional_id: string
  valor: number
  data: string
  descricao?: string | null
  status: 'aberto' | 'descontado'
  fechamento_id?: string | null
  gerado_por_fechamento?: string | null
  created_at: string
  profissional?: { nome: string } | null
}
