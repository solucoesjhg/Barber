import { useState } from 'react'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PAPEL_LABEL } from '../../lib/permissoes'
import ModalFormulario, { Campo, FormGrade } from '../ui/ModalFormulario'
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

  return (
    <ModalFormulario
      icone={<UserPlus size={18} />}
      titulo="Novo Usuário"
      descricao="O usuário entra no sistema com este e-mail e senha. As permissões de tela você ajusta logo depois, no cartão dele."
      onClose={onClose}
      onSalvar={salvar}
      salvando={saving}
      rotuloSalvar="Cadastrar"
      erro={error}
    >
      <FormGrade colunas={2}>
        <Campo rotulo="Nome *">
          <input className="input" placeholder="Ex: Ana Souza" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
        </Campo>
        <Campo rotulo="E-mail de acesso *">
          <input className="input" type="email" autoComplete="off" placeholder="ana@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </Campo>
        <Campo rotulo="Senha inicial *">
          <div className="input-com-botao">
            <input
              className="input" type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password"
              placeholder="Mínimo de 6 caracteres" value={form.senha} onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
            />
            <button type="button" className="btn btn-icon" onClick={() => setMostrarSenha(m => !m)} title={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'}>
              {mostrarSenha ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Campo>
        <Campo rotulo="Papel *">
          <select className="input" value={form.papel} onChange={e => setForm(f => ({ ...f, papel: e.target.value as PapelUsuario }))}>
            {papeis.map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Comissão (%)">
          <input className="input" type="number" min={0} max={100} step={0.1} placeholder="0" value={form.comissao} onChange={e => setForm(f => ({ ...f, comissao: e.target.value }))} />
        </Campo>
        {profissionais.length > 0 && (
          <Campo rotulo="Profissional vinculado">
            <select className="input" value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}
      </FormGrade>
    </ModalFormulario>
  )
}
