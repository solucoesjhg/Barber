import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle, Package } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import type { Produto, ProdutoCategoria } from '../types'

const MOCK: Produto[] = [
  { id: 'p1', nome: 'Heineken Lata',   categoria: 'bebidas',  preco_custo: 4,   preco_venda: 8,  estoque_atual: 24, estoque_minimo: 12, ativo: true },
  { id: 'p2', nome: 'Skol Lata',       categoria: 'bebidas',  preco_custo: 3.5, preco_venda: 7,  estoque_atual: 8,  estoque_minimo: 12, ativo: true },
  { id: 'p3', nome: 'Água Mineral',    categoria: 'bebidas',  preco_custo: 1.5, preco_venda: 4,  estoque_atual: 30, estoque_minimo: 10, ativo: true },
  { id: 'p4', nome: 'Pomada Uppercut', categoria: 'pomadas',  preco_custo: 25,  preco_venda: 55, estoque_atual: 8,  estoque_minimo: 3,  ativo: true },
  { id: 'p5', nome: 'Pomada Leve',     categoria: 'pomadas',  preco_custo: 18,  preco_venda: 38, estoque_atual: 3,  estoque_minimo: 3,  ativo: true },
  { id: 'p6', nome: 'Petisco Misto',   categoria: 'petiscos', preco_custo: 8,   preco_venda: 18, estoque_atual: 15, estoque_minimo: 5,  ativo: true },
  { id: 'p7', nome: 'Batata Chips',    categoria: 'petiscos', preco_custo: 5,   preco_venda: 12, estoque_atual: 20, estoque_minimo: 5,  ativo: true },
]

const CAT_LABEL: Record<ProdutoCategoria, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>(MOCK)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    nome: '', categoria: 'bebidas' as ProdutoCategoria,
    preco_custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '5',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const alertas = produtos.filter(p => p.estoque_atual <= p.estoque_minimo)

  useEffect(() => {
    supabase.from('produtos').select('*').order('nome')
      .then(({ data }) => { if (data && data.length > 0) setProdutos(data as Produto[]) })
  }, [])

  async function handleSave() {
    if (!form.nome.trim() || !form.preco_venda) {
      setError('Nome e preço de venda são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('produtos').insert({
      nome: form.nome, categoria: form.categoria,
      preco_custo: Number(form.preco_custo) || 0,
      preco_venda: Number(form.preco_venda),
      estoque_atual: Number(form.estoque_atual) || 0,
      estoque_minimo: Number(form.estoque_minimo) || 5,
      ativo: true,
    }).select('*').single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) setProdutos(prev => [...prev, data as Produto])
    setForm({ nome: '', categoria: 'bebidas', preco_custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '5' })
    setShowModal(false); setSaving(false)
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Produtos</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Estoque da conveniência</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Produto
        </button>
      </div>

      {/* Alerts */}
      {alertas.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #333',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <AlertTriangle size={14} style={{ color: '#A3A3A3', flexShrink: 0 }} />
          <p style={{ fontSize: '13px', color: '#A3A3A3' }}>
            <strong style={{ color: '#FFFFFF' }}>{alertas.length} produto{alertas.length > 1 ? 's' : ''}</strong>{' '}
            abaixo do estoque mínimo: {alertas.map(p => p.nome).join(', ')}.
          </p>
        </motion.div>
      )}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 120px 120px 90px 90px',
          padding: '10px 24px',
          borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Produto</span>
          <span>Categoria</span>
          <span>Custo</span>
          <span>Venda</span>
          <span>Estoque</span>
          <span>Mínimo</span>
        </div>

        {produtos.map((p, i) => {
          const baixo = p.estoque_atual <= p.estoque_minimo
          const margem = p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 120px 120px 90px 90px',
                padding: '14px 24px',
                borderBottom: i < produtos.length - 1 ? '1px solid #1F1F1F' : 'none',
                alignItems: 'center',
              }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={13} style={{ color: '#444', flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{p.nome}</span>
                  {margem && (
                    <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>+{margem}% margem</span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: '12px', color: '#666', textTransform: 'capitalize' }}>
                {CAT_LABEL[p.categoria]}
              </span>
              <span style={{ fontSize: '13px', color: '#555' }}>{formatCurrency(p.preco_custo)}</span>
              <span style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(p.preco_venda)}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: baixo ? '#FFFFFF' : '#A3A3A3', fontFamily: 'DM Sans, sans-serif' }}>
                {p.estoque_atual}
                {baixo && <AlertTriangle size={12} style={{ marginLeft: '4px', color: '#777', verticalAlign: 'middle' }} />}
              </span>
              <span style={{ fontSize: '13px', color: '#444' }}>{p.estoque_minimo}</span>
            </motion.div>
          )
        })}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div
              className="card"
              style={{ width: '100%', maxWidth: '460px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Produto</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome do produto" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Categoria</label>
                  <select className="input" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as ProdutoCategoria }))}>
                    <option value="bebidas">Bebidas</option>
                    <option value="pomadas">Pomadas</option>
                    <option value="petiscos">Petiscos</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Preço de Custo</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.preco_custo} onChange={e => setForm(f => ({ ...f, preco_custo: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Preço de Venda *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.preco_venda} onChange={e => setForm(f => ({ ...f, preco_venda: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Estoque Atual</label>
                    <input className="input" type="number" min={0} placeholder="0" value={form.estoque_atual} onChange={e => setForm(f => ({ ...f, estoque_atual: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Estoque Mínimo</label>
                    <input className="input" type="number" min={0} placeholder="5" value={form.estoque_minimo} onChange={e => setForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
                  </div>
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
