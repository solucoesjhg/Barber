import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import type { MovimentoCaixa } from '../types'

const MOCK_MOV: MovimentoCaixa[] = [
  { id: '1', tipo: 'entrada', categoria: 'venda', descricao: 'Venda — Rafael Mendes', valor: 65, data: new Date().toISOString().split('T')[0], created_at: '' },
  { id: '2', tipo: 'entrada', categoria: 'venda', descricao: 'Venda — Balcão (2x Heineken)', valor: 16, data: new Date().toISOString().split('T')[0], created_at: '' },
  { id: '3', tipo: 'entrada', categoria: 'venda', descricao: 'Venda — Gustavo Lima', valor: 80, data: new Date().toISOString().split('T')[0], created_at: '' },
  { id: '4', tipo: 'saida',  categoria: 'custo_fixo', descricao: 'Reposição estoque cervejas', valor: 120, data: new Date().toISOString().split('T')[0], created_at: '' },
  { id: '5', tipo: 'entrada', categoria: 'venda', descricao: 'Venda — Bruno Castro', valor: 45, data: new Date(Date.now() - 86400000).toISOString().split('T')[0], created_at: '' },
  { id: '6', tipo: 'saida',  categoria: 'comissao', descricao: 'Comissão João Silva', valor: 80, data: new Date(Date.now() - 86400000).toISOString().split('T')[0], created_at: '' },
  { id: '7', tipo: 'entrada', categoria: 'venda', descricao: 'Venda — Thiago Rocha', valor: 95, data: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0], created_at: '' },
]

const CHART_MOCK = [
  { dia: 'Seg', entrada: 180, saida: 60 },
  { dia: 'Ter', entrada: 240, saida: 80 },
  { dia: 'Qua', entrada: 160, saida: 45 },
  { dia: 'Qui', entrada: 310, saida: 100 },
  { dia: 'Sex', entrada: 420, saida: 130 },
  { dia: 'Sáb', entrada: 560, saida: 160 },
  { dia: 'Dom', entrada: 200, saida: 55 },
]

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
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>(MOCK_MOV)
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm] = useState({ tipo: 'saida', categoria: '', descricao: '', valor: '' })
  const [saving, setSaving] = useState(false)

  const hoje = new Date().toISOString().split('T')[0]
  const movHoje    = movimentos.filter(m => m.data === hoje)
  const entradas   = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const saidas     = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const lucro      = entradas - saidas
  const entradasHoje = movHoje.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)

  useEffect(() => {
    supabase.from('movimentos_caixa').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { if (data && data.length > 0) setMovimentos(data as MovimentoCaixa[]) })
  }, [])

  async function handleSave() {
    if (!form.descricao || !form.valor) return
    setSaving(true)
    const { data } = await supabase.from('movimentos_caixa').insert({
      tipo: form.tipo, categoria: form.categoria || form.tipo,
      descricao: form.descricao, valor: Number(form.valor), data: hoje,
    }).select('*').single()
    if (data) setMovimentos(prev => [data as MovimentoCaixa, ...prev])
    setForm({ tipo: 'saida', categoria: '', descricao: '', valor: '' })
    setShowModal(false); setSaving(false)
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Financeiro</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Fluxo de caixa e relatórios</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} /> Lançar Saída
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Entradas (total)', value: formatCurrency(entradas), icon: TrendingUp, suffix: `Hoje: ${formatCurrency(entradasHoje)}` },
          { label: 'Saídas (total)',   value: formatCurrency(saidas),   icon: TrendingDown, suffix: '' },
          { label: 'Lucro Líquido',    value: formatCurrency(lucro),    icon: DollarSign, suffix: '' },
        ].map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <Icon size={15} style={{ color: '#555' }} />
                <span style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {s.label}
                </span>
              </div>
              <p style={{ fontSize: '24px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif', letterSpacing: '-0.02em' }}>
                {s.value}
              </p>
              {s.suffix && <p style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>{s.suffix}</p>}
            </motion.div>
          )
        })}
      </div>

      {/* Chart */}
      <motion.div
        className="card"
        style={{ marginBottom: '24px' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '20px' }}>
          Últimos 7 dias
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={CHART_MOCK}>
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
      </motion.div>

      {/* Movements */}
      <motion.div
        className="card"
        style={{ padding: 0, overflow: 'hidden' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #222' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Lançamentos</span>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 120px 100px 110px',
          padding: '10px 24px',
          borderBottom: '1px solid #1A1A1A',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Descrição</span>
          <span>Categoria</span>
          <span>Data</span>
          <span>Valor</span>
        </div>
        {movimentos.slice(0, 20).map((m, i) => (
          <div
            key={m.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 100px 110px',
              padding: '13px 24px',
              borderBottom: i < movimentos.length - 1 ? '1px solid #1A1A1A' : 'none',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {m.tipo === 'entrada'
                ? <ArrowUpRight size={13} style={{ color: '#FFFFFF', flexShrink: 0 }} />
                : <ArrowDownRight size={13} style={{ color: '#555', flexShrink: 0 }} />
              }
              <span style={{ fontSize: '13px', color: m.tipo === 'entrada' ? '#FFFFFF' : '#A3A3A3', fontWeight: m.tipo === 'entrada' ? 500 : 400 }}>
                {m.descricao}
              </span>
            </div>
            <span style={{ fontSize: '12px', color: '#555', textTransform: 'capitalize' }}>{m.categoria}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(m.data)}</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: m.tipo === 'entrada' ? '#FFFFFF' : '#555', fontFamily: 'DM Sans, sans-serif' }}>
              {m.tipo === 'saida' ? '−' : '+'}{formatCurrency(m.valor)}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Modal saída */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '28px' }}>
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
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
