import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Building2, Copy, Check, UserCheck, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { nomeExibicao, papeisQuePossoAtribuir } from '../lib/permissoes'
import UsuarioCard from '../components/usuarios/UsuarioCard'
import NovoUsuarioModal from '../components/usuarios/NovoUsuarioModal'
import type { Empresa, UsuarioListado } from '../types'

const PAPEIS_SUPER = papeisQuePossoAtribuir('super_admin')

export default function EmpresaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [codigoCopiado, setCodigoCopiado] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [showNovo, setShowNovo] = useState(false)

  function carregar() {
    if (!id) return
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

  useEffect(() => { setLoading(true); carregar() }, [id])

  function copiarCodigo() {
    if (!empresa?.codigo) return
    navigator.clipboard?.writeText(empresa.codigo).then(() => {
      setCodigoCopiado(true)
      setTimeout(() => setCodigoCopiado(false), 1500)
    })
  }

  const vinculados = usuarios
    .filter(u => u.empresa_id === id)
    .sort((a, b) => Number(b.papel === 'administrador') - Number(a.papel === 'administrador') || nomeExibicao(a).localeCompare(nomeExibicao(b)))
  const temAdmin = vinculados.some(u => u.papel === 'administrador' && u.ativo)

  if (loading) {
    return <div className="page"><p style={{ color: 'var(--c-66)', fontSize: '13px' }}>Carregando...</p></div>
  }
  if (!empresa) {
    return <div className="page"><p style={{ color: 'var(--c-66)', fontSize: '13px' }}>Loja não encontrada.</p></div>
  }

  return (
    <div className="page">
      <button
        onClick={() => navigate('/empresas')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-a3)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}
      >
        <ArrowLeft size={13} /> Empresas
      </button>

      <div className="empresa-cabecalho">
        <div className="usuario-avatar" style={{ borderRadius: '10px', width: '44px', height: '44px' }}>
          <Building2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '22px', color: 'var(--c-fff)', overflowWrap: 'anywhere' }}>{empresa.nome}</h1>
          <p style={{ fontSize: '12px', color: 'var(--c-a3)', marginTop: '2px' }}>
            Desde {formatDate(empresa.created_at)} · {empresa.email ?? 'sem e-mail de contato'}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={copiarCodigo} title="Copiar código da loja" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace' }}>
          {codigoCopiado ? <Check size={13} /> : <Copy size={13} />}
          {empresa.codigo ?? '—'}
        </button>
      </div>

      {error && <p className="aviso-erro" style={{ marginBottom: '16px' }}>{error}</p>}

      {/* Usuários da loja */}
      <div className="secao-cabecalho" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={14} style={{ color: 'var(--c-a3)' }} />
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>Usuários desta loja</p>
          <span style={{ fontSize: '11px', color: 'var(--c-a3)' }}>({vinculados.length})</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNovo(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={13} strokeWidth={2.5} /> {temAdmin ? 'Novo Usuário' : 'Cadastrar Administrador'}
        </button>
      </div>

      {!temAdmin && (
        <p className="aviso-info" style={{ marginBottom: '12px' }}>
          Esta loja ainda não tem administrador. Cadastre um: ele entra com o e-mail e a senha que você definir e cadastra o resto da equipe pelo sistema.
        </p>
      )}

      {vinculados.length === 0 ? (
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--c-66)', fontSize: '13px', marginBottom: '28px' }}>Nenhum usuário nesta loja ainda.</div>
      ) : (
        <div className="usuarios-lista" style={{ marginBottom: '28px' }}>
          {vinculados.map(u => (
            <UsuarioCard
              key={u.usuario_id}
              usuario={u}
              aberto={abertoId === u.usuario_id}
              onToggle={() => setAbertoId(a => a === u.usuario_id ? null : u.usuario_id)}
              papeis={PAPEIS_SUPER}
              profissionais={[]}
              podeEditar={u.papel !== 'super_admin'}
              comPermissoes={false}
              onSaved={carregar}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showNovo && (
          <NovoUsuarioModal
            papeis={temAdmin ? PAPEIS_SUPER : ['administrador']}
            profissionais={[]}
            empresaId={id}
            onClose={() => setShowNovo(false)}
            onCreated={novoId => { setShowNovo(false); setAbertoId(novoId); carregar() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
