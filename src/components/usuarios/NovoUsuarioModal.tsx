import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useModalKeyboard } from '../../hooks/useModalKeyboard'
import { PAPEL_LABEL } from '../../lib/permissoes'
import type { PapelUsuario, Profissional } from '../../types'

/**
 * Cadastra um login novo (e-mail + senha inicial) já vinculado à loja.
 * empresaId só é usado pelo super admin; para os demais o banco usa a
 * loja de quem está cadastrando.
 */
export default function NovoUsuarioModal({ papeis, profissionais, empresaId, onClose, onCreated }: {
  papeis: PapelUsuario[]
  profissionais: Profissional[]
  empresaId?: string
  onClose: () => void
  onCreated: (usuarioId: string) => void
}) {
  const [form, setForm] = useState({
    nome: '', email: '', senha: '',
    papel: (papeis.includes('atendente') ? 'atendente' : papeis[0]) as PapelUsuario,
    profissional_id: '', comissao: '',
  })
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function salvar() {
    if (saving) return
    if (!form.nome.trim()) { setError('Informe o nome.'); return }
    if (!form.email.trim()) { setError('Informe o e-mail.'); return }
    if (form.senha.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return }
    setSaving(true); setError('')
    const { data, error: err } = await supabase.rpc('criar_usuario_loja', {
      p_email: form.email.trim(),
      p_senha: form.senha,
      p_nome: form.nome.trim(),
      p_papel: form.papel,
      p_empresa_id: empresaId ?? null,
      p_profissional_id: form.profissional_id || null,
      p_comissao_percentual: form.comissao === '' ? null : Number(form.comissao),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onCreated(data as string)
  }

  const modalRef = useModalKeyboard(true, onClose, salvar)

  return (
    <motion.div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div ref={modalRef} className="card" style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Usuário</h2>
          <button className="btn btn-icon" onClick={onClose} title="Fechar"><X size={14} /></button>
        </div>
        <p style={{ fontSize: '12px', color: '#A3A3A3', marginBottom: '20px', lineHeight: 1.5 }}>
          O usuário entra no sistema com este e-mail e senha. As permissões de tela você ajusta logo depois, no cartão dele.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field">
            <label className="label">Nome *</label>
            <input className="input" placeholder="Ex: Ana Souza" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">E-mail de acesso *</label>
            <input className="input" type="email" autoComplete="off" placeholder="ana@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="field">
            <label className="label">Senha inicial *</label>
            <div className="input-com-botao">
              <input
                className="input" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
              />
              <button type="button" className="btn btn-icon" onClick={() => setMostrarSenha(m => !m)} title={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}>
                {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div className="form-grid-2">
            <div className="field">
              <label className="label">Papel *</label>
              <select className="input" value={form.papel} onChange={e => setForm(f => ({ ...f, papel: e.target.value as PapelUsuario }))}>
                {papeis.map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Comissão (%)</label>
              <input className="input" type="number" min={0} max={100} step={0.1} placeholder="0" value={form.comissao} onChange={e => setForm(f => ({ ...f, comissao: e.target.value }))} />
            </div>
          </div>
          {profissionais.length > 0 && (
            <div className="field">
              <label className="label">Profissional vinculado</label>
              <select className="input" value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value }))}>
                <option value="">Nenhum</option>
                {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}

          {error && <p className="aviso-erro">{error}</p>}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancelar (Esc)</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={salvar} disabled={saving}>
              {saving ? 'Cadastrando...' : 'Cadastrar (F10)'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
