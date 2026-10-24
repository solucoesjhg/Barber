import { useState, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useLoja } from '../hooks/useLoja'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, X, Check, Search, Scissors, Package, ScanLine, ArrowLeft, CalendarDays, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import { intervaloMes, rotuloIntervalo, type Intervalo } from '../lib/periodo'
import { carregarNomesUsuarios } from '../lib/usuarios'
import ScannerCamera from '../components/ScannerCamera'
import VendaDetalheModal, { type VendaParaEditar } from '../components/VendaDetalheModal'
import PagamentoTaxa from '../components/PagamentoTaxa'
import AbrirCaixaRapido, { ehErroSemCaixa } from '../components/AbrirCaixaRapido'
import { calcularCobranca, carregarTaxas, maquininhaObrigatoria, percentualTaxa, rotuloPagamento, TAXAS_VAZIAS, type TaxasLoja } from '../lib/taxas'
import FiltroPeriodo from '../components/ui/FiltroPeriodo'
import Checkbox from '../components/ui/Checkbox'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { usePerfil } from '../hooks/usePerfil'
import { usePermissoes } from '../hooks/usePermissoes'
import { useSelecao } from '../hooks/useSelecao'
import { COLUNAS_PRODUTO } from '../lib/produtos'
import type { Agendamento, Comanda, ItemComanda, PagamentoMetodo, Produto, Profissional, Servico } from '../types'

const PAGAMENTOS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix',      label: 'Pix'            },
  { id: 'credito',  label: 'Cartão Crédito' },
  { id: 'debito',   label: 'Cartão Débito'  },
  { id: 'dinheiro', label: 'Dinheiro'       },
]

const STATUS_LABEL: Record<string, string> = { fechada: 'Fechada', cancelada: 'Cancelada', aberta: 'Aberta' }
const STATUS_CLASS: Record<string, string> = { fechada: 'badge badge-done', cancelada: 'badge badge-canceled', aberta: 'badge badge-pending' }

const COLUNAS_LISTA = '22px minmax(200px, 1fr) 150px 120px 84px 110px'

function uid() { return Math.random().toString(36).slice(2) }

// RPC que ainda não existe no banco (migração não aplicada).
function semFuncaoNoBanco(err: { code?: string; message?: string }) {
  return err.code === 'PGRST202' || /could not find the function/i.test(err.message ?? '')
}

type VendaLista = Comanda & {
  itens?: { profissional_id: string | null; preco_unitario: number; quantidade: number }[]
}

type ItemCatalogo =
  | { tipo: 'servico'; dado: Servico }
  | { tipo: 'produto'; dado: Produto }

interface OrigemAgenda { id: string; descricao: string; clienteId: string | null }


/** Quantos atalhos de produto/serviço a tela de venda mostra sem busca. */
const TOP_CATALOGO = 10

export default function Vendas() {
  const { podeEditar, verVendasOutros } = usePermissoes()
  const { controlaEstoqueMinimo } = useLoja()
  const { profissionalId: meuProfissional } = usePerfil()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const podeVender = podeEditar('pdv')
  // Quem edita Comissões pode vender/editar "sem comissão".
  const podeTirarComissao = podeEditar('comissoes')
  // Barbeiro com login próprio: vê as vendas em que atendeu (o banco
  // devolve só essas) e quanto foi nos itens dele.
  const modoProfissional = !verVendasOutros && !!meuProfissional
  const [modo, setModo] = useState<'lista' | 'nova' | 'editar'>('lista')
  const [vendas, setVendas] = useState<VendaLista[]>([])
  const [loadingVendas, setLoadingVendas] = useState(true)
  const [vendaSelecionadaId, setVendaSelecionadaId] = useState<string | null>(null)
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({})
  const [periodo, setPeriodo] = useState<Intervalo>(() => intervaloMes())
  const [buscaLista, setBuscaLista] = useState('')

  // O banco já só devolve as vendas que o usuário pode ver: todas (ver
  // vendas de outros), as que ele registrou e as que têm item dele.
  const carregarVendas = useCallback(() => {
    setLoadingVendas(true)
    supabase.from('comandas').select('*, itens:itens_comanda(profissional_id, preco_unitario, quantidade)')
      .gte('data', periodo.inicio).lte('data', periodo.fim)
      .order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => { setVendas((data ?? []) as VendaLista[]); setLoadingVendas(false) })
  }, [periodo])

  useEffect(() => { carregarVendas() }, [carregarVendas])
  useEffect(() => { carregarNomesUsuarios().then(setNomesUsuarios) }, [])

  const valorMeusItens = (v: VendaLista) => (v.itens ?? [])
    .filter(i => i.profissional_id === meuProfissional)
    .reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)

  const vendasFiltradas = useMemo(() => {
    const termo = buscaLista.trim().toLowerCase()
    return termo ? vendas.filter(v => (v.cliente_nome ?? 'Balcão').toLowerCase().includes(termo)) : vendas
  }, [vendas, buscaLista])
  const fechadas = vendasFiltradas.filter(v => v.status === 'fechada')
  const totalPeriodo = fechadas.reduce((s, v) => s + Number(v.total), 0)
  const totalMeusItens = fechadas.reduce((s, v) => s + valorMeusItens(v), 0)

  const selecao = useSelecao(vendasFiltradas.map(v => v.id))
  const selecionadas = vendasFiltradas.filter(v => selecao.tem(v.id))

  function nomeUsuarioVenda(usuarioId?: string): string {
    if (!usuarioId) return '—'
    return nomesUsuarios[usuarioId] ?? '—'
  }

  const [search, setSearch]   = useState('')
  const [servicos, setServicos] = useState<Servico[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [profissionalId, setProfissionalId] = useState('')
  // Usuário vinculado a um profissional: a venda já começa com ele.
  useEffect(() => { if (meuProfissional) setProfissionalId(p => p || meuProfissional) }, [meuProfissional])

  const [cart, setCart]           = useState<ItemComanda[]>([])
  const [clienteNome, setClienteNome] = useState('')
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')
  const [parcelas, setParcelas] = useState(1)
  const [maquininhaId, setMaquininhaId] = useState('')
  const [repassar, setRepassar] = useState(false)
  const [taxas, setTaxas] = useState<TaxasLoja>(TAXAS_VAZIAS)
  const [maisVendidos, setMaisVendidos] = useState<Record<string, number>>({})
  const [semComissao, setSemComissao] = useState(false)
  const [edicao, setEdicao] = useState<Comanda | null>(null)
  const [origemAgenda, setOrigemAgenda] = useState<OrigemAgenda | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [done, setDone]         = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [scanAviso, setScanAviso] = useState('')

  const total = cart.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)

  function carregarProdutos() {
    supabase.from('produtos').select(COLUNAS_PRODUTO).eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProdutos(data as unknown as Produto[]) })
  }

  useEffect(() => {
    supabase.from('servicos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setServicos(data as Servico[]) })
    carregarProdutos()
    supabase.from('profissionais').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
    carregarTaxas().then(setTaxas)
    supabase.rpc('mais_vendidos', { p_limite: TOP_CATALOGO }).then(({ data }) => {
      setMaisVendidos(Object.fromEntries(((data ?? []) as { tipo: string; referencia_id: string; quantidade: number }[])
        .map(m => [`${m.tipo}:${m.referencia_id}`, Number(m.quantidade)])))
    })
  }, [])

  // Venda aberta pela Agenda (/vendas?agendamento=<id>): já vem com o
  // cliente, o serviço e o profissional do atendimento. O parâmetro só sai
  // da URL depois de carregar (se a tela remontar no meio, carrega de novo).
  useEffect(() => {
    const agendamentoId = searchParams.get('agendamento')
    if (!agendamentoId) return
    let ativo = true
    const limparUrl = () => setSearchParams({}, { replace: true })
    if (!podeVender) { limparUrl(); setError('Seu usuário não tem permissão para registrar vendas.'); return }
    supabase.from('agendamentos').select('*, cliente:clientes(*), servico:servicos(*)').eq('id', agendamentoId).maybeSingle()
      .then(({ data, error: err }) => {
        if (!ativo) return
        limparUrl()
        if (err || !data) { setError('Agendamento não encontrado.'); return }
        const ag = data as Agendamento
        const quando = new Date(ag.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        setOrigemAgenda({ id: ag.id, descricao: `${ag.servico?.nome ?? 'Atendimento'} · ${quando}`, clienteId: ag.cliente_id ?? null })
        setClienteNome(ag.cliente?.nome ?? '')
        setProfissionalId(ag.profissional_id ?? '')
        setCart(ag.servico ? [{
          id: uid(), tipo: 'servico', referencia_id: ag.servico.id, nome: ag.servico.nome, quantidade: 1,
          preco_unitario: Number(ag.valor ?? (ag.servico.preco_na_venda ? 0 : ag.servico.preco)),
          preco_na_venda: !!ag.servico.preco_na_venda, profissional_id: ag.profissional_id ?? undefined,
        }] : [])
        setEdicao(null)
        setSemComissao(false)
        setError('')
        setModo('nova')
      })
    return () => { ativo = false }
  }, [searchParams, setSearchParams, podeVender])

  const servicosFiltrados = useMemo(() =>
    servicos.filter(s => s.nome.toLowerCase().includes(search.toLowerCase())),
    [servicos, search]
  )

  const produtosFiltrados = useMemo(() =>
    produtos.filter(p =>
      p.nome.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [produtos, search]
  )

  // Sem busca: só os 10 mais vendidos (completando com os outros, em
  // ordem alfabética, se a loja ainda vendeu pouco). Com busca: todos.
  const buscando = search.trim().length > 0
  const itensCatalogo = useMemo<ItemCatalogo[]>(() => {
    const s: ItemCatalogo[] = servicosFiltrados.map(dado => ({ tipo: 'servico', dado }))
    const p: ItemCatalogo[] = produtosFiltrados.map(dado => ({ tipo: 'produto', dado }))
    const todos = [...s, ...p].sort((a, b) => a.dado.nome.localeCompare(b.dado.nome))
    if (buscando) return todos
    const vendidos = (i: ItemCatalogo) => maisVendidos[`${i.tipo}:${i.dado.id}`] ?? 0
    return [...todos].sort((a, b) => vendidos(b) - vendidos(a)).slice(0, TOP_CATALOGO)
  }, [servicosFiltrados, produtosFiltrados, buscando, maisVendidos])

  function buscarPorCodigo(codigo: string): Produto | undefined {
    const alvo = codigo.trim().toLowerCase()
    if (!alvo) return undefined
    return produtos.find(p => (p.sku ?? '').toLowerCase() === alvo)
  }

  function handleCodigoLido(codigo: string) {
    const produto = buscarPorCodigo(codigo)
    if (produto) {
      addProduto(produto)
      setScanAviso('')
    } else {
      setScanAviso(`Nenhum produto com o código "${codigo}".`)
      setTimeout(() => setScanAviso(''), 3000)
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const produto = buscarPorCodigo(search)
    if (produto) {
      addProduto(produto)
      setSearch('')
    }
  }

  function addServico(s: Servico) {
    setCart(prev => {
      // Mesmo serviço com outro profissional vira outra linha (comissões separadas).
      const ex = prev.find(i => i.tipo === 'servico' && i.referencia_id === s.id && (i.profissional_id ?? '') === profissionalId)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'servico', referencia_id: s.id, nome: s.nome, quantidade: 1, preco_unitario: s.preco_na_venda ? 0 : s.preco, preco_na_venda: !!s.preco_na_venda, profissional_id: profissionalId || undefined }]
    })
  }

  function addProduto(p: Produto) {
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'produto' && i.referencia_id === p.id)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'produto', referencia_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco_venda, profissional_id: profissionalId || undefined }]
    })
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  function removeItem(id: string) {
    setCart(prev => prev.filter(i => i.id !== id))
  }

  // Valor do serviço pode ser ajustado na venda (e é obrigatório nos
  // serviços com valor decidido na venda).
  function mudarPrecoItem(id: string, texto: string) {
    const valor = Math.max(0, Number(texto.replace(',', '.')) || 0)
    setCart(prev => prev.map(i => i.id === id ? { ...i, preco_unitario: valor } : i))
  }

  function mudarProfissionalItem(id: string, profId: string) {
    setCart(prev => prev.map(i => i.id === id ? { ...i, profissional_id: profId || undefined } : i))
  }

  // O profissional do topo vale para os próximos itens e preenche os
  // que ainda estão sem profissional.
  function mudarProfissionalPadrao(profId: string) {
    setProfissionalId(profId)
    if (profId) setCart(prev => prev.map(i => i.profissional_id ? i : { ...i, profissional_id: profId }))
  }

  const servicosSemProfissional = cart.filter(i => i.tipo === 'servico' && !i.profissional_id)

  const servicosSemValor = cart.filter(i => i.tipo === 'servico' && i.preco_na_venda && !(i.preco_unitario > 0))

  function abrirPagamento() {
    if (servicosSemProfissional.length > 0) {
      setError(`Escolha o profissional de: ${servicosSemProfissional.map(i => i.nome).join(', ')}.`)
      return
    }
    if (servicosSemValor.length > 0) {
      setError(`Informe o valor de: ${servicosSemValor.map(i => i.nome).join(', ')}.`)
      return
    }
    setError('')
    setShowPayModal(true)
  }

  function limparVenda() {
    setCart([])
    setClienteNome('')
    setPagamento('pix')
    setParcelas(1)
    setMaquininhaId('')
    setRepassar(false)
    setSemComissao(false)
    setEdicao(null)
    setOrigemAgenda(null)
    setProfissionalId(meuProfissional ?? '')
    setSearch('')
    setError('')
  }

  function sairDaVenda() {
    const voltarAgenda = !!origemAgenda
    limparVenda()
    if (voltarAgenda) navigate('/agenda')
    else setModo('lista')
  }

  function abrirEdicao(venda: VendaParaEditar) {
    setVendaSelecionadaId(null)
    setCart(venda.itens.map(i => ({
      id: uid(), tipo: i.tipo, referencia_id: i.referencia_id, nome: i.nome,
      quantidade: i.quantidade, preco_unitario: Number(i.preco_unitario), profissional_id: i.profissional_id ?? undefined,
    })))
    setClienteNome(venda.comanda.cliente_nome && venda.comanda.cliente_nome !== 'Balcão' ? venda.comanda.cliente_nome : '')
    setPagamento((venda.comanda.forma_pagamento ?? 'pix') as PagamentoMetodo)
    setParcelas(Number(venda.comanda.parcelas ?? 1))
    setMaquininhaId(venda.comanda.maquininha_id ?? '')
    setRepassar(Number(venda.comanda.acrescimo ?? 0) > 0)
    setSemComissao(venda.semComissao)
    setEdicao(venda.comanda)
    setOrigemAgenda(null)
    setProfissionalId('')
    setError('')
    setModo('editar')
  }

  const itensPayload = () => cart.map(i => ({
    tipo: i.tipo,
    referencia_id: i.referencia_id,
    nome: i.nome,
    quantidade: i.quantidade,
    preco_unitario: i.preco_unitario,
    profissional_id: i.profissional_id ?? null,
  }))

  // Só manda as parcelas quando é parcelado (à vista funciona mesmo com o
  // banco ainda sem a migração 20261024000001).
  const escolherMaquininha = useCallback((id: string) => { setMaquininhaId(id); setError('') }, [])

  const parcelasPayload = () => ({
    ...(pagamento === 'credito' && parcelas > 1 ? { p_parcelas: parcelas } : {}),
    ...(pagamento !== 'dinheiro' && maquininhaId ? { p_maquininha_id: maquininhaId } : {}),
    ...(repassar && cobranca.acrescimo > 0 ? { p_repassar_taxa: true } : {}),
  })
  // O que o cliente paga (com a taxa embutida quando ela é repassada).
  const cobranca = calcularCobranca(total, percentualTaxa(taxas, maquininhaId, pagamento, parcelas), repassar)

  async function finalizarVenda() {
    if (saving) return
    if (maquininhaObrigatoria(pagamento, taxas) && !maquininhaId) { setError('Escolha a maquininha do cartão.'); return }
    setSaving(true); setError('')

    if (edicao) {
      const { error: err } = await supabase.rpc('editar_venda', {
        p_comanda_id: edicao.id,
        p_cliente_nome: clienteNome || null,
        p_forma_pagamento: pagamento,
        p_itens: itensPayload(),
        p_sem_comissao: semComissao,
        ...parcelasPayload(),
      })
      setSaving(false)
      if (err) {
        setError(semFuncaoNoBanco(err)
          ? 'A edição de vendas ainda não está ativa no banco de dados. Peça para rodar a atualização do banco (migração 20261022000002) no Supabase.'
          : err.message)
        return
      }
      concluir('Venda atualizada!')
      return
    }

    const { data: comandaId, error: err } = await supabase.rpc('finalizar_venda', {
      p_cliente_nome: clienteNome || null,
      p_cliente_id: origemAgenda?.clienteId ?? null,
      p_forma_pagamento: pagamento,
      p_itens: itensPayload(),
      ...parcelasPayload(),
    })
    if (err) { setSaving(false); setError(err.message); return }

    // A venda já está gravada; o que vem abaixo é complemento. Se falhar,
    // avisa sem desfazer a venda.
    const avisos: string[] = []
    if (semComissao && comandaId) {
      const { error: errComissao } = await supabase.from('comissoes').update({ status: 'cancelada' }).eq('comanda_id', comandaId as string)
      if (errComissao) avisos.push(`não deu para tirar a comissão (${errComissao.message}). Tire pelo card da venda.`)
    }
    if (origemAgenda && comandaId) {
      const { error: errAgenda } = await supabase.rpc('vincular_venda_agendamento', { p_comanda_id: comandaId, p_agendamento_id: origemAgenda.id })
      if (errAgenda) {
        avisos.push(semFuncaoNoBanco(errAgenda)
          ? 'o agendamento não foi marcado como concluído (atualização do banco pendente). Conclua pela Agenda.'
          : `o agendamento não foi marcado como concluído (${errAgenda.message}).`)
      }
    }
    setSaving(false)
    if (avisos.length > 0) window.alert(`A venda foi registrada, mas ${avisos.join(' Além disso, ')}`)
    concluir('Venda registrada!')
  }

  function concluir(mensagem: string) {
    const voltarAgenda = !!origemAgenda
    setShowPayModal(false)
    limparVenda()
    setDone(mensagem)
    setTimeout(() => setDone(null), 2500)
    carregarProdutos()
    carregarVendas()
    if (voltarAgenda) navigate('/agenda')
    else setModo('lista')
  }

  const modalRef = useModalKeyboard(showPayModal, () => setShowPayModal(false), finalizarVenda)

  const toast = (
    <AnimatePresence>
      {done && (
        <motion.div
          style={{
            position: 'fixed', bottom: '28px', right: '28px', zIndex: 100,
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '14px 20px',
            background: 'var(--c-1e)', border: '1px solid var(--c-33)', borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
          initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
        >
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(var(--ink),0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={14} style={{ color: 'var(--c-fff)' }} />
          </div>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>{done}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (modo === 'lista') {
    return (
      <div className="page">
        <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Vendas</h1>
            <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
              {loadingVendas ? 'Carregando...'
                : modoProfissional
                  ? `Vendas em que você atendeu · ${fechadas.length} ${fechadas.length === 1 ? 'venda' : 'vendas'} · ${formatCurrency(totalMeusItens)} nos seus itens`
                  : `${fechadas.length} ${fechadas.length === 1 ? 'venda' : 'vendas'} · ${formatCurrency(totalPeriodo)}${verVendasOutros ? '' : ' · registradas por você'}`}
            </p>
          </div>
          {podeVender && (
            <button className="btn btn-primary" onClick={() => { limparVenda(); setModo('nova') }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={14} strokeWidth={2.5} /> Incluir Venda
            </button>
          )}
        </div>

        {error && <p className="aviso-erro" style={{ marginBottom: '16px' }}>{error}</p>}

        <div className="barra-filtros">
          <div className="filtro-busca">
            <Search size={13} />
            <input placeholder="Buscar cliente..." value={buscaLista} onChange={e => setBuscaLista(e.target.value)} />
            {buscaLista && (
              <button onClick={() => setBuscaLista('')} aria-label="Limpar busca" style={{ background: 'none', border: 'none', color: 'var(--c-55)', cursor: 'pointer', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>
          <FiltroPeriodo valor={periodo} onChange={v => v && setPeriodo(v)} alinhar="esquerda" />
        </div>

        <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="list-header" style={{
            display: 'grid', minWidth: '680px', gridTemplateColumns: COLUNAS_LISTA, gap: '12px',
            padding: '10px 20px', borderBottom: '1px solid var(--c-22)', alignItems: 'center',
            fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
            background: 'var(--header-bg)',
          }}>
            <span className="celula-check">
              <Checkbox label="Selecionar todas" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={vendasFiltradas.length === 0} />
            </span>
            <span>Cliente</span><span>{modoProfissional ? 'Seus itens' : 'Registrada por'}</span><span>Pagamento</span><span>Status</span><span style={{ textAlign: 'right' }}>Total</span>
          </div>

          {loadingVendas ? (
            <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
          ) : vendasFiltradas.length === 0 ? (
            <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
              {buscaLista ? 'Nenhuma venda encontrada.' : `Nenhuma venda no período (${rotuloIntervalo(periodo)}).`}
            </div>
          ) : vendasFiltradas.map((v, i) => (
            <motion.div
              key={v.id}
              className={`list-row clicavel${selecao.tem(v.id) ? ' selecionada' : ''}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
              onClick={() => setVendaSelecionadaId(v.id)}
              style={{
                display: 'grid', minWidth: '680px', gridTemplateColumns: COLUNAS_LISTA, gap: '12px',
                padding: '12px 20px', alignItems: 'center',
                borderBottom: i < vendasFiltradas.length - 1 ? '1px solid var(--c-1f)' : 'none',
              }}
            >
              <span className="celula-check">
                <Checkbox label={`Selecionar venda de ${v.cliente_nome ?? 'Balcão'}`} checked={selecao.tem(v.id)} onChange={m => selecao.alternar(v.id, m)} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{v.cliente_nome ?? 'Balcão'}</p>
                <p className="subtexto">{formatDateTime(v.created_at ?? v.data)}</p>
              </div>
              {modoProfissional
                ? <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>{formatCurrency(valorMeusItens(v))}</span>
                : <span className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-a3)' }}>{nomeUsuarioVenda(v.usuario_id)}</span>}
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-a3)' }}>{rotuloPagamento(v.forma_pagamento, v.parcelas)}</p>
                {Number(v.taxa_valor ?? 0) > 0 && (
                  <p className="subtexto">{Number(v.acrescimo ?? 0) > 0 ? `taxa repassada +${formatCurrency(Number(v.acrescimo))}` : `taxa ${formatCurrency(Number(v.taxa_valor))}`}</p>
                )}
              </div>
              <span className={STATUS_CLASS[v.status] ?? 'badge badge-pending'}>{STATUS_LABEL[v.status] ?? v.status}</span>
              <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', textAlign: 'right' }}>{formatCurrency(v.total)}</span>
            </motion.div>
          ))}
        </div>

        {/* Cards (mobile) */}
        {!loadingVendas && vendasFiltradas.length > 0 && (
          <div className="entity-grid mobile-only-grid" style={{ gap: '12px' }}>
            {vendasFiltradas.map((v, i) => (
              <motion.div
                key={v.id}
                className="card entity-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.04 }}
                onClick={() => setVendaSelecionadaId(v.id)}
                style={{ cursor: 'pointer', borderColor: selecao.tem(v.id) ? 'var(--c-55)' : undefined }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="entity-title texto-cortado" style={{ fontSize: '14px', color: 'var(--c-fff)', fontWeight: 600 }}>{v.cliente_nome ?? 'Balcão'}</p>
                    <p className="entity-subtle" style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '2px' }}>
                      {formatDate(v.data)} · {modoProfissional ? `seus itens ${formatCurrency(valorMeusItens(v))}` : nomeUsuarioVenda(v.usuario_id)}
                    </p>
                  </div>
                  <Checkbox label="Selecionar venda" checked={selecao.tem(v.id)} onChange={m => selecao.alternar(v.id, m)} />
                </div>
                <div className="entity-divider" style={{ height: '1px', background: 'var(--c-22)', margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--c-a3)' }}>
                    {rotuloPagamento(v.forma_pagamento, v.parcelas)}{Number(v.taxa_valor ?? 0) > 0 ? ` · taxa ${formatCurrency(Number(v.taxa_valor))}` : ''}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {v.status !== 'fechada' && <span className={STATUS_CLASS[v.status] ?? 'badge badge-pending'}>{STATUS_LABEL[v.status] ?? v.status}</span>}
                    <span className="valor-num" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--c-fff)' }}>{formatCurrency(v.total)}</span>
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
          <ItemSelecao rotulo="Total" valor={formatCurrency(selecionadas.reduce((s, v) => s + Number(v.total), 0))} />
          {modoProfissional && <ItemSelecao rotulo="Seus itens" valor={formatCurrency(selecionadas.reduce((s, v) => s + valorMeusItens(v), 0))} />}
        </BarraSelecao>

        <AnimatePresence>
          {vendaSelecionadaId && (
            <VendaDetalheModal
              comandaId={vendaSelecionadaId}
              onClose={() => setVendaSelecionadaId(null)}
              destacarProfissionalId={meuProfissional}
              onEditar={abrirEdicao}
              onAlterado={carregarVendas}
            />
          )}
        </AnimatePresence>

        {toast}
      </div>
    )
  }

  const editando = modo === 'editar' && !!edicao

  return (
    <div className="page pdv-layout" style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 64px)', padding: '20px 24px 0', overflow: 'hidden' }}>

      {/* Left — catalog */}
      <div className="pdv-catalog" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <button
          onClick={sairDaVenda}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-66)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '10px', flexShrink: 0, fontFamily: 'inherit' }}
        >
          <ArrowLeft size={13} /> {editando ? 'Cancelar edição' : origemAgenda ? 'Voltar para a Agenda' : 'Vendas'}
        </button>

        {/* Search */}
        <div className="pdv-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexShrink: 0 }}>
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '9px 14px',
            background: 'var(--c-1a)',
            border: '1px solid var(--c-25)',
            borderRadius: '8px',
          }}>
            <Search size={13} style={{ color: 'var(--c-44)', flexShrink: 0 }} />
            <input
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: 'var(--c-fff)', fontFamily: 'inherit' }}
              placeholder="Buscar produto ou serviço, ou ler código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--c-44)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowScanner(true)}
            title="Ler código com a câmera"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '38px', height: '38px', flexShrink: 0,
              background: 'var(--c-1a)', border: '1px solid var(--c-25)', borderRadius: '8px',
              color: 'var(--c-a3)', cursor: 'pointer',
            }}
          >
            <ScanLine size={15} />
          </button>
        </div>

        {scanAviso && (
          <p style={{ fontSize: '12px', color: 'var(--c-66)', marginTop: '-8px', marginBottom: '12px', flexShrink: 0 }}>{scanAviso}</p>
        )}

        {/* Content area — produtos e serviços juntos, sem separação */}
        <div className="pdv-catalog-content" style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
          {!buscando && (
            <p style={{ fontSize: '11px', color: 'var(--c-55)', marginBottom: '8px' }}>
              Os {TOP_CATALOGO} mais vendidos · use a busca (ou o leitor de código) para os demais
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(138px, 1fr))', gap: '8px' }}>
            {itensCatalogo.length === 0 ? (
              <div style={{ gridColumn: '1/-1', padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                Nenhum produto ou serviço encontrado.
              </div>
            ) : itensCatalogo.map(item => {
              const baixo = controlaEstoqueMinimo && item.tipo === 'produto' && item.dado.estoque_atual <= item.dado.estoque_minimo
              return (
                <motion.button
                  key={`${item.tipo}-${item.dado.id}`}
                  onClick={() => item.tipo === 'servico' ? addServico(item.dado) : addProduto(item.dado)}
                  className="card-sm"
                  style={{ cursor: 'pointer', border: '1px solid var(--c-2a)', textAlign: 'left', transition: 'all 0.15s', fontFamily: 'inherit', width: '100%', padding: '9px 11px' }}
                  whileHover={{ borderColor: 'var(--c-44)', background: 'var(--c-24)' }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                    {item.tipo === 'servico' ? <Scissors size={11} style={{ color: 'var(--c-55)' }} /> : <Package size={11} style={{ color: 'var(--c-55)' }} />}
                    <span style={{ fontSize: '9px', color: 'var(--c-55)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {item.tipo === 'servico' ? 'Serviço' : 'Produto'}
                    </span>
                  </div>
                  <p className="texto-cortado" title={item.dado.nome} style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '2px' }}>{item.dado.nome}</p>
                  <p style={{ fontSize: '10px', color: baixo ? 'var(--c-a3)' : 'var(--c-55)' }}>
                    {item.tipo === 'servico'
                      ? `${item.dado.duracao_minutos} min`
                      : `${item.dado.estoque_atual} ${item.dado.unidade} em estoque`}
                  </p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-fff)', marginTop: '5px' }}>
                    {item.tipo === 'servico' && item.dado.preco_na_venda
                      ? <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--c-a3)' }}>Valor na venda</span>
                      : formatCurrency(item.tipo === 'servico' ? item.dado.preco : item.dado.preco_venda)}
                  </p>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right — cart */}
      <div className="pdv-cart" style={{
        width: '300px', flexShrink: 0,
        background: 'var(--c-1a)',
        border: '1px solid var(--c-25)',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--c-22)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editando ? <Pencil size={14} style={{ color: 'var(--c-55)' }} /> : <ShoppingCart size={15} style={{ color: 'var(--c-55)' }} />}
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>{editando ? 'Editando venda' : 'Comanda'}</span>
            {cart.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', padding: '2px 8px',
                borderRadius: '99px', background: 'rgba(var(--ink),0.07)', color: 'var(--c-a3)',
              }}>
                {cart.length}
              </span>
            )}
          </div>
          {editando && edicao && (
            <p style={{ fontSize: '11px', color: 'var(--c-66)', marginTop: '6px' }}>Venda de {formatDateTime(edicao.created_at ?? edicao.data)}</p>
          )}
          {origemAgenda && (
            <p style={{ fontSize: '11px', color: 'var(--c-a3)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarDays size={12} style={{ color: 'var(--c-55)', flexShrink: 0 }} />
              <span className="texto-cortado">Agenda: {origemAgenda.descricao}</span>
            </p>
          )}
          <input
            className="input"
            style={{ marginTop: '12px', fontSize: '13px' }}
            placeholder="Nome do cliente (opcional)"
            value={clienteNome}
            onChange={e => setClienteNome(e.target.value)}
          />
          {profissionais.length > 0 && (
            <select
              className="input"
              style={{ marginTop: '8px', fontSize: '13px' }}
              value={profissionalId}
              onChange={e => mudarProfissionalPadrao(e.target.value)}
            >
              <option value="">Profissional que atendeu</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
        </div>

        <div className="pdv-cart-items" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <AnimatePresence>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--c-33)', fontSize: '13px' }}>
                Adicione itens à comanda
              </div>
            ) : cart.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  background: 'rgba(var(--ink),0.03)',
                  border: '1px solid var(--c-25)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--c-fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.nome}
                  </p>
                  {item.tipo === 'servico' ? (
                    <label className="pdv-item-preco" title="Valor do serviço nesta venda">
                      <span>R$</span>
                      <input
                        type="number" min={0} step={0.01} inputMode="decimal"
                        aria-label={`Valor de ${item.nome}`}
                        placeholder={item.preco_na_venda ? 'Valor *' : '0,00'}
                        value={item.preco_unitario > 0 || !item.preco_na_venda ? item.preco_unitario : ''}
                        onChange={e => mudarPrecoItem(item.id, e.target.value)}
                        className={item.preco_na_venda && !(item.preco_unitario > 0) ? 'pendente' : undefined}
                      />
                    </label>
                  ) : (
                    <p style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '2px' }}>{formatCurrency(item.preco_unitario)}</p>
                  )}
                  {profissionais.length > 0 && (
                    <select
                      aria-label={`Profissional de ${item.nome}`}
                      value={item.profissional_id ?? ''}
                      onChange={e => mudarProfissionalItem(item.id, e.target.value)}
                      style={{
                        marginTop: '6px', width: '100%', fontSize: '11px', padding: '4px 6px', borderRadius: '6px',
                        background: 'var(--c-11)', color: item.profissional_id ? 'var(--c-a3)' : 'var(--c-fff)', fontFamily: 'inherit',
                        border: item.tipo === 'servico' && !item.profissional_id ? '1px dashed var(--c-a3)' : '1px solid var(--c-2a)',
                      }}
                    >
                      <option value="">{item.tipo === 'servico' ? 'Escolha o profissional *' : 'Sem profissional'}</option>
                      {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => changeQty(item.id, -1)}
                    aria-label="Diminuir quantidade"
                    style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid var(--c-33)', background: 'transparent', color: 'var(--c-66)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={10} />
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-fff)', minWidth: '16px', textAlign: 'center' }}>{item.quantidade}</span>
                  <button
                    onClick={() => changeQty(item.id, 1)}
                    aria-label="Aumentar quantidade"
                    style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid var(--c-33)', background: 'transparent', color: 'var(--c-66)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={10} />
                  </button>
                </div>
                <button onClick={() => removeItem(item.id)} aria-label={`Remover ${item.nome}`} style={{ background: 'transparent', border: 'none', color: 'var(--c-33)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--c-22)', flexShrink: 0 }}>
          {podeTirarComissao && (
            <label className="check-rotulo" style={{ marginBottom: '12px' }} title="A venda não gera comissão para ninguém">
              <input type="checkbox" checked={semComissao} onChange={e => setSemComissao(e.target.checked)} />
              Sem comissão nesta venda
            </label>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', color: 'var(--c-a3)' }}>Total</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--c-fff)', fontVariantNumeric: 'tabular-nums', fontFamily: 'DM Sans, sans-serif' }}>
              {formatCurrency(total)}
            </span>
          </div>
          {error && !showPayModal && <p style={{ fontSize: '12px', color: 'var(--c-a3)', marginBottom: '10px' }}>{error}</p>}
          <button className="btn btn-primary btn-full" onClick={abrirPagamento} disabled={cart.length === 0}>
            {editando ? 'Salvar Edição' : 'Finalizar Venda'}
          </button>
        </div>
      </div>

      {/* Payment modal */}
      <AnimatePresence>
        {showPayModal && (
          <motion.div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              // Cabe na tela mesmo com zoom ou janela baixa: rola por dentro.
              style={{ width: '100%', maxWidth: 'min(780px, 94vw)', padding: '22px 26px', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '18px', color: 'var(--c-fff)' }}>Forma de Pagamento</h2>
                <button className="btn btn-icon" onClick={() => setShowPayModal(false)}><X size={14} /></button>
              </div>
              {/* Esquerda: forma e total. Direita: maquininha, parcelas e taxa. */}
              <div className="pagamento-colunas" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {PAGAMENTOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPagamento(p.id)}
                    style={{
                      padding: '11px 14px', borderRadius: '8px',
                      border: pagamento === p.id ? '1px solid var(--c-fff)' : '1px solid var(--c-2a)',
                      background: pagamento === p.id ? 'rgba(var(--ink),0.07)' : 'transparent',
                      color: pagamento === p.id ? 'var(--c-fff)' : 'var(--c-66)',
                      fontSize: '13px', fontWeight: pagamento === p.id ? 600 : 400,
                      cursor: 'pointer', textAlign: 'left',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                  >
                    {p.label}
                    {pagamento === p.id && <Check size={14} />}
                  </button>
                ))}
                </div>
                <div style={{ padding: '14px 16px', background: 'rgba(var(--ink),0.04)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--c-a3)' }}>Total a cobrar</span>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--c-fff)' }}>{formatCurrency(cobranca.cobrado)}</span>
                </div>
                {semComissao && <p style={{ fontSize: '12px', color: 'var(--c-66)' }}>Esta venda não vai gerar comissão.</p>}
              </div>
              <div>
                <PagamentoTaxa forma={pagamento} parcelas={parcelas} onParcelas={setParcelas} maquininhaId={maquininhaId} onMaquininha={escolherMaquininha} repassar={repassar} onRepassar={setRepassar} total={total} taxas={taxas} />
              </div>
              </div>
              {error && ehErroSemCaixa(error)
                ? <AbrirCaixaRapido onAberto={() => { setError(''); finalizarVenda() }} />
                : error && <p style={{ fontSize: '12px', color: 'var(--c-a3)', marginBottom: '12px' }}>{error}</p>}
              <button className="btn btn-primary btn-full" onClick={finalizarVenda} disabled={saving}>
                {saving ? 'Processando...' : editando ? 'Salvar Edição (F10)' : 'Confirmar Pagamento (F10)'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {toast}

      {/* Camera scanner */}
      <AnimatePresence>
        {showScanner && (
          <ScannerCamera
            onScan={codigo => { setShowScanner(false); handleCodigoLido(codigo) }}
            onClose={() => setShowScanner(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
