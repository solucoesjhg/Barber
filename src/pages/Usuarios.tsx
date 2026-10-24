import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../hooks/usePerfil'
import { useAuth } from '../hooks/useAuth'
import { PAPEL_LABEL, nomeExibicao, papeisQuePossoAtribuir } from '../lib/permissoes'
import UsuarioCard from '../components/usuarios/UsuarioCard'
import NovoUsuarioModal from '../components/usuarios/NovoUsuarioModal'
import UsuarioDetalheModal from '../components/usuarios/UsuarioDetalheModal'
import type { UsuarioListado, Profissional } from '../types'

export default function Usuarios() {
  const { papel: meuPapel } = usePerfil()

  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const abertoId = searchParams.get('usuario')
  const [showNovo, setShowNovo] = useState(false)
  // Card de visualização (clique na lista); "Editar" abre o cartão de edição.
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

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

  // ── Visão da loja (administrador / gerente) ──────────────────
  const papeisAtribuiveis = papeisQuePossoAtribuir(meuPapel)
  // Mesma regra do banco: só gerencia quem está abaixo dele, nunca a si mesmo.
  const podeEditarUsuario = (u: UsuarioListado) => u.usuario_id !== user?.id && papeisAtribuiveis.includes(u.papel)
  const motivoSomenteLeitura = (u: UsuarioListado) =>
    u.usuario_id === user?.id ? 'Você não pode alterar o seu próprio usuário. Peça a quem está acima de você.'
      : u.papel === 'administrador' ? 'Administrador só é alterado pelo suporte da plataforma.'
        : `Só o administrador pode alterar um ${PAPEL_LABEL[u.papel].toLowerCase()}.`

  // Clique no usuário: mostra o card com as informações. Se o cartão de
  // edição dele estiver aberto, o clique fecha a edição.
  function alternar(id: string) {
    if (abertoId === id) setSearchParams({}, { replace: true })
    else setDetalheId(id)
  }

  function editar(id: string) {
    setDetalheId(null)
    setSearchParams({ usuario: id }, { replace: true })
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = usuarios
    .filter(u => !termo || nomeExibicao(u).toLowerCase().includes(termo) || u.email.toLowerCase().includes(termo))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || nomeExibicao(a).localeCompare(nomeExibicao(b)))

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Usuários</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-a3)', marginTop: '3px' }}>
            {usuarios.filter(u => u.ativo).length} ativos · {usuarios.length} cadastrados · toque num usuário para ver os dados e as permissões
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
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-66)', fontSize: '13px' }}>Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-66)', fontSize: '13px' }}>
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
        {(() => {
          const u = detalheId ? usuarios.find(x => x.usuario_id === detalheId) : undefined
          if (!u) return null
          return (
            <UsuarioDetalheModal
              key={u.usuario_id}
              usuario={u}
              profissionais={profissionais}
              podeEditar={podeEditarUsuario(u)}
              motivoSomenteLeitura={motivoSomenteLeitura(u)}
              onClose={() => setDetalheId(null)}
              onEditar={() => editar(u.usuario_id)}
            />
          )
        })()}
      </AnimatePresence>

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
