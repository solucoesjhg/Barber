import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Plus, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Wallet, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { useSelecao } from '../hooks/useSelecao'
import { confirmarSaldoSuficiente } from '../lib/contasFinanceiras'
import { usePermissoes } from '../hooks/usePermissoes'
import { dataLocalISO, intervaloMes, rotuloIntervalo, type Intervalo } from '../lib/periodo'
import VendaDetalheModal from '../components/VendaDetalheModal'
import LancamentoDetalheModal from '../components/LancamentoDetalheModal'
import ContaFinanceiraModal from '../components/ContaFinanceiraModal'
import FiltroPeriodo from '../components/ui/FiltroPeriodo'
import Checkbox from '../components/ui/Checkbox'
import StatCard from '../components/ui/StatCard'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import type { MovimentoCaixa, ContaFinanceira } from '../types'

const CATEGORIA_LABEL: Record<string, string> = {
  venda: 'Venda', sangria: 'Sangria', suprimento: 'Suprimento', capital_inicial: 'Saldo inicial',
  conta_a_pagar: 'Conta paga', conta_a_receber: 'Conta recebida', compra_mercadoria: 'Compra de mercadoria',
  entrada: 'Entrada', saida: 'Saída',
}

interface SaldoConta { conta_id: string; nome: string; tipo: string; padrao: boolean; saldo: number }

const GRAFICO_KEY = 'financeiro_grafico_aberto'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1E1E1E', border: '1px solid #333', borderRadius: '8px', padding: '12px 14px', fontSize: '13px' }}>
      <p style={{ color: '#666', marginBottom: '6px', fontSize: '11px' }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.dataKey === 'entrada' ? '#FFFFFF' : '#A3A3A3', marginBottom: '2px' }}>
          {p.dataKey === 'entrada' ? 'Entradas' : 'Saídas'}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function Financeiro() {
  const { podeEditar: podeEditarTela } = usePermissoes()
  const podeEditar = podeEditarTela('financeiro')
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [chartData, setChartData] = useState<{ dia: string; entrada: number; saida: number }[]>([])
  const [aPagar, setAPagar] = useState({ aberto: 0, vencido: 0 })
  const [aReceber, setAReceber] = useState({ aberto: 0, vencido: 0 })
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm] = useState({ tipo: 'saida', categoria: '', descricao: '', valor: '', contaId: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [lancamentoSelecionado, setLancamentoSelecionado] = useState<MovimentoCaixa | null>(null)
  const [periodo, setPeriodo] = useState<Intervalo>(() => intervaloMes())
  const [graficoAberto, setGraficoAberto] = useState(() => {
    try { return localStorage.getItem(GRAFICO_KEY) !== '0' } catch { return true }
  })
  const [contas, setContas] = useState<SaldoConta[]>([])
  const [showContaModal, setShowContaModal] = useState(false)
  const [contaEditando, setContaEditando] = useState<ContaFinanceira | null>(null)
  const [saldoInicialPeriodo, setSaldoInicialPeriodo] = useState(0)

  const inicio = periodo.inicio
  const fim = periodo.fim

  const hoje = dataLocalISO()
  const movHoje    = movimentos.filter(m => m.data === hoje)
  const entradas   = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const saidas     = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const lucro      = entradas - saidas
  const entradasHoje = movHoje.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)

  function carregarMovimentos() {
    supabase.from('movimentos_caixa').select('*').gte('data', inicio).lte('data', fim).order('created_at', { ascending: false })
      .then(({ data }) => { setMovimentos((data ?? []) as MovimentoCaixa[]) })
  }

  function carregarContas() {
    supabase.rpc('saldo_contas_financeiras').then(({ data }) => { setContas((data ?? []) as SaldoConta[]) })
  }

  const saldoAtualConsolidado = contas.reduce((s, c) => s + c.saldo, 0)

  const selecao = useSelecao(movimentos.map(m => m.id))
  const marcados = movimentos.filter(m => selecao.tem(m.id))
  const entradasMarcadas = marcados.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor), 0)
  const saidasMarcadas = marcados.filter(m => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor), 0)

  function toggleGrafico() {
    setGraficoAberto(prev => {
      const next = !prev
      try { localStorage.setItem(GRAFICO_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    carregarMovimentos()
    supabase.from('movimentos_caixa').select('tipo, valor').lt('data', inicio)
      .then(({ data }) => {
        const rows = (data ?? []) as { tipo: string; valor: number }[]
        setSaldoInicialPeriodo(rows.reduce((s, m) => s + (m.tipo === 'entrada' ? m.valor : -m.valor), 0))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim])

  useEffect(() => {
    carregarContas()
  }, [])

  useEffect(() => {
    const seteDiasAtras = dataLocalISO(new Date(Date.now() - 6 * 86400000))
    supabase.from('movimentos_caixa').select('tipo, valor, data').gte('data', seteDiasAtras)
      .then(({ data }) => {
        const porDia: Record<string, { entrada: number; saida: number }> = {}
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000)
          porDia[dataLocalISO(d)] = { entrada: 0, saida: 0 }
        }
        ;((data ?? []) as { tipo: string; valor: number; data: string }[]).forEach(m => {
          if (porDia[m.data]) porDia[m.data][m.tipo === 'entrada' ? 'entrada' : 'saida'] += m.valor
        })
        setChartData(Object.entries(porDia).map(([data, v]) => ({
          dia: DIAS_SEMANA[new Date(`${data}T12:00:00`).getDay()], ...v,
        })))
      })

    const hoje2 = dataLocalISO()
    supabase.from('contas_pagar').select('valor, valor_pago, status, data_vencimento').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const rows = (data ?? []) as { valor: number; valor_pago: number; data_vencimento: string }[]
        setAPagar({
          aberto: rows.reduce((s, c) => s + (c.valor - c.valor_pago), 0),
          vencido: rows.filter(c => c.data_vencimento < hoje2).reduce((s, c) => s + (c.valor - c.valor_pago), 0),
        })
      })
    supabase.from('contas_receber').select('valor, valor_pago, status, data_vencimento').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const rows = (data ?? []) as { valor: number; valor_pago: number; data_vencimento: string }[]
        setAReceber({
          aberto: rows.reduce((s, c) => s + (c.valor - c.valor_pago), 0),
          vencido: rows.filter(c => c.data_vencimento < hoje2).reduce((s, c) => s + (c.valor - c.valor_pago), 0),
        })
      })
  }, [])

  async function handleSave() {
    if (!form.descricao || !form.valor || saving) return
    setSaving(true); setFormError('')
    if (form.tipo === 'saida' && !(await confirmarSaldoSuficiente(form.contaId || null, Number(form.valor)))) {
      setSaving(false); return
    }
    const { error: err } = await supabase.rpc('registrar_movimento_caixa', {
      p_tipo: form.tipo, p_categoria: form.categoria || form.tipo,
      p_descricao: form.descricao, p_valor: Number(form.valor),
      p_conta_financeira_id: form.contaId || null,
    })
    setSaving(false)
    if (err) { setFormError(err.message); return }
    carregarMovimentos()
    carregarContas()
    setForm({ tipo: 'saida', categoria: '', descricao: '', valor: '', contaId: '' })
    setShowModal(false)
  }

  async function handleExcluirLancamento() {
    if (!lancamentoSelecionado) return
    const { error: err } = await supabase.rpc('excluir_movimento_caixa', { p_id: lancamentoSelecionado.id })
    if (err) throw new Error(err.message)
    setMovimentos(prev => prev.filter(m => m.id !== lancamentoSelecionado.id))
    setLancamentoSelecionado(null)
  }

  const modalRef = useModalKeyboard(showModal, () => setShowModal(false), handleSave)

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Financeiro</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{rotuloIntervalo(periodo)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <FiltroPeriodo valor={periodo} onChange={v => v && setPeriodo(v)} />
          {podeEditar && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFormError(''); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '36px' }}>
              <Plus size={13} /> Novo Lançamento
            </button>
          )}
        </div>
      </div>

      {/* Contas financeiras */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Contas</span>
          {podeEditar && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setContaEditando(null); setShowContaModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={11} /> Nova conta
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {contas.map(c => (
            <button
              key={c.conta_id}
              onClick={() => { if (!podeEditar) return; setContaEditando({ id: c.conta_id, nome: c.nome, tipo: c.tipo as 'caixa' | 'banco', padrao: c.padrao, ativo: true, created_at: '' }); setShowContaModal(true) }}
              disabled={!podeEditar}
              className="card"
              style={{ flex: '1 1 180px', minWidth: '160px', textAlign: 'left', cursor: podeEditar ? 'pointer' : 'default', border: '1px solid #252525', opacity: 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wallet size={13} style={{ color: '#555' }} />
                  <span style={{ fontSize: '12px', color: '#A3A3A3' }}>{c.nome}</span>
                  {c.padrao && <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '99px', border: '1px solid #2A2A2A', color: '#666' }}>padrão</span>}
                </div>
                {podeEditar && <Pencil size={11} style={{ color: '#444' }} />}
              </div>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif' }}>{formatCurrency(c.saldo)}</p>
            </button>
          ))}
          {contas.length === 0 && (
            <p style={{ fontSize: '12px', color: '#444' }}>Nenhuma conta cadastrada ainda.</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid-auto">
        <StatCard rotulo="Entradas" icone={TrendingUp} valor={formatCurrency(entradas)} sub={`Hoje: ${formatCurrency(entradasHoje)}`} />
        <StatCard rotulo="Saídas" icone={TrendingDown} valor={formatCurrency(saidas)} />
        <StatCard rotulo="Lucro líquido" icone={DollarSign} valor={formatCurrency(lucro)} />
        <StatCard rotulo="A pagar" icone={TrendingDown} valor={formatCurrency(aPagar.aberto)} sub={aPagar.vencido > 0 ? `${formatCurrency(aPagar.vencido)} vencido` : undefined} />
        <StatCard rotulo="A receber" icone={TrendingUp} valor={formatCurrency(aReceber.aberto)} sub={aReceber.vencido > 0 ? `${formatCurrency(aReceber.vencido)} vencido` : undefined} />
      </div>

      {/* Fluxo de caixa */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '16px', display: 'block' }}>
          Fluxo de Caixa
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div>
            <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Realizado no período</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Saldo inicial</span>
                <span style={{ color: '#A3A3A3' }}>{formatCurrency(saldoInicialPeriodo)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>+ Entradas realizadas</span>
                <span style={{ color: '#A3A3A3' }}>{formatCurrency(entradas)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>− Saídas realizadas</span>
                <span style={{ color: '#A3A3A3' }}>{formatCurrency(saidas)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #262626' }}>
                <span style={{ color: '#A3A3A3', fontWeight: 600 }}>Saldo final</span>
                <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{formatCurrency(saldoInicialPeriodo + entradas - saidas)}</span>
              </div>
            </div>
          </div>
          <div>
            <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>Projetado</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>Saldo atual (todas as contas)</span>
                <span style={{ color: '#A3A3A3' }}>{formatCurrency(saldoAtualConsolidado)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>+ A receber (em aberto)</span>
                <span style={{ color: '#A3A3A3' }}>{formatCurrency(aReceber.aberto)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#666' }}>− A pagar (em aberto)</span>
                <span style={{ color: '#A3A3A3' }}>{formatCurrency(aPagar.aberto)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid #262626' }}>
                <span style={{ color: '#A3A3A3', fontWeight: 600 }}>Projeção</span>
                <span style={{ color: '#FFFFFF', fontWeight: 700 }}>{formatCurrency(saldoAtualConsolidado + aReceber.aberto - aPagar.aberto)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <motion.div
        className="card"
        style={{ marginBottom: '24px' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <button
          onClick={toggleGrafico}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            marginBottom: graficoAberto ? '20px' : 0, fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Últimos 7 dias</span>
          {graficoAberto ? <ChevronUp size={15} style={{ color: '#555' }} /> : <ChevronDown size={15} style={{ color: '#555' }} />}
        </button>
        {graficoAberto && (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gEntrada" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FFFFFF" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gSaida" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#666666" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#666666" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#444' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#444' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="entrada" stroke="#FFFFFF" strokeWidth={1.5} fill="url(#gEntrada)" dot={false} />
                <Area type="monotone" dataKey="saida"   stroke="#444444" strokeWidth={1.5} fill="url(#gSaida)"   dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#666' }}>
                <div style={{ width: '16px', height: '2px', background: '#FFFFFF', borderRadius: '1px' }} /> Entradas
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#666' }}>
                <div style={{ width: '16px', height: '2px', background: '#444', borderRadius: '1px' }} /> Saídas
              </div>
            </div>
          </>
        )}
      </motion.div>

      {/* Movements */}
      <motion.div
        className="card"
        style={{ padding: 0, overflow: 'hidden' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="list-header" style={{
          display: 'grid',
          minWidth: '600px', gridTemplateColumns: '22px minmax(200px, 1fr) 150px 96px 120px', gap: '12px', alignItems: 'center',
          padding: '10px 20px',
          borderBottom: '1px solid #1A1A1A',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span className="celula-check">
            <Checkbox label="Selecionar todos os lançamentos" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={movimentos.length === 0} />
          </span>
          <span>Lançamentos</span>
          <span>Categoria</span>
          <span>Data</span>
          <span style={{ textAlign: 'right' }}>Valor</span>
        </div>
        {movimentos.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum lançamento no período.
          </div>
        ) : movimentos.map((m, i) => (
          <div
            key={m.id}
            className={`list-row clicavel${selecao.tem(m.id) ? ' selecionada' : ''}`}
            onClick={() => setLancamentoSelecionado(m)}
            style={{
              display: 'grid',
              minWidth: '600px', gridTemplateColumns: '22px minmax(200px, 1fr) 150px 96px 120px', gap: '12px',
              padding: '12px 20px',
              borderBottom: i < movimentos.length - 1 ? '1px solid #1A1A1A' : 'none',
              alignItems: 'center',
            }}
          >
            <span className="celula-check">
              <Checkbox label={`Selecionar ${m.descricao}`} checked={selecao.tem(m.id)} onChange={v => selecao.alternar(m.id, v)} />
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              {m.tipo === 'entrada'
                ? <ArrowUpRight size={13} style={{ color: '#FFFFFF', flexShrink: 0 }} />
                : <ArrowDownRight size={13} style={{ color: '#555', flexShrink: 0 }} />
              }
              <span className="texto-cortado" style={{ fontSize: '13px', color: m.tipo === 'entrada' ? '#FFFFFF' : '#A3A3A3', fontWeight: m.tipo === 'entrada' ? 500 : 400 }}>
                {m.descricao}
              </span>
            </div>
            <span className="texto-cortado" style={{ fontSize: '12px', color: '#555' }}>{CATEGORIA_LABEL[m.categoria] ?? m.categoria}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(m.data)}</span>
            <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: m.tipo === 'entrada' ? '#FFFFFF' : '#777', textAlign: 'right' }}>
              {m.tipo === 'saida' ? '−' : '+'}{formatCurrency(m.valor)}
            </span>
          </div>
        ))}
      </motion.div>

      <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
        <ItemSelecao rotulo="Entradas" valor={formatCurrency(entradasMarcadas)} />
        <ItemSelecao rotulo="Saídas" valor={formatCurrency(saidasMarcadas)} />
        <ItemSelecao rotulo="Saldo" valor={formatCurrency(entradasMarcadas - saidasMarcadas)} />
      </BarraSelecao>

      {/* Modal saída */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div ref={modalRef} className="card" style={{ width: '100%', maxWidth: '400px', padding: '28px' }}>
            <h2 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '20px' }}>Lançar Movimento</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="field">
                <label className="label">Tipo</label>
                <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Categoria</label>
                <input className="input" placeholder="Ex: comissão, custo fixo..." value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Descrição *</label>
                <input className="input" placeholder="Descrição do lançamento" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Valor (R$) *</label>
                <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              </div>
              <div className="field">
                <label className="label">Conta</label>
                <select className="input" value={form.contaId} onChange={e => setForm(f => ({ ...f, contaId: e.target.value }))}>
                  <option value="">Conta padrão da loja</option>
                  {contas.map(c => <option key={c.conta_id} value={c.conta_id}>{c.nome}</option>)}
                </select>
              </div>
              {formError && <p style={{ fontSize: '12px', color: '#666' }}>{formError}</p>}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar (Esc)</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Confirmar (F10)'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detalhe do lançamento (clique numa linha) */}
      <AnimatePresence>
        {lancamentoSelecionado && (
          lancamentoSelecionado.comanda_id ? (
            <VendaDetalheModal
              comandaId={lancamentoSelecionado.comanda_id}
              onClose={() => setLancamentoSelecionado(null)}
              onDelete={podeEditar ? handleExcluirLancamento : undefined}
            />
          ) : (
            <LancamentoDetalheModal
              movimento={lancamentoSelecionado}
              onClose={() => setLancamentoSelecionado(null)}
              onDelete={podeEditar ? handleExcluirLancamento : undefined}
            />
          )
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContaModal && (
          <ContaFinanceiraModal
            conta={contaEditando}
            onClose={() => setShowContaModal(false)}
            onSaved={carregarContas}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
