import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { RotateCcw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { initials } from '../lib/utils'
import { GRUPOS_TELAS, PAPEL_LABEL, TELAS } from '../lib/permissoes'
import type { PermissoesUsuario, TelaId, UsuarioListado } from '../types'

type Rascunho = {
  telas: Record<TelaId, { ver: boolean; editar: boolean }>
  ver_vendas_outros: boolean
  ver_custo_produtos: boolean
}

function rascunhoDe(p: PermissoesUsuario): Rascunho {
  const telas = {} as Rascunho['telas']
  for (const t of TELAS) telas[t.id] = { ver: !!p.telas[t.id]?.ver, editar: !!p.telas[t.id]?.editar }
  return { telas, ver_vendas_outros: p.ver_vendas_outros, ver_custo_produtos: p.ver_custo_produtos }
}

function iguais(a: Rascunho, b: Rascunho) {
  return a.ver_vendas_outros === b.ver_vendas_outros
    && a.ver_custo_produtos === b.ver_custo_produtos
    && TELAS.every(t => a.telas[t.id].ver === b.telas[t.id].ver && a.telas[t.id].editar === b.telas[t.id].editar)
}

const ESPECIAIS: { campo: 'ver_vendas_outros' | 'ver_custo_produtos'; label: string; descricao: string }[] = [
  {
    campo: 'ver_vendas_outros',
    label: 'Ver vendas de outros usuários',
    descricao: 'No PDV, nos relatórios e no dashboard, vê as vendas de todos. Sem isso, vê só as vendas que ele mesmo fez.',
  },
  {
    campo: 'ver_custo_produtos',
    label: 'Ver custo dos produtos',
    descricao: 'Vê o preço de custo e a margem dos produtos. Necessário também para dar entrada de mercadoria.',
  },
]

function Caixa({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      style={{ width: '16px', height: '16px', flexShrink: 0, accentColor: '#FFFFFF', cursor: disabled ? 'default' : 'pointer' }}
    />
  )
}

export default function Permissoes() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selecionadoId = searchParams.get('usuario')

  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [loadingLista, setLoadingLista] = useState(true)
  const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null)
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [loadingPerm, setLoadingPerm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase.rpc('listar_usuarios').then(({ data, error: err }) => {
      if (err) setError(err.message)
      const lista = ((data ?? []) as UsuarioListado[]).filter(u => u.empresa_id && u.papel !== 'super_admin')
      setUsuarios(lista)
      setLoadingLista(false)
    })
  }, [])

  // Sem ninguém escolhido: abre o primeiro que dá pra configurar.
  useEffect(() => {
    if (selecionadoId || usuarios.length === 0) return
    const primeiro = usuarios.find(u => u.usuario_id !== user?.id && u.papel !== 'administrador') ?? usuarios[0]
    setSearchParams({ usuario: primeiro.usuario_id }, { replace: true })
  }, [usuarios, selecionadoId, user?.id, setSearchParams])

  useEffect(() => {
    if (!selecionadoId) return
    let cancelado = false
    setLoadingPerm(true); setError(''); setAviso('')
    supabase.rpc('permissoes_usuario', { p_usuario_id: selecionadoId }).then(({ data, error: err }) => {
      if (cancelado) return
      setLoadingPerm(false)
      if (err) { setError(err.message); setPermissoes(null); setRascunho(null); return }
      const p = data as PermissoesUsuario
      setPermissoes(p)
      setRascunho(rascunhoDe(p))
    })
    return () => { cancelado = true }
  }, [selecionadoId])

  const original = useMemo(() => permissoes ? rascunhoDe(permissoes) : null, [permissoes])
  const alterado = !!(rascunho && original && !iguais(rascunho, original))
  const editavel = !!permissoes?.pode_configurar && !permissoes.acesso_total
  const selecionado = usuarios.find(u => u.usuario_id === selecionadoId)

  function selecionar(id: string) {
    if (id === selecionadoId) return
    if (alterado && !window.confirm('Há alterações não salvas. Descartar?')) return
    setSearchParams({ usuario: id })
  }

  function mudarTela(tela: TelaId, campo: 'ver' | 'editar', valor: boolean) {
    setRascunho(r => {
      if (!r) return r
      const atual = r.telas[tela]
      // Editar exige ver; tirar o ver tira o editar junto.
      const novo = campo === 'ver'
        ? { ver: valor, editar: valor ? atual.editar : false }
        : { ver: valor ? true : atual.ver, editar: valor }
      return { ...r, telas: { ...r.telas, [tela]: novo } }
    })
  }

  function marcarGrupo(grupo: string, campo: 'ver' | 'editar', valor: boolean) {
    for (const t of TELAS.filter(t => t.grupo === grupo)) {
      if (campo === 'editar' && !t.temEdicao) continue
      mudarTela(t.id, campo, valor)
    }
  }

  async function salvar() {
    if (!rascunho || !selecionadoId) return
    setSalvando(true); setError(''); setAviso('')
    const { data, error: err } = await supabase.rpc('salvar_permissoes_usuario', {
      p_usuario_id: selecionadoId,
      p_telas: rascunho.telas,
      p_ver_vendas_outros: rascunho.ver_vendas_outros,
      p_ver_custo_produtos: rascunho.ver_custo_produtos,
    })
    setSalvando(false)
    if (err) { setError(err.message); return }
    const p = data as PermissoesUsuario
    setPermissoes(p); setRascunho(rascunhoDe(p))
    setAviso('Permissões salvas. Valem na próxima vez que o usuário abrir ou recarregar o sistema.')
  }

  async function restaurar() {
    if (!selecionadoId || !selecionado) return
    if (!window.confirm(`Voltar ${selecionado.email} para as permissões padrão de ${PAPEL_LABEL[selecionado.papel]}?`)) return
    setSalvando(true); setError(''); setAviso('')
    const { data, error: err } = await supabase.rpc('restaurar_permissoes_padrao', { p_usuario_id: selecionadoId })
    setSalvando(false)
    if (err) { setError(err.message); return }
    const p = data as PermissoesUsuario
    setPermissoes(p); setRascunho(rascunhoDe(p))
    setAviso('Permissões voltaram ao padrão do papel.')
  }

  const personalizado = !!permissoes && (permissoes.especiais_personalizados || TELAS.some(t => permissoes.telas[t.id]?.personalizado))

  return (
    <div className="page">
      <div className="page-header-row" style={{ marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Permissões</h1>
          <p style={{ fontSize: '13px', color: '#A3A3A3', marginTop: '3px' }}>
            O que cada usuário da equipe pode ver e editar
          </p>
        </div>
      </div>

      <div className="permissoes-layout">
        {/* Lista de usuários */}
        <div className="card" style={{ padding: '8px', alignSelf: 'start' }}>
          {loadingLista ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '13px' }}>Carregando...</div>
          ) : usuarios.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#666', fontSize: '13px' }}>Nenhum usuário na loja.</div>
          ) : usuarios.map(u => {
            const ativo = u.usuario_id === selecionadoId
            return (
              <button
                key={u.usuario_id}
                onClick={() => selecionar(u.usuario_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                  padding: '10px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: ativo ? 'rgba(255,255,255,0.07)' : 'transparent',
                  textAlign: 'left', fontFamily: 'inherit', opacity: u.ativo ? 1 : 0.5,
                }}
              >
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: '#262626', border: '1px solid #333',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: 700, color: '#A3A3A3',
                }}>
                  {initials(u.email.split('@')[0])}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: '13px', color: ativo ? '#FFFFFF' : '#A3A3A3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email}
                  </p>
                  <p style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>
                    {PAPEL_LABEL[u.papel]}{u.usuario_id === user?.id ? ' · você' : ''}{!u.ativo ? ' · inativo' : ''}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Editor */}
        <div style={{ minWidth: 0 }}>
          {error && <p style={{ fontSize: '12px', color: '#A3A3A3', marginBottom: '12px' }}>{error}</p>}

          {loadingPerm || !permissoes || !rascunho ? (
            <div className="card" style={{ padding: '56px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
              {loadingPerm ? 'Carregando...' : 'Escolha um usuário.'}
            </div>
          ) : (
            <motion.div key={selecionadoId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <div className="card" style={{ padding: '20px 24px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF', minWidth: 0, overflowWrap: 'anywhere' }}>{selecionado?.email}</p>
                  {permissoes.papel && <span className="badge badge-confirmed">{PAPEL_LABEL[permissoes.papel]}</span>}
                  {!permissoes.acesso_total && (
                    <span className={`badge ${personalizado ? 'badge-pending' : 'badge-canceled'}`}>
                      {personalizado ? 'Personalizado' : 'Padrão do papel'}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: '#A3A3A3', marginTop: '8px', lineHeight: 1.6 }}>
                  {permissoes.acesso_total
                    ? 'Administrador tem acesso total a todas as telas. Para restringir, troque o papel em Usuários.'
                    : !permissoes.pode_configurar
                      ? selecionadoId === user?.id
                        ? 'Você não pode alterar as próprias permissões.'
                        : 'Só o administrador pode alterar as permissões de um gerente.'
                      : 'Marque o que este usuário pode ver e editar. Usuários e Permissões ficam sempre restritos a administrador e gerente.'}
                </p>
              </div>

              {/* Telas */}
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
                {GRUPOS_TELAS.map((grupo, gi) => {
                  const telas = TELAS.filter(t => t.grupo === grupo)
                  return (
                    <div key={grupo} style={{ borderTop: gi > 0 ? '1px solid #222' : 'none' }}>
                      <div className="permissoes-row" style={{ background: 'rgba(0,0,0,0.2)', padding: '10px 24px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{grupo}</span>
                        {(['ver', 'editar'] as const).map(campo => {
                          const alvo = telas.filter(t => campo === 'ver' || t.temEdicao)
                          const todos = alvo.length > 0 && alvo.every(t => rascunho.telas[t.id][campo])
                          return (
                            <label key={campo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '10px', fontWeight: 600, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              {alvo.length > 0 && editavel && (
                                <Caixa label={`${campo === 'ver' ? 'Ver' : 'Editar'} todas de ${grupo}`} checked={todos} onChange={v => marcarGrupo(grupo, campo, v)} />
                              )}
                              {campo === 'ver' ? 'Ver' : 'Editar'}
                            </label>
                          )
                        })}
                      </div>
                      {telas.map(t => (
                        <div key={t.id} className="permissoes-row" style={{ padding: '12px 24px', borderTop: '1px solid #1A1A1A' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '13px', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {t.label}
                              {permissoes.telas[t.id]?.personalizado && !permissoes.acesso_total && (
                                <span title="Diferente do padrão do papel" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#A3A3A3', flexShrink: 0 }} />
                              )}
                            </p>
                            {t.editarDescricao && <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>Editar: {t.editarDescricao}</p>}
                            {!t.temEdicao && <p style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>Tela só de consulta</p>}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Caixa label={`Ver ${t.label}`} checked={rascunho.telas[t.id].ver} disabled={!editavel} onChange={v => mudarTela(t.id, 'ver', v)} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            {t.temEdicao
                              ? <Caixa label={`Editar ${t.label}`} checked={rascunho.telas[t.id].editar} disabled={!editavel} onChange={v => mudarTela(t.id, 'editar', v)} />
                              : <span style={{ fontSize: '12px', color: '#444' }}>—</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>

              {/* Especiais */}
              <div className="card" style={{ padding: '20px 24px', marginBottom: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: 600, color: '#A3A3A3', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>
                  Permissões especiais
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {ESPECIAIS.map(e => (
                    <label key={e.campo} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: editavel ? 'pointer' : 'default' }}>
                      <span style={{ paddingTop: '2px' }}>
                        <Caixa
                          label={e.label}
                          checked={rascunho[e.campo]}
                          disabled={!editavel}
                          onChange={v => setRascunho(r => r && { ...r, [e.campo]: v })}
                        />
                      </span>
                      <span>
                        <span style={{ display: 'block', fontSize: '13px', color: '#FFFFFF' }}>{e.label}</span>
                        <span style={{ display: 'block', fontSize: '11px', color: '#666', marginTop: '2px', lineHeight: 1.5 }}>{e.descricao}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {editavel && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                  {aviso && <p style={{ fontSize: '12px', color: '#A3A3A3', marginRight: 'auto' }}>{aviso}</p>}
                  <button
                    className="btn btn-secondary"
                    onClick={restaurar}
                    disabled={salvando || !personalizado}
                    title="Apaga as personalizações e volta ao padrão do papel"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RotateCcw size={13} /> Restaurar Padrão
                  </button>
                  {alterado && (
                    <button className="btn btn-ghost" onClick={() => original && setRascunho(original)} disabled={salvando}>
                      Descartar
                    </button>
                  )}
                  <button
                    className="btn btn-primary"
                    onClick={salvar}
                    disabled={salvando || !alterado}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <ShieldCheck size={13} /> {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
