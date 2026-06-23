import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle, Package, Scissors, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import type { Produto, ProdutoCategoria, Servico, Profissional } from '../types'

type Secao = 'produtos' | 'servicos'

const MOCK_PROD: Produto[] = [
  { id: 'p1', nome: 'Heineken Lata',   categoria: 'bebidas',  preco_custo: 4,   preco_venda: 8,  estoque_atual: 24, estoque_minimo: 12, ativo: true },
  { id: 'p2', nome: 'Skol Lata',       categoria: 'bebidas',  preco_custo: 3.5, preco_venda: 7,  estoque_atual: 8,  estoque_minimo: 12, ativo: true },
  { id: 'p3', nome: 'Água Mineral',    categoria: 'bebidas',  preco_custo: 1.5, preco_venda: 4,  estoque_atual: 30, estoque_minimo: 10, ativo: true },
  { id: 'p4', nome: 'Pomada Uppercut', categoria: 'pomadas',  preco_custo: 25,  preco_venda: 55, estoque_atual: 8,  estoque_minimo: 3,  ativo: true },
  { id: 'p5', nome: 'Pomada Leve',     categoria: 'pomadas',  preco_custo: 18,  preco_venda: 38, estoque_atual: 3,  estoque_minimo: 3,  ativo: true },
  { id: 'p6', nome: 'Petisco Misto',   categoria: 'petiscos', preco_custo: 8,   preco_venda: 18, estoque_atual: 15, estoque_minimo: 5,  ativo: true },
  { id: 'p7', nome: 'Batata Chips',    categoria: 'petiscos', preco_custo: 5,   preco_venda: 12, estoque_atual: 20, estoque_minimo: 5,  ativo: true },
]

const MOCK_SERV: Servico[] = [
  { id: 's1', nome: 'Combo Cabelo + Barba', preco: 65, duracao_minutos: 50, ativo: true },
  { id: 's2', nome: 'Pigmentação',          preco: 80, duracao_minutos: 60, ativo: true },
  { id: 's3', nome: 'Corte de Cabelo',      preco: 45, duracao_minutos: 30, ativo: true },
  { id: 's4', nome: 'Barba',                preco: 30, duracao_minutos: 20, ativo: true },
  { id: 's5', nome: 'Sobrancelha',          preco: 15, duracao_minutos: 10, ativo: true },
]

const CAT_LABEL: Record<ProdutoCategoria, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

export default function Produtos() {
  const [secao, setSecao] = useState<Secao>('produtos')

  // Produtos
  const [produtos, setProdutos] = useState<Produto[]>(MOCK_PROD)
  const [showProdModal, setShowProdModal] = useState(false)
  const [prodForm, setProdForm] = useState({
    nome: '', categoria: 'bebidas' as ProdutoCategoria,
    preco_custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '5',
  })

  // Serviços
  const [servicos, setServicos] = useState<Servico[]>(MOCK_SERV)
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [showServModal, setShowServModal] = useState(false)
  const [servForm, setServForm] = useState({
    nome: '', preco: '', duracao_minutos: '30',
    profissional_ids: [] as string[],
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const alertas = produtos.filter(p => p.estoque_atual <= p.estoque_minimo)

  useEffect(() => {
    supabase.from('produtos').select('*').order('nome')
      .then(({ data }) => { if (data && data.length > 0) setProdutos(data as Produto[]) })

    supabase
      .from('servicos')
      .select('*, profissionais:profissional_servicos(profissional:profissionais(*))')
      .order('nome')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const mapped = (data as any[]).map(s => ({
            ...s,
            profissionais: (s.profissionais ?? []).map((ps: any) => ps.profissional).filter(Boolean),
          }))
          setServicos(mapped as Servico[])
        }
      })

    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
  }, [])

  async function handleSaveProd() {
    if (!prodForm.nome.trim() || !prodForm.preco_venda) {
      setError('Nome e preço de venda são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('produtos').insert({
      nome: prodForm.nome, categoria: prodForm.categoria,
      preco_custo: Number(prodForm.preco_custo) || 0,
      preco_venda: Number(prodForm.preco_venda),
      estoque_atual: Number(prodForm.estoque_atual) || 0,
      estoque_minimo: Number(prodForm.estoque_minimo) || 5,
      ativo: true,
    }).select('*').single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) setProdutos(prev => [...prev, data as Produto])
    setProdForm({ nome: '', categoria: 'bebidas', preco_custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '5' })
    setShowProdModal(false); setSaving(false)
  }

  async function handleSaveServ() {
    if (!servForm.nome.trim() || !servForm.preco) {
      setError('Nome e preço são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('servicos').insert({
      nome: servForm.nome,
      preco: Number(servForm.preco),
      duracao_minutos: Number(servForm.duracao_minutos) || 30,
      ativo: true,
    }).select('*').single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data && servForm.profissional_ids.length > 0) {
      await supabase.from('profissional_servicos').insert(
        servForm.profissional_ids.map(pid => ({ profissional_id: pid, servico_id: (data as Servico).id }))
      )
    }
    if (data) {
      const novoServ: Servico = {
        ...(data as Servico),
        profissionais: profissionais.filter(p => servForm.profissional_ids.includes(p.id)),
      }
      setServicos(prev => [...prev, novoServ])
    }
    setServForm({ nome: '', preco: '', duracao_minutos: '30', profissional_ids: [] })
    setShowServModal(false); setSaving(false)
  }

  function toggleProfissional(id: string) {
    setServForm(f => ({
      ...f,
      profissional_ids: f.profissional_ids.includes(id)
        ? f.profissional_ids.filter(p => p !== id)
        : [...f.profissional_ids, id],
    }))
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Produtos & Serviços</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {secao === 'produtos' ? 'Estoque da conveniência' : 'Serviços oferecidos'}
          </p>
        </div>
        {secao === 'produtos' ? (
          <button className="btn btn-primary" onClick={() => { setError(''); setShowProdModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Produto
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => { setError(''); setShowServModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Serviço
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '2px',
        padding: '4px',
        background: '#1A1A1A',
        border: '1px solid #252525',
        borderRadius: '9px',
        width: 'fit-content',
        marginBottom: '24px',
      }}>
        {(['produtos', 'servicos'] as Secao[]).map(s => (
          <button
            key={s}
            onClick={() => setSecao(s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px',
              borderRadius: '7px',
              border: secao === s ? '1px solid #FFFFFF' : '1px solid transparent',
              background: secao === s ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: secao === s ? '#FFFFFF' : '#555',
              fontSize: '13px',
              fontWeight: secao === s ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            {s === 'produtos' ? <><Package size={13} /> Produtos</> : <><Scissors size={13} /> Serviços</>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {secao === 'produtos' ? (
          <motion.div key="produtos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
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
                <span>Produto</span><span>Categoria</span><span>Custo</span>
                <span>Venda</span><span>Estoque</span><span>Mínimo</span>
              </div>

              {produtos.map((p, i) => {
                const baixo  = p.estoque_atual <= p.estoque_minimo
                const margem = p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
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
                        {margem && <span style={{ fontSize: '10px', color: '#555', marginLeft: '8px' }}>+{margem}% margem</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666', textTransform: 'capitalize' }}>{CAT_LABEL[p.categoria]}</span>
                    <span style={{ fontSize: '13px', color: '#555' }}>{formatCurrency(p.preco_custo)}</span>
                    <span style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(p.preco_venda)}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: baixo ? '#FFFFFF' : '#A3A3A3' }}>
                      {p.estoque_atual}
                      {baixo && <AlertTriangle size={12} style={{ marginLeft: '4px', color: '#777', verticalAlign: 'middle' }} />}
                    </span>
                    <span style={{ fontSize: '13px', color: '#444' }}>{p.estoque_minimo}</span>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div key="servicos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 120px 100px 1fr',
                padding: '10px 24px',
                borderBottom: '1px solid #222',
                fontSize: '10px', fontWeight: 600, color: '#444',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'rgba(0,0,0,0.2)',
              }}>
                <span>Serviço</span><span>Preço</span><span>Duração</span><span>Profissionais</span>
              </div>

              {servicos.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
                  Nenhum serviço cadastrado.
                </div>
              ) : servicos.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 120px 100px 1fr',
                    padding: '14px 24px',
                    borderBottom: i < servicos.length - 1 ? '1px solid #1F1F1F' : 'none',
                    alignItems: 'center',
                  }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Scissors size={13} style={{ color: '#444', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{s.nome}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: '#A3A3A3', fontWeight: 500 }}>{formatCurrency(s.preco)}</span>
                  <span style={{ fontSize: '12px', color: '#666' }}>{s.duracao_minutos} min</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {s.profissionais && s.profissionais.length > 0
                      ? s.profissionais.map(p => (
                          <span key={p.id} style={{
                            fontSize: '10px', color: '#A3A3A3',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid #2A2A2A',
                            borderRadius: '99px',
                            padding: '2px 8px',
                          }}>{p.nome}</span>
                        ))
                      : <span style={{ fontSize: '12px', color: '#333' }}>—</span>
                    }
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Novo Produto */}
      <AnimatePresence>
        {showProdModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowProdModal(false)}
          >
            <motion.div
              className="card"
              style={{ width: '100%', maxWidth: '460px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Produto</h2>
                <button className="btn btn-icon" onClick={() => setShowProdModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome do produto" value={prodForm.nome} onChange={e => setProdForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Categoria</label>
                  <select className="input" value={prodForm.categoria} onChange={e => setProdForm(f => ({ ...f, categoria: e.target.value as ProdutoCategoria }))}>
                    <option value="bebidas">Bebidas</option>
                    <option value="pomadas">Pomadas</option>
                    <option value="petiscos">Petiscos</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Preço de Custo</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={prodForm.preco_custo} onChange={e => setProdForm(f => ({ ...f, preco_custo: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Preço de Venda *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={prodForm.preco_venda} onChange={e => setProdForm(f => ({ ...f, preco_venda: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Estoque Atual</label>
                    <input className="input" type="number" min={0} placeholder="0" value={prodForm.estoque_atual} onChange={e => setProdForm(f => ({ ...f, estoque_atual: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Estoque Mínimo</label>
                    <input className="input" type="number" min={0} placeholder="5" value={prodForm.estoque_minimo} onChange={e => setProdForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
                  </div>
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowProdModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveProd} disabled={saving}>
                    {saving ? 'Salvando...' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Novo Serviço */}
      <AnimatePresence>
        {showServModal && (
          <motion.div
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowServModal(false)}
          >
            <motion.div
              className="card"
              style={{ width: '100%', maxWidth: '460px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Serviço</h2>
                <button className="btn btn-icon" onClick={() => setShowServModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome do serviço" value={servForm.nome} onChange={e => setServForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Preço *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={servForm.preco} onChange={e => setServForm(f => ({ ...f, preco: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Duração (min)</label>
                    <input className="input" type="number" min={5} step={5} placeholder="30" value={servForm.duracao_minutos} onChange={e => setServForm(f => ({ ...f, duracao_minutos: e.target.value }))} />
                  </div>
                </div>
                {profissionais.length > 0 && (
                  <div className="field">
                    <label className="label">Profissionais</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      {profissionais.map(p => {
                        const checked = servForm.profissional_ids.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleProfissional(p.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '9px 12px',
                              borderRadius: '7px',
                              border: checked ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                              background: checked ? 'rgba(255,255,255,0.06)' : 'transparent',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all 0.12s',
                              textAlign: 'left',
                            }}
                          >
                            <div style={{
                              width: '16px', height: '16px',
                              borderRadius: '4px',
                              border: checked ? '1px solid #FFFFFF' : '1px solid #444',
                              background: checked ? '#FFFFFF' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {checked && <Check size={10} strokeWidth={3} style={{ color: '#0D0D0D' }} />}
                            </div>
                            <div>
                              <div style={{ fontSize: '13px', color: '#FFFFFF' }}>{p.nome}</div>
                              <div style={{ fontSize: '11px', color: '#555' }}>{p.especialidade}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowServModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveServ} disabled={saving}>
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
