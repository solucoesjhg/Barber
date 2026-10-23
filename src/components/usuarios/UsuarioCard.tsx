import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Eye, EyeOff, KeyRound, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { initials } from '../../lib/utils'
import { PAPEL_LABEL, nomeExibicao } from '../../lib/permissoes'
import PermissoesEditor, { cardsAlterados, rascunhoDe, rascunhosIguais, relatoriosAlterados, type RascunhoPermissoes } from './PermissoesEditor'
import type { PapelUsuario, PermissoesUsuario, Profissional, UsuarioListado } from '../../types'

type Dados = { nome: string; papel: PapelUsuario; profissional_id: string; ativo: boolean }

function dadosDe(u: UsuarioListado): Dados {
  return {
    nome: u.nome ?? '',
    papel: u.papel,
    profissional_id: u.profissional_id ?? '',
    ativo: u.ativo,
  }
}

/**
 * Cartão de um usuário: fechado mostra o resumo; aberto mostra os dados,
 * a senha e as permissões, com um único botão Salvar.
 *
 * podeEditar: quem está logado pode alterar esse usuário (mesma regra do
 * banco). comPermissoes: mostra a tabela de permissões de tela (o super
 * admin não configura permissões; o administrador da loja faz isso).
 */
export default function UsuarioCard({ usuario, aberto, onToggle, papeis, profissionais, podeEditar, comPermissoes, motivoSomenteLeitura, onSaved, acoesExtras }: {
  usuario: UsuarioListado
  aberto: boolean
  onToggle: () => void
  papeis: PapelUsuario[]
  profissionais: Profissional[]
  podeEditar: boolean
  comPermissoes: boolean
  motivoSomenteLeitura?: string
  onSaved: () => void
  acoesExtras?: React.ReactNode
}) {
  const [dados, setDados] = useState<Dados>(() => dadosDe(usuario))
  const [novaSenha, setNovaSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null)
  const [rascunho, setRascunho] = useState<RascunhoPermissoes | null>(null)
  const [carregandoPerm, setCarregandoPerm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // Recarrega o formulário quando o usuário muda (após salvar ou recarregar a lista).
  useEffect(() => { setDados(dadosDe(usuario)) }, [usuario])

  function carregarPermissoes() {
    let cancelado = false
    setCarregandoPerm(true)
    supabase.rpc('permissoes_usuario', { p_usuario_id: usuario.usuario_id }).then(({ data, error: err }) => {
      if (cancelado) return
      setCarregandoPerm(false)
      if (err) { setError(err.message); return }
      const p = data as PermissoesUsuario
      setPermissoes(p); setRascunho(rascunhoDe(p))
    })
    return () => { cancelado = true }
  }

  useEffect(() => {
    if (!aberto || !comPermissoes) return
    return carregarPermissoes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, comPermissoes, usuario.usuario_id])

  const original = dadosDe(usuario)
  const dadosAlterados = JSON.stringify(dados) !== JSON.stringify(original)
  const permAlteradas = !!(permissoes && rascunho && !rascunhosIguais(rascunho, rascunhoDe(permissoes)))
  const papelMudou = dados.papel !== usuario.papel
  const alterado = dadosAlterados || permAlteradas || novaSenha !== ''
  // Admin tem acesso total; trocar o papel apaga as personalizações,
  // então a tabela só fica editável com o papel atual.
  const permEditavel = podeEditar && !!permissoes?.pode_configurar && !permissoes.acesso_total && !papelMudou
  const personalizado = !!permissoes && (permissoes.especiais_personalizados || permissoes.dashboard_personalizado || !!permissoes.relatorios_personalizado || Object.values(permissoes.telas).some(t => t.personalizado))

  async function salvar() {
    if (saving) return
    if (novaSenha && novaSenha.length < 6) { setError('A nova senha precisa ter pelo menos 6 caracteres.'); return }
    setSaving(true); setError(''); setAviso('')
    try {
      if (dadosAlterados) {
        const { error: err } = await supabase.rpc('salvar_usuario', {
          p_usuario_id: usuario.usuario_id,
          p_nome: dados.nome,
          p_papel: dados.papel,
          p_profissional_id: dados.profissional_id || null,
          p_comissao_percentual: null,
          p_ativo: dados.ativo,
        })
        if (err) throw err
      }
      if (novaSenha) {
        const { error: err } = await supabase.rpc('redefinir_senha_usuario', { p_usuario_id: usuario.usuario_id, p_senha: novaSenha })
        if (err) throw err
      }
      // O papel novo já zerou as personalizações no banco; só salva a
      // tabela quando o papel não mudou.
      if (permAlteradas && rascunho && !papelMudou && permissoes) {
        const original = rascunhoDe(permissoes)
        const args: Record<string, unknown> = {
          p_usuario_id: usuario.usuario_id,
          p_telas: rascunho.telas,
          p_ver_vendas_outros: rascunho.ver_vendas_outros,
          p_ver_custo_produtos: rascunho.ver_custo_produtos,
          p_dashboard_cards: cardsAlterados(rascunho, original) ? rascunho.dashboard_cards : null,
        }
        // Só manda os relatórios quando mudaram (o banco sem a migração de
        // relatórios não conhece esse parâmetro).
        if (relatoriosAlterados(rascunho, original)) args.p_relatorios = rascunho.relatorios
        const { error: err } = await supabase.rpc('salvar_permissoes_usuario', args)
        if (err) throw err
      }
      setNovaSenha('')
      setAviso(papelMudou
        ? 'Salvo. As permissões voltaram ao padrão do novo papel; ajuste abaixo se precisar.'
        : 'Salvo. Vale na próxima vez que o usuário abrir ou recarregar o sistema.')
      if (comPermissoes) carregarPermissoes()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    }
    setSaving(false)
  }

  function descartar() {
    setDados(original); setNovaSenha(''); setError(''); setAviso('')
    if (permissoes) setRascunho(rascunhoDe(permissoes))
  }

  async function restaurarPadrao() {
    if (!window.confirm(`Voltar ${nomeExibicao(usuario)} para as permissões padrão de ${PAPEL_LABEL[usuario.papel]}?`)) return
    setSaving(true); setError(''); setAviso('')
    const { data, error: err } = await supabase.rpc('restaurar_permissoes_padrao', { p_usuario_id: usuario.usuario_id })
    setSaving(false)
    if (err) { setError(err.message); return }
    const p = data as PermissoesUsuario
    setPermissoes(p); setRascunho(rascunhoDe(p))
    setAviso('Permissões voltaram ao padrão do papel.')
  }

  const nome = nomeExibicao(usuario)
  const idCorpo = `usuario-${usuario.usuario_id}`

  return (
    <div className={`usuario-card${usuario.ativo ? '' : ' usuario-inativo'}`}>
      {/* Resumo (sempre visível) */}
      <button className="usuario-resumo" onClick={onToggle} aria-expanded={aberto} aria-controls={idCorpo}>
        <span className="usuario-avatar">{initials(nome)}</span>
        <span className="usuario-identidade">
          <span className="usuario-nome">{nome}</span>
          <span className="usuario-email">{usuario.email}</span>
        </span>
        <span className="usuario-meta">
          <span className="badge badge-confirmed">{PAPEL_LABEL[usuario.papel]}</span>
          {!usuario.ativo && <span className="badge badge-canceled">Inativo</span>}
        </span>
        <span className={`expandir-caixa${aberto ? ' aberta' : ''}`} aria-hidden>
          <ChevronDown size={14} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            id={idCorpo}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="usuario-corpo">
              {!podeEditar && motivoSomenteLeitura && <p className="aviso-info">{motivoSomenteLeitura}</p>}

              {/* Dados */}
              <section className="usuario-secao">
                <p className="secao-titulo">Dados</p>
                <fieldset disabled={!podeEditar} className="form-grid-auto">
                  <div className="field">
                    <label className="label">Nome</label>
                    <input className="input" value={dados.nome} placeholder={usuario.email.split('@')[0]} onChange={e => setDados(d => ({ ...d, nome: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">E-mail de acesso</label>
                    <input className="input" value={usuario.email} readOnly disabled />
                  </div>
                  <div className="field">
                    <label className="label">Papel</label>
                    <select className="input" value={dados.papel} onChange={e => setDados(d => ({ ...d, papel: e.target.value as PapelUsuario }))}>
                      {!papeis.includes(usuario.papel) && <option value={usuario.papel}>{PAPEL_LABEL[usuario.papel]}</option>}
                      {papeis.map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
                    </select>
                  </div>
                  {profissionais.length > 0 && (
                    <div className="field">
                      <label className="label">Profissional vinculado</label>
                      <select className="input" value={dados.profissional_id} onChange={e => setDados(d => ({ ...d, profissional_id: e.target.value }))}>
                        <option value="">Nenhum</option>
                        {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label className="label">Nova senha</label>
                    <div className="input-com-botao">
                      <input
                        className="input" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password"
                        placeholder="Manter a atual" value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
                      />
                      <button type="button" className="btn btn-icon" onClick={() => setMostrarSenha(m => !m)} title={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}>
                        {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <label className="checkbox-linha">
                    <input type="checkbox" className="perm-check" checked={dados.ativo} onChange={e => setDados(d => ({ ...d, ativo: e.target.checked }))} />
                    <span>
                      <span className="perm-nome" style={{ display: 'block' }}>Ativo</span>
                      <span className="perm-ajuda" style={{ display: 'block' }}>Desmarcado, o usuário não acessa mais a loja.</span>
                    </span>
                  </label>
                </fieldset>
              </section>

              {/* Permissões */}
              {comPermissoes && (
                <section className="usuario-secao">
                  <div className="secao-cabecalho">
                    <p className="secao-titulo">Permissões de tela</p>
                    {permissoes && !permissoes.acesso_total && (
                      <span className={`badge ${personalizado ? 'badge-pending' : 'badge-canceled'}`}>
                        {personalizado ? 'Personalizado' : 'Padrão do papel'}
                      </span>
                    )}
                  </div>
                  {carregandoPerm || !permissoes || !rascunho ? (
                    <p className="perm-ajuda">Carregando...</p>
                  ) : permissoes.acesso_total ? (
                    <p className="aviso-info">Administrador tem acesso total a todas as telas.</p>
                  ) : (
                    <>
                      {papelMudou && <p className="aviso-info">Ao salvar o novo papel, as permissões voltam ao padrão dele. Depois você ajusta aqui.</p>}
                      <PermissoesEditor permissoes={permissoes} rascunho={rascunho} onChange={setRascunho} editavel={permEditavel} />
                    </>
                  )}
                </section>
              )}

              {(error || aviso) && <p className={error ? 'aviso-erro' : 'aviso-info'}>{error || aviso}</p>}

              {(podeEditar || acoesExtras) && (
                <div className="usuario-acoes">
                  {acoesExtras}
                  {podeEditar && comPermissoes && permissoes && !permissoes.acesso_total && (
                    <button className="btn btn-secondary btn-sm" onClick={restaurarPadrao} disabled={saving || !personalizado} title="Apaga as personalizações e volta ao padrão do papel">
                      <RotateCcw size={13} /> Restaurar Padrão
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  {podeEditar && alterado && (
                    <button className="btn btn-ghost btn-sm" onClick={descartar} disabled={saving}>Descartar</button>
                  )}
                  {podeEditar && (
                    <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving || !alterado}>
                      {novaSenha ? <KeyRound size={13} /> : null} {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
