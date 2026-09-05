import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Scissors, Percent } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { initials } from '../lib/utils'
import type { Profissional } from '../types'

const FORM_INICIAL = { nome: '', especialidade: '', comissao_percentual: '50', telefone: '', email: '', documento: '', valor_fixo: '' }

export default function Profissionais() {
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { setProfissionais((data ?? []) as Profissional[]); setLoading(false) })
  }, [])

  async function handleSave() {
    if (!form.nome.trim() || !form.especialidade.trim()) {
      setError('Nome e especialidade são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const { data, error: err } = await supabase
      .from('profissionais')
      .insert({
        nome: form.nome,
        especialidade: form.especialidade,
        comissao_percentual: Number(form.comissao_percentual),
        telefone: form.telefone || null,
        email: form.email || null,
        documento: form.documento || null,
        valor_fixo: form.valor_fixo ? Number(form.valor_fixo) : null,
        ativo: true,
      })
      .select('*').single()
    if (err) { setError(err.message); setSaving(false); return }
    if (data) setProfissionais(prev => [...prev, data as Profissional])
    setForm(FORM_INICIAL)
    setShowModal(false); setSaving(false)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    setProfissionais(prev => prev.map(p => p.id === id ? { ...p, ativo: !ativo } : p))
    await supabase.from('profissionais').update({ ativo: !ativo }).eq('id', id)
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Profissionais</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>{profissionais.length} profissionais</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Profissional
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
      ) : profissionais.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
          Nenhum profissional cadastrado.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
        {profissionais.map((p, i) => (
          <motion.div
            key={p.id}
            className="card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px',
                borderRadius: '50%',
                background: '#262626',
                border: '1px solid #333',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, color: '#A3A3A3',
                flexShrink: 0,
              }}>
                {initials(p.nome)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif' }}>{p.nome}</h3>
                  <span
                    style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '99px',
                      border: p.ativo ? '1px solid rgba(255,255,255,0.2)' : '1px dashed #333',
                      color: p.ativo ? '#A3A3A3' : '#444',
                    }}
                  >
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scissors size={11} style={{ color: '#444' }} />
                  <span style={{ fontSize: '12px', color: '#666' }}>{p.especialidade}</span>
                </div>
                {(p.email || p.documento) && (
                  <p style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>
                    {[p.email, p.documento].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            <div style={{ height: '1px', background: '#222', margin: '16px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Comissão</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Percent size={13} style={{ color: '#A3A3A3' }} />
                  <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif' }}>
                    {p.comissao_percentual}
                  </span>
                </div>
              </div>

              {p.valor_fixo ? (
                <div>
                  <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Valor fixo</p>
                  <p style={{ fontSize: '13px', color: '#A3A3A3' }}>R$ {p.valor_fixo.toFixed(2)}</p>
                </div>
              ) : p.telefone ? (
                <div>
                  <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Telefone</p>
                  <p style={{ fontSize: '13px', color: '#A3A3A3' }}>{p.telefone}</p>
                </div>
              ) : null}

              <button
                onClick={() => toggleAtivo(p.id, p.ativo)}
                className="btn btn-secondary btn-sm"
              >
                {p.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </motion.div>
        ))}
      </div>
      )}

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
              style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Profissional</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Nome *</label>
                  <input className="input" placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="label">Especialidade *</label>
                  <input className="input" placeholder="Ex: Cabelo e Barba" value={form.especialidade} onChange={e => setForm(f => ({ ...f, especialidade: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Comissão (%)</label>
                    <input className="input" type="number" min={0} max={100} value={form.comissao_percentual} onChange={e => setForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Valor fixo (R$)</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="opcional" value={form.valor_fixo} onChange={e => setForm(f => ({ ...f, valor_fixo: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Telefone</label>
                    <input className="input" placeholder="(11) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">E-mail</label>
                    <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Documento (CPF)</label>
                  <input className="input" placeholder="000.000.000-00" value={form.documento} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} />
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
