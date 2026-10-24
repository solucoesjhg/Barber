import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLoja } from '../hooks/useLoja'
import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  ShoppingCart, Wallet, Percent, Users, Package, Scissors, Calendar, AlertTriangle, Printer, Lock,
  Receipt, TrendingUp, UserCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { COLUNAS_PRODUTO } from '../lib/produtos'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import { intervaloMes, rotuloIntervalo, type Intervalo } from '../lib/periodo'
import { carregarNomesUsuarios } from '../lib/usuarios'
import { RELATORIOS } from '../lib/permissoes'
import { usePermissoes } from '../hooks/usePermissoes'
import { usePerfil } from '../hooks/usePerfil'
import { useAuth } from '../hooks/useAuth'
import FiltroPeriodo from '../components/ui/FiltroPeriodo'
import StatCard from '../components/ui/StatCard'
import VendaDetalheModal, { PAGAMENTO_LABEL } from '../components/VendaDetalheModal'
import VendasProfissionalModal, { type VendaDoProfissional } from '../components/relatorios/VendasProfissionalModal'
import type { RelatorioId } from '../types'

const ICONES: Record<RelatorioId, LucideIcon> = {
  vendas: ShoppingCart, caixa: Wallet, comissoes: Percent, clientes: Users,
  produtos: Package, profissionais: Scissors, agenda: Calendar,
}

const CATEGORIAS_PRODUTO: { id: string; label: string }[] = [
  { id: 'bebidas', label: 'Bebidas' }, { id: 'pomadas', label: 'Pomadas' },
  { id: 'petiscos', label: 'Petiscos' }, { id: 'outros', label: 'Outros' },
]
const STATUS_AGENDA: { id: string; label: string }[] = [
  { id: 'pendente', label: 'Pendente' }, { id: 'confirmado', label: 'Confirmado' },
  { id: 'em_atendimento', label: 'Em atendimento' }, { id: 'concluido', label: 'Concluído' },
  { id: 'cancelado', label: 'Cancelado' }, { id: 'nao_compareceu', label: 'Não compareceu' },
]
const MOVIMENTO_LABEL: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', perda: 'Perda',
  devolucao: 'Devolução', venda: 'Venda', inventario: 'Inventário',
}

interface LinhaVal { nome: string; total: number; qtd: number }

function Titulo({ children }: { children: string }) {
  return <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--c-77)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 8px' }}>{children}</p>
}

/**
 * Tabela de relatório: as primeiras colunas (texto, padrão 1) são nomes,
 * as demais são números (alinhados à direita). total: linha de
 * totalização no fim. aoClicar: a linha vira clicável.
 */
function Tabela({ colunas, linhas, vazio, total, texto = 1, aoClicar, dica }: {
  colunas: string[]
  linhas: (string | number)[][]
  vazio: string
  total?: (string | number)[]
  texto?: number
  aoClicar?: (indice: number) => void
  dica?: string
}) {
  const grade = ['minmax(180px, 1fr)', texto > 1 && `repeat(${texto - 1}, minmax(110px, 1fr))`, `repeat(${colunas.length - texto}, minmax(84px, 130px))`].filter(Boolean).join(' ')
  const larguraMin = `${200 + (texto - 1) * 130 + (colunas.length - texto) * 100}px`
  const celula = (v: string | number, j: number, destaque: boolean) => (
    <span key={j} className={j >= texto ? 'valor-num' : 'texto-cortado'} style={{
      color: j === 0 || destaque ? 'var(--c-fff)' : 'var(--c-a3)', fontWeight: j === 0 || destaque ? 500 : 400,
      textAlign: j >= texto ? 'right' : 'left', minWidth: 0,
    }}>
      {j > 0 && <b className="mobile-only-label">{colunas[j]}: </b>}{v}
    </span>
  )
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="list-header" style={{
        display: 'grid', minWidth: larguraMin, gridTemplateColumns: grade, gap: '12px',
        padding: '10px 20px', borderBottom: '1px solid var(--c-22)',
        fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
        background: 'var(--header-bg)',
      }}>
        {colunas.map((c, j) => <span key={c + j} style={{ textAlign: j >= texto ? 'right' : 'left' }}>{c}</span>)}
      </div>
      {linhas.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>{vazio}</div>
      ) : (
        <>
          {linhas.map((l, i) => (
            <div key={i} className={`list-row${aoClicar ? ' clicavel' : ''}`} onClick={aoClicar ? () => aoClicar(i) : undefined} title={aoClicar ? dica : undefined} style={{
              display: 'grid', minWidth: larguraMin, gridTemplateColumns: grade, gap: '12px',
              padding: '10px 20px', alignItems: 'center',
              borderBottom: i < linhas.length - 1 || total ? '1px solid var(--c-1a)' : 'none',
              fontSize: '13px',
            }}>
              {l.map((v, j) => celula(v, j, false))}
            </div>
          ))}
          {total && (
            <div className="list-row list-total" style={{
              display: 'grid', minWidth: larguraMin, gridTemplateColumns: grade, gap: '12px',
              padding: '11px 20px', alignItems: 'center', fontSize: '13px',
            }}>
              {total.map((v, j) => celula(v, j, true))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function Relatorios() {
  const { podeVerRelatorio, verVendasOutros } = usePermissoes()
  const { controlaEstoqueMinimo } = useLoja()
  const { profissionalId: meuProfissional } = usePerfil()
  const { user } = useAuth()
  // Quem não vê as vendas dos outros vê só os próprios números (o banco já
  // limita as vendas; aqui também filtra itens/agenda/comissões do
  // profissional dele, já que uma venda pode ter itens de outros).
  const restrito = !verVendasOutros
  const abas = RELATORIOS.filter(r => podeVerRelatorio(r.id))

  const [abaEscolhida, setAbaEscolhida] = useState<RelatorioId>('vendas')
  const aba = abas.some(a => a.id === abaEscolhida) ? abaEscolhida : abas[0]?.id
  const [periodo, setPeriodo] = useState<Intervalo>(() => intervaloMes())
  const { inicio, fim } = periodo
  const [loading, setLoading] = useState(true)

  const [itensVenda, setItensVenda] = useState<any[]>([])
  const [sessoesCaixa, setSessoesCaixa] = useState<any[]>([])
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({})
  const [comissoesPeriodo, setComissoesPeriodo] = useState<any[]>([])
  const [clientes, setClientes] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [movimentacoes, setMovimentacoes] = useState<any[]>([])
  const [agendamentos, setAgendamentos] = useState<any[]>([])
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([])

  // Filtros específicos por aba
  const [filtroProfissionalId, setFiltroProfissionalId] = useState('')
  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroStatusAgenda, setFiltroStatusAgenda] = useState('')
  const [buscaCliente, setBuscaCliente] = useState('')
  const [vendaAbertaId, setVendaAbertaId] = useState<string | null>(null)
  const [funcionarioAberto, setFuncionarioAberto] = useState<{ id: string; nome: string } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const inicioTS = `${inicio}T00:00:00`
    const fimTS = `${fim}T23:59:59`

    const [
      itensFiltrados,
      { data: sessoes },
      { data: comissoes },
      { data: cli },
      { data: prod },
      { data: movs },
      { data: agend },
      { data: profs },
      nomes,
    ] = await Promise.all([
      supabase.from('itens_comanda')
        .select('tipo, nome, referencia_id, preco_unitario, quantidade, profissional_id, profissional:profissionais(nome), comanda:comandas!inner(id, data, status, forma_pagamento, parcelas, taxa_percentual, acrescimo, total, desconto, cliente_id, cliente_nome, pagamentos:comanda_pagamentos(forma, valor))')
        .eq('comanda.status', 'fechada').gte('comanda.data', inicio).lte('comanda.data', fim),
      supabase.from('sessoes_caixa').select('*').gte('aberto_em', inicioTS).lte('aberto_em', fimTS).order('aberto_em', { ascending: false }),
      supabase.from('comissoes').select('*, profissional:profissionais(nome), item:itens_comanda(nome, quantidade), comanda:comandas(id, data, cliente_nome, total, forma_pagamento, parcelas)').neq('status', 'cancelada').gte('created_at', inicioTS).lte('created_at', fimTS),
      supabase.from('clientes').select('*'),
      supabase.from('produtos').select(COLUNAS_PRODUTO),
      supabase.from('movimentacoes_estoque').select('*, produto:produtos(nome)').gte('created_at', inicioTS).lte('created_at', fimTS).order('created_at', { ascending: false }).limit(100),
      supabase.from('agendamentos').select('status, profissional_id, profissional:profissionais(nome), servico:servicos(nome)').gte('data_hora', inicioTS).lte('data_hora', fimTS),
      supabase.from('profissionais').select('id, nome').order('nome'),
      carregarNomesUsuarios(),
    ])

    // Se o filtro pela venda (comandas!inner) não for aceito, busca sem ele
    // e filtra aqui — o relatório nunca fica vazio por causa disso.
    let itens = itensFiltrados.data
    if (itensFiltrados.error) {
      const r = await supabase.from('itens_comanda')
        .select('tipo, nome, referencia_id, preco_unitario, quantidade, profissional_id, profissional:profissionais(nome), comanda:comandas(id, data, status, forma_pagamento, parcelas, taxa_percentual, acrescimo, cliente_id, cliente_nome)')
      itens = r.data as typeof itens
    }
    setItensVenda((itens ?? []).filter((i: any) => i.comanda?.status === 'fechada' && i.comanda?.data >= inicio && i.comanda?.data <= fim))
    setSessoesCaixa((sessoes ?? []) as any[])
    setComissoesPeriodo((comissoes ?? []) as any[])
    setClientes((cli ?? []) as any[])
    setProdutos((prod ?? []) as any[])
    setMovimentacoes((movs ?? []) as any[])
    setAgendamentos((agend ?? []) as any[])
    setProfissionais((profs ?? []) as { id: string; nome: string }[])
    setNomesUsuarios(nomes)
    setLoading(false)
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  // ── Escopo: restrito vê só o que é dele ───────────────────
  const soMeu = restrito && !!meuProfissional
  const profFiltro = soMeu ? meuProfissional : filtroProfissionalId

  // ── Filtros aplicados ──────────────────────────────────────
  const itensVendaFiltrados = itensVenda.filter((i: any) =>
    (!profFiltro || i.profissional_id === profFiltro) &&
    (!filtroFormaPagamento || i.comanda?.forma_pagamento === filtroFormaPagamento
      || (i.comanda?.pagamentos ?? []).some((pg: any) => pg.forma === filtroFormaPagamento))
  )
  const comissoesFiltradas = comissoesPeriodo.filter((c: any) =>
    (restrito ? (c.profissional_id === meuProfissional && !!meuProfissional) || c.usuario_id === user?.id : true) &&
    (!filtroProfissionalId || restrito || c.profissional_id === filtroProfissionalId)
  )
  const produtosFiltrados = produtos.filter((p: any) => !filtroCategoria || p.categoria === filtroCategoria)
  const agendamentosFiltrados = agendamentos.filter((a: any) =>
    (!profFiltro || a.profissional_id === profFiltro) &&
    (!filtroStatusAgenda || a.status === filtroStatusAgenda)
  )
  const formasPagamentoDisponiveis = [...new Set(itensVenda.map((i: any) => i.comanda?.forma_pagamento).filter(Boolean))] as string[]
  const nomeForma = (f: string) => PAGAMENTO_LABEL[f] ?? f

  // ── Agregações de vendas ──────────────────────────────────
  const comandaMap = new Map<string, { total: number; taxa: number; forma_pagamento: string; cliente_nome: string; pagamentos: { forma: string; valor: number }[] }>()
  const porServico: Record<string, LinhaVal> = {}
  const porProduto: Record<string, LinhaVal> = {}
  // Por profissional: faturamento dos itens dele e atendimentos = vendas distintas em que atendeu.
  const porProfissional: Record<string, { nome: string; total: number; vendas: Set<string>; servicos: number }> = {}
  itensVendaFiltrados.forEach((i: any) => {
    // Com desconto na venda, cada item vale proporcionalmente menos.
    const totalVenda = Number(i.comanda?.total ?? 0)
    const descontoVenda = Number(i.comanda?.desconto ?? 0)
    const fator = descontoVenda > 0 && totalVenda + descontoVenda > 0 ? totalVenda / (totalVenda + descontoVenda) : 1
    const valor = i.preco_unitario * i.quantidade * fator
    const cId = i.comanda?.id
    if (cId) {
      const ex = comandaMap.get(cId) ?? { total: 0, taxa: 0, forma_pagamento: i.comanda.forma_pagamento ?? '—', cliente_nome: i.comanda.cliente_nome ?? 'Balcão', pagamentos: i.comanda.pagamentos ?? [] }
      ex.total += valor
      // Taxa da maquininha proporcional ao item (com filtro de profissional, só a parte dele).
      // Taxa repassada ao cliente não custa nada para a loja.
      if (!(Number(i.comanda.acrescimo ?? 0) > 0)) ex.taxa += valor * Number(i.comanda.taxa_percentual ?? 0) / 100
      comandaMap.set(cId, ex)
    }
    const alvo = i.tipo === 'servico' ? porServico : porProduto
    if (!alvo[i.nome]) alvo[i.nome] = { nome: i.nome, total: 0, qtd: 0 }
    alvo[i.nome].total += valor
    alvo[i.nome].qtd += i.quantidade
    if (i.profissional_id) {
      const chave = i.profissional_id as string
      if (!porProfissional[chave]) porProfissional[chave] = { nome: i.profissional?.nome ?? '—', total: 0, vendas: new Set(), servicos: 0 }
      porProfissional[chave].total += valor
      if (cId) porProfissional[chave].vendas.add(cId)
      if (i.tipo === 'servico') porProfissional[chave].servicos += i.quantidade
    }
  })
  const totalVendido = [...comandaMap.values()].reduce((s, c) => s + c.total, 0)
  const numVendas = comandaMap.size
  const totalTaxas = [...comandaMap.values()].reduce((s, c) => s + c.taxa, 0)
  const ticketMedio = numVendas > 0 ? totalVendido / numVendas : 0
  const porFormaPagamento: Record<string, LinhaVal> = {}
  const porCliente: Record<string, LinhaVal> = {}
  comandaMap.forEach(c => {
    // Venda paga em mais de uma forma: o total se divide entre elas.
    const partes = c.pagamentos.length > 1
      ? c.pagamentos.map(pg => ({ forma: pg.forma, peso: Number(pg.valor) }))
      : [{ forma: c.forma_pagamento, peso: 1 }]
    const somaPesos = partes.reduce((s, pt) => s + pt.peso, 0) || 1
    partes.forEach(pt => {
      if (!porFormaPagamento[pt.forma]) porFormaPagamento[pt.forma] = { nome: nomeForma(pt.forma), total: 0, qtd: 0 }
      porFormaPagamento[pt.forma].total += c.total * pt.peso / somaPesos
      porFormaPagamento[pt.forma].qtd += 1
    })
    if (!porCliente[c.cliente_nome]) porCliente[c.cliente_nome] = { nome: c.cliente_nome, total: 0, qtd: 0 }
    porCliente[c.cliente_nome].total += c.total
    porCliente[c.cliente_nome].qtd += 1
  })
  const ordenar = (rec: Record<string, LinhaVal>) => Object.values(rec).sort((a, b) => b.total - a.total)
  const soma = (l: LinhaVal[]) => ({ total: l.reduce((s, x) => s + x.total, 0), qtd: l.reduce((s, x) => s + x.qtd, 0) })

  // ── Caixa ──────────────────────────────────────────────────
  const totalInicial = sessoesCaixa.reduce((s, x) => s + Number(x.valor_inicial ?? 0), 0)
  const totalEsperado = sessoesCaixa.reduce((s, x) => s + Number(x.saldo_esperado ?? 0), 0)
  const totalInformado = sessoesCaixa.reduce((s, x) => s + Number(x.valor_informado ?? 0), 0)
  const totalEntradasCaixa = sessoesCaixa.reduce((s, x) => s + (x.saldo_esperado != null ? (x.saldo_esperado - x.valor_inicial) : 0), 0)
  const totalDiferencas = sessoesCaixa.reduce((s, x) => s + (x.diferenca ?? 0), 0)

  // ── Comissões (só as que valem: tiradas da venda não entram) ─
  const comissaoPorPessoa: Record<string, { nome: string; vendas: Set<string>; base: number; comissao: number }> = {}
  comissoesFiltradas.forEach((c: any) => {
    const chave = c.profissional_id ? `p:${c.profissional_id}` : `u:${c.usuario_id}`
    const nome = c.profissional?.nome ?? (c.usuario_id ? `${nomesUsuarios[c.usuario_id] ?? 'Usuário'} (venda)` : '—')
    if (!comissaoPorPessoa[chave]) comissaoPorPessoa[chave] = { nome, vendas: new Set(), base: 0, comissao: 0 }
    comissaoPorPessoa[chave].base += Number(c.valor_base)
    comissaoPorPessoa[chave].comissao += Number(c.valor_comissao)
    if (c.comanda_id) comissaoPorPessoa[chave].vendas.add(c.comanda_id)
  })
  const linhasComissao = Object.values(comissaoPorPessoa).sort((a, b) => b.comissao - a.comissao)
  const totalComissoes = linhasComissao.reduce((s, c) => s + c.comissao, 0)
  const totalBaseComissoes = linhasComissao.reduce((s, c) => s + c.base, 0)
  const vendasComComissao = new Set(comissoesFiltradas.map((c: any) => c.comanda_id).filter(Boolean)).size
  // Uma linha por comissão, da mais recente para a mais antiga.
  const comissoesDetalhadas = [...comissoesFiltradas].sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
  const nomeQuem = (c: any) => c.profissional?.nome ?? (c.usuario_id ? `${nomesUsuarios[c.usuario_id] ?? 'Usuário'} (venda)` : '—')

  // ── Clientes ─────────────────────────────────────────────
  const novosClientes = clientes.filter(c => c.created_at.slice(0, 10) >= inicio && c.created_at.slice(0, 10) <= fim).length
  const clientesAtivos = clientes.filter(c => c.ativo).length
  const clientesInativos = clientes.filter(c => !c.ativo).length
  const porClienteFiltrado = ordenar(porCliente).filter(c => c.nome.toLowerCase().includes(buscaCliente.toLowerCase()))

  // ── Produtos ─────────────────────────────────────────────
  const estoqueBaixo = controlaEstoqueMinimo ? produtosFiltrados.filter(p => p.estoque_atual <= p.estoque_minimo && p.ativo) : []
  const idsVendidos = new Set(itensVenda.filter((i: any) => i.tipo === 'produto').map((i: any) => i.referencia_id))
  const produtosSemVenda = produtosFiltrados.filter(p => p.ativo && !idsVendidos.has(p.id))
  const categoriaDoProduto = new Map(produtos.map((p: any) => [p.nome, p.categoria]))
  const vendidosFiltrados = ordenar(porProduto).filter(l => !filtroCategoria || categoriaDoProduto.get(l.nome) === filtroCategoria)

  // ── Funcionários (vendas + comissão de cada profissional) ─
  const comissaoPorProfissional: Record<string, number> = {}
  comissoesFiltradas.forEach((c: any) => {
    if (c.profissional_id) comissaoPorProfissional[c.profissional_id] = (comissaoPorProfissional[c.profissional_id] ?? 0) + Number(c.valor_comissao)
  })
  const idsFuncionarios = new Set([...Object.keys(porProfissional), ...Object.keys(comissaoPorProfissional)])
  const relatorioProfissionais = [...idsFuncionarios].map(id => {
    const v = porProfissional[id]
    const nome = v?.nome ?? profissionais.find(p => p.id === id)?.nome ?? '—'
    const atendimentos = v?.vendas.size ?? 0
    const faturamento = v?.total ?? 0
    return { id, nome, atendimentos, servicos: v?.servicos ?? 0, faturamento, comissao: comissaoPorProfissional[id] ?? 0, ticketMedio: atendimentos > 0 ? faturamento / atendimentos : 0 }
  })
    .filter(p => !profFiltro || p.id === profFiltro)
    .sort((a, b) => b.faturamento - a.faturamento)
  // Vendas que formam os números de um profissional (clique na linha).
  function vendasDoProfissional(id: string): VendaDoProfissional[] {
    const porVenda = new Map<string, VendaDoProfissional>()
    // Mesmos itens que somam a linha do relatório (com os mesmos filtros).
    itensVendaFiltrados.forEach((i: any) => {
      if (i.profissional_id !== id || !i.comanda?.id) return
      const v = porVenda.get(i.comanda.id) ?? {
        comandaId: i.comanda.id, data: i.comanda.data, cliente: i.comanda.cliente_nome || 'Balcão', itens: '', valor: 0, comissao: 0,
      }
      v.itens = [v.itens, i.quantidade > 1 ? `${i.nome} ×${i.quantidade}` : i.nome].filter(Boolean).join(', ')
      v.valor += i.preco_unitario * i.quantidade
      porVenda.set(i.comanda.id, v)
    })
    comissoesFiltradas.forEach((c: any) => {
      if (c.profissional_id !== id || !c.comanda_id) return
      const v = porVenda.get(c.comanda_id)
      if (v) v.comissao += Number(c.valor_comissao)
    })
    return [...porVenda.values()].sort((a, b) => b.data.localeCompare(a.data))
  }

  const totFunc = relatorioProfissionais.reduce((s, p) => ({
    atendimentos: s.atendimentos + p.atendimentos, servicos: s.servicos + p.servicos,
    faturamento: s.faturamento + p.faturamento, comissao: s.comissao + p.comissao,
  }), { atendimentos: 0, servicos: 0, faturamento: 0, comissao: 0 })

  // ── Agenda ───────────────────────────────────────────────
  const totalAgend = agendamentosFiltrados.length
  const concluidos = agendamentosFiltrados.filter((a: any) => a.status === 'concluido').length
  const cancelados = agendamentosFiltrados.filter((a: any) => a.status === 'cancelado').length
  const naoCompareceu = agendamentosFiltrados.filter((a: any) => a.status === 'nao_compareceu').length
  const finalizados = concluidos + cancelados + naoCompareceu
  const taxaComparecimento = finalizados > 0 ? (concluidos / finalizados) * 100 : 0
  const agendaPorProf: Record<string, { nome: string; total: number; concluidos: number; cancelados: number }> = {}
  agendamentosFiltrados.forEach((a: any) => {
    const nome = a.profissional?.nome ?? '—'
    if (!agendaPorProf[nome]) agendaPorProf[nome] = { nome, total: 0, concluidos: 0, cancelados: 0 }
    agendaPorProf[nome].total += 1
    if (a.status === 'concluido') agendaPorProf[nome].concluidos += 1
    if (a.status === 'cancelado' || a.status === 'nao_compareceu') agendaPorProf[nome].cancelados += 1
  })
  const linhasAgenda = Object.values(agendaPorProf).sort((a, b) => b.total - a.total)

  const mostraFiltroProf = !restrito && (aba === 'vendas' || aba === 'comissoes' || aba === 'profissionais' || aba === 'agenda')
  const tituloAba = useMemo(() => RELATORIOS.find(r => r.id === aba)?.label ?? '', [aba])

  if (abas.length === 0) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '80px' }}>
        <Lock size={22} style={{ color: 'var(--c-55)', marginBottom: '14px' }} />
        <h2 style={{ fontSize: '18px', color: 'var(--c-fff)', marginBottom: '10px' }}>Nenhum relatório liberado</h2>
        <p style={{ fontSize: '13px', color: 'var(--c-a3)' }}>Peça ao gerente ou administrador para liberar os relatórios em Usuários → Permissões.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Relatórios</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {tituloAba} · {rotuloIntervalo(periodo)}{soMeu ? ' · só os seus números' : restrito ? ' · só as vendas registradas por você' : ''}
          </p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <FiltroPeriodo valor={periodo} onChange={v => v && setPeriodo(v)} />
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}>
            <Printer size={13} /> Imprimir / PDF
          </button>
        </div>
      </div>

      <RelatoriosEstilos />

      <div className="no-print pilulas" role="tablist" style={{ marginBottom: '14px' }}>
        {abas.map(a => {
          const Icon = ICONES[a.id]
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              className={`pilula${aba === a.id ? ' ativa' : ''}`}
              onClick={() => setAbaEscolhida(a.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Icon size={12} /> {a.label}
            </button>
          )
        })}
      </div>

      {/* Filtros específicos da aba */}
      <div className="no-print barra-filtros">
        {mostraFiltroProf && (
          <select className="filtro-select" aria-label="Profissional" value={filtroProfissionalId} onChange={e => setFiltroProfissionalId(e.target.value)}>
            <option value="">Todos os profissionais</option>
            {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
        {aba === 'vendas' && (
          <select className="filtro-select" aria-label="Forma de pagamento" value={filtroFormaPagamento} onChange={e => setFiltroFormaPagamento(e.target.value)}>
            <option value="">Todas as formas de pagamento</option>
            {formasPagamentoDisponiveis.map(f => <option key={f} value={f}>{nomeForma(f)}</option>)}
          </select>
        )}
        {aba === 'clientes' && (
          <div className="filtro-busca">
            <Users size={13} />
            <input placeholder="Buscar cliente..." value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)} />
          </div>
        )}
        {aba === 'produtos' && (
          <select className="filtro-select" aria-label="Categoria" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_PRODUTO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        {aba === 'agenda' && (
          <select className="filtro-select" aria-label="Status" value={filtroStatusAgenda} onChange={e => setFiltroStatusAgenda(e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_AGENDA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div id="area-impressao" key={aba} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

            {aba === 'vendas' && (() => {
              const formas = ordenar(porFormaPagamento)
              const profs = Object.values(porProfissional).sort((a, b) => b.total - a.total)
              const servs = ordenar(porServico)
              const prods = ordenar(porProduto)
              const clis = ordenar(porCliente)
              return (
                <>
                  <div className="stat-grid-auto">
                    <StatCard rotulo="Total vendido" icone={TrendingUp} valor={formatCurrency(totalVendido)} />
                    <StatCard rotulo="Vendas" icone={Receipt} valor={String(numVendas)} />
                    <StatCard rotulo="Taxas de cartão" icone={Wallet} valor={formatCurrency(totalTaxas)} sub={`Líquido ${formatCurrency(totalVendido - totalTaxas)}`} />
                    <StatCard rotulo="Ticket médio" icone={ShoppingCart} valor={formatCurrency(ticketMedio)} />
                    <StatCard rotulo="Serviços / Produtos" icone={Scissors} valor={`${soma(servs).qtd} / ${soma(prods).qtd}`} sub={`${formatCurrency(soma(servs).total)} · ${formatCurrency(soma(prods).total)}`} />
                  </div>
                  <Titulo>Por forma de pagamento</Titulo>
                  <Tabela colunas={['Forma', 'Vendas', 'Total']} vazio="Sem vendas no período."
                    linhas={formas.map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                    total={['Total', soma(formas).qtd, formatCurrency(soma(formas).total)]} />
                  <Titulo>Por profissional</Titulo>
                  <Tabela colunas={['Profissional', 'Atendimentos', 'Faturamento']} vazio="Sem vendas no período."
                    linhas={profs.map(p => [p.nome, p.vendas.size, formatCurrency(p.total)])}
                    total={['Total', profs.reduce((s, p) => s + p.vendas.size, 0), formatCurrency(profs.reduce((s, p) => s + p.total, 0))]} />
                  <Titulo>Serviços</Titulo>
                  <Tabela colunas={['Serviço', 'Qtd', 'Total']} vazio="Sem serviços no período."
                    linhas={servs.map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                    total={['Total', soma(servs).qtd, formatCurrency(soma(servs).total)]} />
                  <Titulo>Produtos</Titulo>
                  <Tabela colunas={['Produto', 'Qtd', 'Total']} vazio="Sem produtos no período."
                    linhas={prods.map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                    total={['Total', soma(prods).qtd, formatCurrency(soma(prods).total)]} />
                  <Titulo>Top 15 clientes</Titulo>
                  <Tabela colunas={['Cliente', 'Compras', 'Total gasto']} vazio="Sem vendas no período."
                    linhas={clis.slice(0, 15).map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                    total={[clis.length > 15 ? `Total (${clis.length} clientes)` : 'Total', soma(clis).qtd, formatCurrency(soma(clis).total)]} />
                </>
              )
            })()}

            {aba === 'caixa' && (
              <>
                <div className="stat-grid-auto">
                  <StatCard rotulo="Sessões" icone={Wallet} valor={String(sessoesCaixa.length)} />
                  <StatCard rotulo="Entradas líquidas" icone={TrendingUp} valor={formatCurrency(totalEntradasCaixa)} />
                  <StatCard rotulo="Soma das diferenças" icone={AlertTriangle} valor={formatCurrency(totalDiferencas)} />
                </div>
                {sessoesCaixa.some(s => Math.abs(s.diferenca ?? 0) > 0) && (
                  <div className="aviso-info" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <AlertTriangle size={13} /> Há sessões fechadas com diferença entre o valor esperado e o contado.
                  </div>
                )}
                <Tabela
                  colunas={['Operador', 'Aberto em', 'Inicial', 'Esperado', 'Informado', 'Diferença', 'Status']}
                  vazio="Nenhuma sessão de caixa no período."
                  linhas={sessoesCaixa.map(s => [
                    nomesUsuarios[s.usuario_id] ?? s.usuario_id.slice(0, 8),
                    formatDateTime(s.aberto_em),
                    formatCurrency(s.valor_inicial),
                    s.saldo_esperado != null ? formatCurrency(s.saldo_esperado) : '—',
                    s.valor_informado != null ? formatCurrency(s.valor_informado) : '—',
                    s.diferenca != null ? formatCurrency(s.diferenca) : '—',
                    s.status === 'aberto' ? 'Aberto' : /automaticamente/i.test(s.observacao_fechamento ?? '') ? 'Fechado (auto)' : 'Fechado',
                  ])}
                  total={['Total', `${sessoesCaixa.length} sessões`, formatCurrency(totalInicial), formatCurrency(totalEsperado), formatCurrency(totalInformado), formatCurrency(totalDiferencas), '']}
                />
              </>
            )}

            {aba === 'comissoes' && (
              <>
                <div className="stat-grid-auto">
                  <StatCard rotulo="Comissões" icone={Percent} valor={formatCurrency(totalComissoes)} />
                  <StatCard rotulo="Vendas com comissão" icone={Receipt} valor={String(vendasComComissao)} />
                  <StatCard rotulo="Base de cálculo" icone={Wallet} valor={formatCurrency(totalBaseComissoes)} />
                </div>
                <Tabela
                  colunas={['Quem', 'Vendas', 'Base', 'Comissão']}
                  vazio="Nenhuma comissão no período."
                  linhas={linhasComissao.map(c => [c.nome, c.vendas.size, formatCurrency(c.base), formatCurrency(c.comissao)])}
                  total={['Total', vendasComComissao, formatCurrency(totalBaseComissoes), formatCurrency(totalComissoes)]}
                />
                <Titulo>Comissões detalhadas</Titulo>
                <Tabela
                  colunas={['Venda', 'Data', 'Item', 'Quem', 'Taxa', 'Base', '%', 'Comissão']}
                  texto={4}
                  vazio="Nenhuma comissão no período."
                  linhas={comissoesDetalhadas.map((c: any) => [
                    c.comanda ? c.comanda.cliente_nome || 'Balcão' : '—',
                    formatDate(c.comanda?.data ?? c.created_at),
                    c.item ? (Number(c.item.quantidade) > 1 ? `${c.item.nome} ×${Number(c.item.quantidade)}` : c.item.nome) : 'Total da venda',
                    nomeQuem(c),
                    Number(c.taxa_valor ?? 0) > 0 ? `−${formatCurrency(Number(c.taxa_valor))}` : '—',
                    formatCurrency(Number(c.valor_base)),
                    `${Number(c.percentual)}%`,
                    formatCurrency(Number(c.valor_comissao)),
                  ])}
                  total={[`${comissoesDetalhadas.length} comissões`, '', '', '', `−${formatCurrency(comissoesDetalhadas.reduce((s: number, c: any) => s + Number(c.taxa_valor ?? 0), 0))}`, formatCurrency(totalBaseComissoes), '', formatCurrency(totalComissoes)]}
                  aoClicar={i => { const id = comissoesDetalhadas[i].comanda_id; if (id) setVendaAbertaId(id) }}
                  dica="Ver a venda desta comissão"
                />
              </>
            )}

            {aba === 'clientes' && (
              <>
                <div className="stat-grid-auto">
                  <StatCard rotulo="Novos no período" icone={Users} valor={String(novosClientes)} />
                  <StatCard rotulo="Ativos" icone={UserCheck} valor={String(clientesAtivos)} />
                  <StatCard rotulo="Inativos" icone={Users} valor={String(clientesInativos)} />
                  <StatCard rotulo="Ticket médio" icone={ShoppingCart} valor={formatCurrency(ticketMedio)} />
                </div>
                <Titulo>Clientes que mais gastam no período</Titulo>
                <Tabela
                  colunas={['Cliente', 'Compras', 'Total gasto']}
                  vazio={buscaCliente ? 'Nenhum cliente encontrado.' : 'Sem vendas no período.'}
                  linhas={porClienteFiltrado.slice(0, 30).map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                  total={[porClienteFiltrado.length > 30 ? `Total (${porClienteFiltrado.length} clientes)` : 'Total', soma(porClienteFiltrado).qtd, formatCurrency(soma(porClienteFiltrado).total)]}
                />
              </>
            )}

            {aba === 'produtos' && (
              <>
                <div className="stat-grid-auto">
                  <StatCard rotulo="Vendidos (un.)" icone={Package} valor={String(soma(vendidosFiltrados).qtd)} sub={formatCurrency(soma(vendidosFiltrados).total)} />
                  {controlaEstoqueMinimo && <StatCard rotulo="Estoque baixo" icone={AlertTriangle} valor={String(estoqueBaixo.length)} />}
                  <StatCard rotulo="Sem venda no período" icone={Package} valor={String(produtosSemVenda.length)} />
                  <StatCard rotulo="Movimentações" icone={TrendingUp} valor={String(movimentacoes.length)} />
                </div>
                <Titulo>Mais vendidos</Titulo>
                <Tabela colunas={['Produto', 'Qtd', 'Total']} vazio="Sem vendas no período."
                  linhas={vendidosFiltrados.map(f => [f.nome, f.qtd, formatCurrency(f.total)])}
                  total={['Total', soma(vendidosFiltrados).qtd, formatCurrency(soma(vendidosFiltrados).total)]} />
                {controlaEstoqueMinimo && (
                  <>
                    <Titulo>Estoque baixo</Titulo>
                    <Tabela colunas={['Produto', 'Atual', 'Mínimo']} vazio="Nenhum produto abaixo do mínimo."
                      linhas={estoqueBaixo.map(p => [p.nome, p.estoque_atual, p.estoque_minimo])}
                      total={[`${estoqueBaixo.length} produtos`, estoqueBaixo.reduce((s, p) => s + Number(p.estoque_atual), 0), estoqueBaixo.reduce((s, p) => s + Number(p.estoque_minimo), 0)]} />
                  </>
                )}
                <Titulo>Sem venda no período</Titulo>
                <Tabela colunas={['Produto', 'Estoque atual']} vazio="Todos os produtos ativos venderam no período."
                  linhas={produtosSemVenda.map(p => [p.nome, p.estoque_atual])}
                  total={[`${produtosSemVenda.length} produtos`, produtosSemVenda.reduce((s, p) => s + Number(p.estoque_atual), 0)]} />
                <Titulo>Movimentações recentes</Titulo>
                <Tabela colunas={['Produto', 'Tipo', 'Qtd', 'Quando']} vazio="Nenhuma movimentação no período."
                  linhas={movimentacoes.slice(0, 20).map((m: any) => [m.produto?.nome ?? '—', MOVIMENTO_LABEL[m.tipo] ?? m.tipo, m.quantidade, formatDate(m.created_at)])} />
              </>
            )}

            {aba === 'profissionais' && (
              <>
                <div className="stat-grid-auto">
                  <StatCard rotulo="Faturamento" icone={TrendingUp} valor={formatCurrency(totFunc.faturamento)} />
                  <StatCard rotulo="Comissão" icone={Percent} valor={formatCurrency(totFunc.comissao)} />
                  <StatCard rotulo="Atendimentos" icone={UserCheck} valor={String(totFunc.atendimentos)} sub={`${totFunc.servicos} serviços`} />
                  <StatCard rotulo="Ticket médio" icone={Receipt} valor={formatCurrency(totFunc.atendimentos > 0 ? totFunc.faturamento / totFunc.atendimentos : 0)} />
                </div>
                <Tabela
                  colunas={['Profissional', 'Atendimentos', 'Serviços', 'Faturamento', 'Comissão', 'Ticket médio']}
                  vazio="Sem dados no período."
                  linhas={relatorioProfissionais.map(p => [p.nome, p.atendimentos, p.servicos, formatCurrency(p.faturamento), formatCurrency(p.comissao), formatCurrency(p.ticketMedio)])}
                  total={['Total', totFunc.atendimentos, totFunc.servicos, formatCurrency(totFunc.faturamento), formatCurrency(totFunc.comissao), formatCurrency(totFunc.atendimentos > 0 ? totFunc.faturamento / totFunc.atendimentos : 0)]}
                  aoClicar={i => setFuncionarioAberto({ id: relatorioProfissionais[i].id, nome: relatorioProfissionais[i].nome })}
                  dica="Ver as vendas deste profissional"
                />
              </>
            )}

            {aba === 'agenda' && (
              <>
                <div className="stat-grid-auto">
                  <StatCard rotulo="Agendamentos" icone={Calendar} valor={String(totalAgend)} />
                  <StatCard rotulo="Concluídos" icone={UserCheck} valor={String(concluidos)} />
                  <StatCard rotulo="Cancelados / Faltas" icone={AlertTriangle} valor={String(cancelados + naoCompareceu)} />
                  <StatCard rotulo="Comparecimento" icone={TrendingUp} valor={`${taxaComparecimento.toFixed(0)}%`} />
                </div>
                <Tabela
                  colunas={['Profissional', 'Total', 'Concluídos', 'Cancelados/Faltas']}
                  vazio="Sem agendamentos no período."
                  linhas={linhasAgenda.map(p => [p.nome, p.total, p.concluidos, p.cancelados])}
                  total={['Total', totalAgend, concluidos, cancelados + naoCompareceu]}
                />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <AnimatePresence>
        {funcionarioAberto && (
          <VendasProfissionalModal
            nome={funcionarioAberto.nome}
            periodo={rotuloIntervalo(periodo)}
            vendas={vendasDoProfissional(funcionarioAberto.id)}
            onAbrirVenda={setVendaAbertaId}
            onClose={() => setFuncionarioAberto(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {vendaAbertaId && (
          <VendaDetalheModal
            comandaId={vendaAbertaId}
            destacarProfissionalId={funcionarioAberto?.id ?? (soMeu ? meuProfissional : null)}
            onClose={() => setVendaAbertaId(null)}
            onAlterado={carregar}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function RelatoriosEstilos() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        aside, header { display: none !important; }
        body * { visibility: hidden; }
        #area-impressao, #area-impressao * { visibility: visible; }
        #area-impressao { position: absolute; inset: 0; margin: 0; padding: 12px; }
      }
    `}</style>
  )
}
