import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Building2, Copy, Check, UserCheck, UserPlus, UserMinus, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { PAPEL_LABEL, nomeExibicao, papeisQuePossoAtribuir } from '../lib/permissoes'
import UsuarioCard from '../components/usuarios/UsuarioCard'
import NovoUsuarioModal from '../components/usuarios/NovoUsuarioModal'
import type { Empresa, UsuarioListado, PapelUsuario } from '../types'

const PAPEIS_SUPER = papeisQuePossoAtribuir('super_admin')

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

  async function vincular(usuarioId: string, papel: PapelUsuario) {
    if (!id) return
    setBusyId(usuarioId); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: usuarioId, p_papel: papel, p_profissional_id: null, p_ativo: true, p_empresa_id: id,
      p_comissao_percentual: null,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  async function desvincular(u: UsuarioListado) {
    if (!window.confirm(`Desvincular ${nomeExibicao(u)} da loja? Ele deixa de acessar os dados dela até ser vinculado de novo.`)) return
    setBusyId(u.usuario_id); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id, p_papel: u.papel, p_profissional_id: null, p_ativo: true, p_empresa_id: null,
      p_comissao_percentual: u.comissao_percentual ?? null,
    })
    setBusyId(null)
    if (err) { setError(err.message); return }
    setAbertoId(null)
    carregar()
  }

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
  const pendentes = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && u.ativo)

  if (loading) {
    return <div className="page"><p style={{ color: '#666', fontSize: '13px' }}>Carregando...</p></div>
  }
  if (!empresa) {
    return <div className="page"><p style={{ color: '#666', fontSize: '13px' }}>Loja não encontrada.</p></div>
  }

  return (
    <div className="page">
      <button
        onClick={() => navigate('/empresas')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#A3A3A3', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}
      >
        <ArrowLeft size={13} /> Empresas
      </button>

      <div className="empresa-cabecalho">
        <div className="usuario-avatar" style={{ borderRadius: '10px', width: '44px', height: '44px' }}>
          <Building2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: '22px', color: '#FFFFFF', overflowWrap: 'anywhere' }}>{empresa.nome}</h1>
          <p style={{ fontSize: '12px', color: '#A3A3A3', marginTop: '2px' }}>
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
          <UserCheck size={14} style={{ color: '#A3A3A3' }} />
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Usuários desta loja</p>
          <span style={{ fontSize: '11px', color: '#A3A3A3' }}>({vinculados.length})</span>
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
        <div className="card" style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '13px', marginBottom: '28px' }}>Nenhum usuário nesta loja ainda.</div>
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
              acoesExtras={
                <button className="btn btn-secondary btn-sm" onClick={() => desvincular(u)} disabled={busyId === u.usuario_id}>
                  <UserMinus size={13} /> Desvincular da loja
                </button>
              }
            />
          ))}
        </div>
      )}

      {/* Cadastros públicos esperando vínculo */}
      {pendentes.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <UserPlus size={14} style={{ color: '#A3A3A3' }} />
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Aguardando vínculo (qualquer loja)</p>
            <span style={{ fontSize: '11px', color: '#A3A3A3' }}>({pendentes.length})</span>
          </div>
          <div className="usuarios-lista">
            {pendentes.map(u => (
              <div key={u.usuario_id} className="usuario-card pendente-linha" style={{ opacity: busyId === u.usuario_id ? 0.6 : 1 }}>
                <div className="usuario-identidade">
                  <span className="usuario-nome">{u.email}</span>
                  <span className="usuario-email">Cadastrado em {formatDate(u.criado_em)}</span>
                </div>
                <select
                  className="input"
                  value={papelPendente[u.usuario_id] ?? 'atendente'}
                  onChange={e => setPapelPendente(prev => ({ ...prev, [u.usuario_id]: e.target.value as PapelUsuario }))}
                >
                  {PAPEIS_SUPER.map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
                </select>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => vincular(u.usuario_id, papelPendente[u.usuario_id] ?? 'atendente')}
                  disabled={busyId === u.usuario_id}
                >
                  Vincular aqui
                </button>
              </div>
            ))}
          </div>
        </>
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
