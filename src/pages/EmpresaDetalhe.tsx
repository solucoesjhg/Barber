import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Building2, Copy, Check, UserCheck, UserPlus, UserMinus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import type { Empresa, UsuarioListado, PapelUsuario } from '../types'

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

export default function EmpresaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [codigoCopiado, setCodigoCopiado] = useState(false)
  const [papelPendente, setPapelPendente] = useState<Record<string, PapelUsuario>>({})

  function carregar() {
    if (!id) return
    setLoading(true)
    Promise.all([
      supabase.from('empresas').select('*').eq('id', id).single(),
      supabase.rpc('listar_usuarios'),
    ]).then(([{ data: emp }, { data: users, error: err }]) => {
      setEmpresa((emp as Empresa) ?? null)
      if (err) setError(err.message)
      setUsuarios((users ?? []) as UsuarioListado[])
      setLoading(false)
    })
  }

  useEffect(() => { carregar() }, [id])

  async function vincular(usuarioId: string, papel: PapelUsuario) {
    if (!id) return
    setBusyId(usuarioId); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: usuarioId, p_papel: papel, p_profissional_id: null, p_ativo: true, p_empresa_id: id,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  async function mudarPapel(u: UsuarioListado, papel: PapelUsuario) {
    setBusyId(u.usuario_id); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id, p_papel: papel, p_profissional_id: u.profissional_id ?? null, p_ativo: u.ativo, p_empresa_id: id,
      p_comissao_percentual: u.comissao_percentual ?? null,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  async function mudarComissao(u: UsuarioListado, comissao: string) {
    setBusyId(u.usuario_id); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id, p_papel: u.papel, p_profissional_id: u.profissional_id ?? null, p_ativo: u.ativo, p_empresa_id: id,
      p_comissao_percentual: comissao === '' ? null : Number(comissao),
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  async function desvincular(u: UsuarioListado) {
    if (!window.confirm('Desvincular esse usuário da loja? Ele deixa de acessar os dados dela até ser vinculado de novo.')) return
    setBusyId(u.usuario_id); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id, p_papel: u.papel, p_profissional_id: null, p_ativo: true, p_empresa_id: null,
      p_comissao_percentual: u.comissao_percentual ?? null,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  function copiarCodigo() {
    if (!empresa?.codigo) return
    navigator.clipboard?.writeText(empresa.codigo).then(() => {
      setCodigoCopiado(true)
      setTimeout(() => setCodigoCopiado(false), 1500)
    })
  }

  const vinculados = usuarios.filter(u => u.empresa_id === id)
  const pendentes = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && u.ativo)

  if (loading) {
    return <div className="page"><p style={{ color: '#444', fontSize: '13px' }}>Carregando...</p></div>
  }
  if (!empresa) {
    return <div className="page"><p style={{ color: '#444', fontSize: '13px' }}>Loja não encontrada.</p></div>
  }

  return (
    <div className="page">
      <button
        onClick={() => navigate('/empresas')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}
      >
        <ArrowLeft size={13} /> Empresas
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '10px',
          background: '#262626', border: '1px solid #333',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Building2 size={18} style={{ color: '#A3A3A3' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '22px', color: '#FFFFFF' }}>{empresa.nome}</h1>
          <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>Desde {formatDate(empresa.created_at)} · {empresa.email ?? 'sem e-mail de contato'}</p>
        </div>
        <button
          onClick={copiarCodigo}
          title="Copiar código"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', fontFamily: 'monospace', color: '#A3A3A3',
            background: 'rgba(255,255,255,0.04)', border: '1px solid #2A2A2A', borderRadius: '8px',
            padding: '10px 14px', cursor: 'pointer',
          }}
        >
          {codigoCopiado ? <Check size={13} /> : <Copy size={13} />}
          {empresa.codigo ?? '—'}
        </button>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      {/* Vinculados */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <UserCheck size={14} style={{ color: '#555' }} />
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Usuários desta loja</p>
        <span style={{ fontSize: '11px', color: '#555' }}>({vinculados.length})</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '28px' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 140px 90px 100px 90px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span><span>Papel</span><span>Comissão</span><span>Ativo</span><span>Desde</span><span></span>
        </div>
        {vinculados.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhum usuário vinculado ainda.</div>
        ) : vinculados.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 90px 100px 90px 90px',
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < vinculados.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: busyId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
            <select
              className="input"
              style={{ fontSize: '12px', padding: '6px 8px' }}
              value={u.papel}
              onChange={e => mudarPapel(u, e.target.value as PapelUsuario)}
              disabled={busyId === u.usuario_id}
            >
              {Object.entries(PAPEL_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <input
              className="input" type="number" min={0} max={100} step={0.1}
              style={{ fontSize: '12px', padding: '6px 8px' }}
              placeholder="0%"
              value={u.comissao_percentual ?? ''}
              onChange={e => mudarComissao(u, e.target.value)}
              disabled={busyId === u.usuario_id}
            />
            <span style={{ fontSize: '11px', color: u.ativo ? '#A3A3A3' : '#444' }}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
            <button
              className="btn btn-icon"
              title="Desvincular da loja"
              onClick={() => desvincular(u)}
              disabled={busyId === u.usuario_id}
            >
              <UserMinus size={12} />
            </button>
          </motion.div>
        ))}
      </div>

      {/* Pendentes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <UserPlus size={14} style={{ color: '#555' }} />
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Aguardando vínculo (qualquer loja)</p>
        <span style={{ fontSize: '11px', color: '#555' }}>({pendentes.length})</span>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', gridTemplateColumns: '1fr 140px 130px 100px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span><span>Desde</span><span>Papel</span><span></span>
        </div>
        {pendentes.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhum cadastro esperando vínculo.</div>
        ) : pendentes.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 140px 130px 100px',
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < pendentes.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: busyId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
            <select
              className="input"
              style={{ fontSize: '12px', padding: '6px 8px' }}
              value={papelPendente[u.usuario_id] ?? 'atendente'}
              onChange={e => setPapelPendente(prev => ({ ...prev, [u.usuario_id]: e.target.value as PapelUsuario }))}
            >
              {Object.entries(PAPEL_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => vincular(u.usuario_id, papelPendente[u.usuario_id] ?? 'atendente')}
              disabled={busyId === u.usuario_id}
            >
              Vincular aqui
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
