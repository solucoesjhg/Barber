import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import type { UsuarioListado, PapelUsuario, Profissional } from '../types'

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function carregar() {
    setLoading(true)
    supabase.rpc('listar_usuarios').then(({ data, error: err }) => {
      if (err) { setError(err.message); setLoading(false); return }
      setUsuarios((data ?? []) as UsuarioListado[])
      setLoading(false)
    })
    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
  }

  useEffect(() => { carregar() }, [])

  async function salvar(u: UsuarioListado, campo: 'papel' | 'profissional_id' | 'ativo', valor: string | boolean) {
    const atualizado = { ...u, [campo]: valor === '' ? null : valor }
    setUsuarios(prev => prev.map(x => x.usuario_id === u.usuario_id ? atualizado : x))
    setSavingId(u.usuario_id)
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id,
      p_papel: atualizado.papel,
      p_profissional_id: atualizado.profissional_id || null,
      p_ativo: atualizado.ativo,
    })
    setSavingId(null)
    if (err) setError(err.message)
  }

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Usuários</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>Papéis de acesso (visível só pra administradores)</p>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 160px 200px 90px 100px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span><span>Papel</span><span>Vinculado a</span><span>Ativo</span><span>Desde</span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : usuarios.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum usuário encontrado (ou você não tem permissão de administrador).
          </div>
        ) : usuarios.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 160px 200px 90px 100px',
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < usuarios.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: savingId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
            <select
              className="input"
              style={{ fontSize: '12px', padding: '6px 8px' }}
              value={u.papel}
              onChange={e => salvar(u, 'papel', e.target.value)}
            >
              {Object.entries(PAPEL_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <select
              className="input"
              style={{ fontSize: '12px', padding: '6px 8px' }}
              value={u.profissional_id ?? ''}
              onChange={e => salvar(u, 'profissional_id', e.target.value)}
            >
              <option value="">Nenhum profissional</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <input type="checkbox" checked={u.ativo} onChange={e => salvar(u, 'ativo', e.target.checked)} />
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
