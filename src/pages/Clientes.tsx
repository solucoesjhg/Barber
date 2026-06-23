import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, X, Phone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, initials } from '../lib/utils'
import type { Cliente } from '../types'

const MOCK: Cliente[] = [
  { id: '1', nome: 'Rafael Mendes',  telefone: '(11) 99887-6655', email: 'rafael@email.com', created_at: new Date().toISOString() },
  { id: '2', nome: 'Gustavo Lima',   telefone: '(11) 98765-4321', created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: '3', nome: 'Bruno Castro',   telefone: '(11) 91234-5678', created_at: new Date(Date.now() - 86400000 * 5).toISOString() },
  { id: '4', nome: 'Thiago Rocha',   telefone: '(11) 97654-3210', created_at: new Date(Date.now() - 86400000 * 8).toISOString() },
  { id: '5', nome: 'Lucas Ferreira', telefone: '(11) 96543-2109', email: 'lucas@email.com', created_at: new Date(Date.now() - 86400000 * 12).toISOString() },
  { id: '6', nome: 'Matheus Souza',  telefone: '(11) 95432-1098', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
]

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>(MOCK)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nome: '', telefone: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome')
      .then(({ data }) => { if (data && data.length > 0) setClientes(data as Cliente[]) })
  }, [])

  const filtered = clientes.filter(c =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone.includes(search)
  )

  async function handleSave() {
    if (!form.nome.trim() || !form.telefone.trim()) {
      setError('Nome e telefone são obrigatórios.')
      return
    }
    setSaving(true); setError('')
    const { data, error: err } = await supabase
      .from('clientes')
      .insert({ nome: form.nome, telefone: form.telefone, email: form.email || null })
      .select('*')
      .single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) setClientes(prev => [...prev, data as Cliente])
    setForm({ nome: '', telefone: '', email: '' })
    setShowModal(false)
    setSaving(false)
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Clientes</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{clientes.length} cadastrados</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Cliente
        </button>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '11px 14px',
        background: '#1A1A1A',
        border: '1px solid #252525',
        borderRadius: '8px',
        marginBottom: '20px',
      }}>
        <Search size={14} style={{ color: '#444', flexShrink: 0 }} />
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: '#FFFFFF', fontFamily: 'inherit' }}
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 180px 110px',
          padding: '10px 24px',
          borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Nome</span>
          <span>Telefone</span>
          <span>E-mail</span>
          <span>Cadastro</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum cliente encontrado.
          </div>
        ) : filtered.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 180px 110px',
              padding: '14px 24px',
              borderBottom: i < filtered.length - 1 ? '1px solid #1F1F1F' : 'none',
              alignItems: 'center',
              cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px',
                borderRadius: '50%',
                background: '#262626',
                border: '1px solid #333',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: '#A3A3A3',
                flexShrink: 0,
              }}>
                {initials(c.nome)}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{c.nome}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#A3A3A3' }}>
              <Phone size={11} style={{ color: '#444' }} /> {c.telefone}
            </div>
            <div style={{ fontSize: '13px', color: '#555' }}>
              {c.email ?? <span style={{ color: '#333' }}>—</span>}
            </div>
            <div style={{ fontSize: '12px', color: '#444' }}>{formatDate(c.created_at)}</div>
          </motion.div>
        ))}
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
              style={{ width: '100%', maxWidth: '420px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Cliente</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Telefone *</label>
                  <input className="input" placeholder="(11) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">E-mail</label>
                  <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
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
