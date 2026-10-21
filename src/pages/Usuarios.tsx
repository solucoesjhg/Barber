import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, UserX, UserCheck, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../hooks/usePerfil'
import { formatDate, initials } from '../lib/utils'
import { useAuth } from '../hooks/useAuth'
import { PAPEL_LABEL as PAPEL_LABEL_LOJA, nomeExibicao, papeisQuePossoAtribuir } from '../lib/permissoes'
import UsuarioCard from '../components/usuarios/UsuarioCard'
import NovoUsuarioModal from '../components/usuarios/NovoUsuarioModal'
import type { UsuarioListado, PapelUsuario, Profissional, Empresa } from '../types'

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

export default function Usuarios() {
  const { papel: meuPapel } = usePerfil()
  const souSuperAdmin = meuPapel === 'super_admin'

  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const abertoId = searchParams.get('usuario')
  const [showNovo, setShowNovo] = useState(false)
  const [busca, setBusca] = useState('')

  function carregar() {
    setLoading(true)
    supabase.rpc('listar_usuarios').then(({ data, error: err }) => {
      if (err) { setError(err.message); setLoading(false); return }
      setUsuarios((data ?? []) as UsuarioListado[])
      setLoading(false)
    })
    if (souSuperAdmin) {
      supabase.from('empresas').select('*').eq('ativo', true).order('nome')
        .then(({ data }) => { if (data) setEmpresas(data as Empresa[]) })
    } else {
      supabase.from('profissionais').select('*').order('nome')
        .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
    }
  }

  useEffect(() => { carregar() }, [souSuperAdmin])

  const [papelPendente, setPapelPendente] = useState<Record<string, PapelUsuario>>({})

  async function vincularComPapel(u: UsuarioListado, empresaId: string) {
    const papel = papelPendente[u.usuario_id] ?? 'atendente'
    setSavingId(u.usuario_id); setError('')
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id, p_papel: papel, p_profissional_id: null, p_ativo: true, p_empresa_id: empresaId,
      p_comissao_percentual: null,
    })
    setSavingId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  async function definirAtivoPendente(usuarioId: string, ativo: boolean) {
    setSavingId(usuarioId); setError('')
    const { error: err } = await supabase.rpc('definir_ativo_usuario_pendente', { p_usuario_id: usuarioId, p_ativo: ativo })
    setSavingId(null)
    if (err) { setError(err.message); return }
    carregar()
  }

  if (souSuperAdmin) {
    const pendentes = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && u.ativo)
    const rejeitados = usuarios.filter(u => !u.empresa_id && u.papel !== 'super_admin' && !u.ativo)

    return (
      <div className="page">
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Pendências</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            Logins ainda sem loja — vincule aqui ou abra a loja certa em Empresas pra fazer isso lá.
          </p>
        </div>

        {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

        <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="list-header" style={{
            display: 'grid', minWidth: '740px', gridTemplateColumns: '1fr 130px 140px 200px 40px',
            padding: '10px 24px', borderBottom: '1px solid #222',
            fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <span>E-mail</span><span>Desde</span><span>Papel</span><span>Vincular a</span><span></span>
          </div>

          {loading ? (
            <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
          ) : pendentes.length === 0 ? (
            <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
              Nenhum cadastro esperando vínculo com loja.
            </div>
          ) : pendentes.map((u, i) => (
            <motion.div
              key={u.usuario_id}
              className="list-row"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
              style={{
                display: 'grid', minWidth: '740px', gridTemplateColumns: '1fr 130px 140px 200px 40px',
                padding: '12px 24px', alignItems: 'center',
                borderBottom: i < pendentes.length - 1 ? '1px solid #1A1A1A' : 'none',
                opacity: savingId === u.usuario_id ? 0.6 : 1,
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
              <select
                className="input"
                style={{ fontSize: '12px', padding: '6px 8px' }}
                value=""
                onChange={e => e.target.value && vincularComPapel(u, e.target.value)}
              >
                <option value="">Selecionar loja...</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome} ({emp.codigo})</option>)}
              </select>
              <button
                className="btn btn-icon" title="Rejeitar cadastro"
                onClick={() => window.confirm(`Rejeitar o cadastro de ${u.email}? Ele deixa de aparecer aqui e fica inativo até você reativar.`) && definirAtivoPendente(u.usuario_id, false)}
                disabled={savingId === u.usuario_id}
              >
                <UserX size={13} />
              </button>
            </motion.div>
          ))}
        </div>

        {/* Cards (mobile) */}
        {!loading && pendentes.length > 0 && (
          <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
            {pendentes.map((u, i) => (
              <motion.div
                key={u.usuario_id}
                className="card entity-card"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                style={{ opacity: savingId === u.usuario_id ? 0.6 : 1 }}
              >
                <div className="entity-header" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div className="entity-avatar" style={{
                    width: '44px', height: '44px', borderRadius: '50%',
                    background: '#262626', border: '1px solid #333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 700, color: '#A3A3A3', flexShrink: 0,
                  }}>
                    {initials(u.email.split('@')[0])}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="entity-title" style={{
                      fontSize: '15px', fontWeight: 600, color: '#FFFFFF', fontFamily: 'DM Sans, sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{u.email}</h3>
                    <p className="entity-subtle" style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>Desde {formatDate(u.criado_em)}</p>
                  </div>
                </div>
                <div className="entity-divider" style={{ height: '1px', background: '#222', margin: '16px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Papel</p>
                    <select
                      className="input"
                      style={{ fontSize: '13px' }}
                      value={papelPendente[u.usuario_id] ?? 'atendente'}
                      onChange={e => setPapelPendente(prev => ({ ...prev, [u.usuario_id]: e.target.value as PapelUsuario }))}
                    >
                      {Object.entries(PAPEL_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Vincular a</p>
                    <select
                      className="input"
                      style={{ fontSize: '13px' }}
                      value=""
                      onChange={e => e.target.value && vincularComPapel(u, e.target.value)}
                    >
                      <option value="">Selecionar loja...</option>
                      {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome} ({emp.codigo})</option>)}
                    </select>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => window.confirm(`Rejeitar o cadastro de ${u.email}? Ele deixa de aparecer aqui e fica inativo até você reativar.`) && definirAtivoPendente(u.usuario_id, false)}
                    disabled={savingId === u.usuario_id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <UserX size={13} /> Rejeitar cadastro
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        {!loading && pendentes.length === 0 && (
          <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum cadastro esperando vínculo com loja.
          </div>
        )}

        {rejeitados.length > 0 && (
          <>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', margin: '28px 0 12px' }}>Rejeitados ({rejeitados.length})</p>
            <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
              {rejeitados.map((u, i) => (
                <motion.div
                  key={u.usuario_id}
                  className="list-row"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  style={{
                    display: 'grid', minWidth: '400px', gridTemplateColumns: '1fr 130px 40px',
                    padding: '12px 24px', alignItems: 'center',
                    borderBottom: i < rejeitados.length - 1 ? '1px solid #1A1A1A' : 'none',
                    opacity: savingId === u.usuario_id ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#666' }}>{u.email}</span>
                  <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
                  <button
                    className="btn btn-icon" title="Reativar (volta pra fila de pendências)"
                    onClick={() => definirAtivoPendente(u.usuario_id, true)}
                    disabled={savingId === u.usuario_id}
                  >
                    <UserCheck size={13} />
                  </button>
                </motion.div>
              ))}
            </div>
            <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
              {rejeitados.map((u, i) => (
                <motion.div
                  key={u.usuario_id}
                  className="card entity-card"
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  style={{ opacity: savingId === u.usuario_id ? 0.6 : 1 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="entity-title" style={{ fontSize: '13px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                      <p className="entity-subtle" style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>Desde {formatDate(u.criado_em)}</p>
                    </div>
                    <button
                      className="btn btn-icon" title="Reativar (volta pra fila de pendências)"
                      onClick={() => definirAtivoPendente(u.usuario_id, true)}
                      disabled={savingId === u.usuario_id}
                    >
                      <UserCheck size={13} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}

        <p style={{ fontSize: '12px', color: '#444', marginTop: '20px' }}>
          Pra ver ou desvincular quem já está numa loja, abra a loja em{' '}
          <Link to="/empresas" style={{ color: '#A3A3A3', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Empresas <ExternalLink size={11} />
          </Link>.
        </p>
      </div>
    )
  }

  // ── Visão da loja (administrador / gerente) ──────────────────
  const papeisAtribuiveis = papeisQuePossoAtribuir(meuPapel)
  // Mesma regra do banco: só gerencia quem está abaixo dele, nunca a si mesmo.
  const podeEditarUsuario = (u: UsuarioListado) => u.usuario_id !== user?.id && papeisAtribuiveis.includes(u.papel)
  const motivoSomenteLeitura = (u: UsuarioListado) =>
    u.usuario_id === user?.id ? 'Você não pode alterar o seu próprio usuário. Peça a quem está acima de você.'
      : u.papel === 'administrador' ? 'Administrador só é alterado pelo suporte da plataforma.'
        : `Só o administrador pode alterar um ${PAPEL_LABEL_LOJA[u.papel].toLowerCase()}.`

  function alternar(id: string) {
    setSearchParams(abertoId === id ? {} : { usuario: id }, { replace: true })
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = usuarios
    .filter(u => !termo || nomeExibicao(u).toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || nomeExibicao(a).localeCompare(nomeExibicao(b)))

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Usuários</h1>
          <p style={{ fontSize: '13px', color: '#A3A3A3', marginTop: '3px' }}>
            {usuarios.filter(u => u.ativo).length} ativos · {usuarios.length} cadastrados · toque num usuário para editar dados e permissões
          </p>
        </div>
        {papeisAtribuiveis.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowNovo(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Usuário
          </button>
        )}
      </div>

      {usuarios.length > 5 && (
        <input
          className="input" placeholder="Buscar por nome ou e-mail" value={busca}
          onChange={e => setBusca(e.target.value)} style={{ marginBottom: '16px', maxWidth: '360px' }}
        />
      )}

      {error && <p className="aviso-erro" style={{ marginBottom: '16px' }}>{error}</p>}

      {loading ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#666', fontSize: '13px' }}>Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
          {termo ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado ainda. Use "Novo Usuário" para cadastrar a equipe.'}
        </div>
      ) : (
        <div className="usuarios-lista">
          {visiveis.map(u => (
            <UsuarioCard
              key={u.usuario_id}
              usuario={u}
              aberto={abertoId === u.usuario_id}
              onToggle={() => alternar(u.usuario_id)}
              papeis={papeisAtribuiveis}
              profissionais={profissionais}
              podeEditar={podeEditarUsuario(u)}
              motivoSomenteLeitura={motivoSomenteLeitura(u)}
              comPermissoes
              onSaved={carregar}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showNovo && (
          <NovoUsuarioModal
            papeis={papeisAtribuiveis}
            profissionais={profissionais}
            onClose={() => setShowNovo(false)}
            onCreated={id => {
              setShowNovo(false)
              carregar()
              // Abre o cartão do novo usuário para ajustar as permissões.
              setSearchParams({ usuario: id }, { replace: true })
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
