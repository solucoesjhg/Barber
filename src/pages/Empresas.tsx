import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Building2, Copy, Check, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import ModalFormulario, { Campo, FormGrade, SecaoForm } from '../components/ui/ModalFormulario'
import type { Empresa } from '../types'

const FORM_INICIAL = { nome: '', cnpj: '', telefone: '', email: '', admin_nome: '', admin_email: '', admin_senha: '' }

export default function Empresas() {
  const navigate = useNavigate()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [codigoCopiado, setCodigoCopiado] = useState<string | null>(null)

  function copiarCodigo(codigo: string) {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCodigoCopiado(codigo)
      setTimeout(() => setCodigoCopiado(null), 1500)
    })
  }

  function carregar() {
    setLoading(true)
    supabase.from('empresas').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setEmpresas((data ?? []) as Empresa[]); setLoading(false) })
  }

  useEffect(() => { carregar() }, [])

  async function handleSave() {
    if (saving) return
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    const comAdmin = form.admin_email.trim() !== ''
    if (comAdmin && !form.admin_nome.trim()) { setError('Informe o nome do administrador.'); return }
    if (comAdmin && form.admin_senha.length < 6) { setError('A senha do administrador precisa ter pelo menos 6 caracteres.'); return }
    setSaving(true); setError('')
    const { data: nova, error: err } = await supabase.from('empresas').insert({
      nome: form.nome, cnpj: form.cnpj || null, telefone: form.telefone || null, email: form.email || null,
    }).select('id').single()
    if (err || !nova) { setSaving(false); setError(err?.message ?? 'Não foi possível criar a loja.'); return }
    if (comAdmin) {
      const { error: errAdmin } = await supabase.rpc('criar_usuario_loja', {
        p_email: form.admin_email.trim(), p_senha: form.admin_senha, p_nome: form.admin_nome.trim(),
        p_papel: 'administrador', p_empresa_id: nova.id,
      })
      if (errAdmin) {
        // A loja já foi criada: abre o detalhe dela para tentar o administrador de novo.
        setSaving(false)
        window.alert(`A loja foi criada, mas o administrador não: ${errAdmin.message}\nCadastre-o na tela da loja.`)
        navigate(`/empresas/${nova.id}`)
        return
      }
    }
    setSaving(false)
    setForm(FORM_INICIAL)
    setShowModal(false)
    carregar()
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    setEmpresas(prev => prev.map(e => e.id === id ? { ...e, ativo: !ativo } : e))
    await supabase.from('empresas').update({ ativo: !ativo }).eq('id', id)
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Empresas</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {empresas.filter(e => e.ativo).length} ativas · {empresas.length} cadastradas
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Nova Loja
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', minWidth: '630px', gridTemplateColumns: '1fr 130px 160px 90px 20px',
          padding: '10px 24px', borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'var(--header-bg)',
        }}>
          <span>Loja</span><span>Código</span><span>E-mail</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
        ) : empresas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Nenhuma loja cadastrada ainda.</div>
        ) : empresas.map((e, i) => (
          <motion.div
            key={e.id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
            onClick={() => navigate(`/empresas/${e.id}`)}
            style={{
              display: 'grid', minWidth: '630px', gridTemplateColumns: '1fr 130px 160px 90px 20px',
              padding: '14px 24px', alignItems: 'center',
              borderBottom: i < empresas.length - 1 ? '1px solid var(--c-1f)' : 'none',
              cursor: 'pointer',
            }}
            whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--c-26)', border: '1px solid var(--c-33)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={14} style={{ color: 'var(--c-a3)' }} />
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{e.nome}</span>
                <p style={{ fontSize: '11px', color: 'var(--c-55)' }}>Desde {formatDate(e.created_at)}</p>
              </div>
            </div>
            <button
              onClick={ev => { ev.stopPropagation(); e.codigo && copiarCodigo(e.codigo) }}
              title="Copiar código"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                fontSize: '11px', fontFamily: 'monospace', color: 'var(--c-a3)',
                background: 'rgba(var(--ink),0.04)', border: '1px solid var(--c-2a)', borderRadius: '6px',
                padding: '4px 8px', cursor: 'pointer',
              }}
            >
              {codigoCopiado === e.codigo ? <Check size={11} /> : <Copy size={11} />}
              {e.codigo ?? '—'}
            </button>
            <span style={{ fontSize: '13px', color: 'var(--c-55)' }}>{e.email ?? '—'}</span>
            <button
              onClick={ev => { ev.stopPropagation(); toggleAtivo(e.id, e.ativo) }}
              style={{
                fontSize: '10px', padding: '3px 9px', borderRadius: '99px', width: 'fit-content',
                border: e.ativo ? '1px solid rgba(var(--ink),0.2)' : '1px dashed var(--c-33)',
                background: 'transparent', color: e.ativo ? 'var(--c-a3)' : 'var(--c-44)', cursor: 'pointer',
              }}
            >
              {e.ativo ? 'Ativa' : 'Inativa'}
            </button>
            <ChevronRight size={14} style={{ color: 'var(--c-33)' }} />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <ModalFormulario
            icone={<Building2 size={18} />}
            titulo="Nova Loja"
            descricao="A loja já nasce com configurações, categorias financeiras e formas de pagamento padrão."
            onClose={() => setShowModal(false)}
            onSalvar={handleSave}
            salvando={saving}
            rotuloSalvar="Cadastrar"
            erro={error}
          >
            <FormGrade>
              <SecaoForm titulo="Loja" />
              <Campo rotulo="Nome da loja *" span={2}>
                <input className="input" placeholder="Ex: Barbearia do João" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </Campo>
              <Campo rotulo="CNPJ">
                <input className="input" placeholder="opcional" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
              </Campo>
              <Campo rotulo="Telefone">
                <input className="input" placeholder="opcional" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
              </Campo>
              <Campo rotulo="E-mail de contato" span={2}>
                <input className="input" type="email" placeholder="opcional" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Campo>
              <SecaoForm titulo="Administrador da loja" ajuda="Opcional. Ele entra com este e-mail e senha e cadastra o resto da equipe pelo sistema." />
              <Campo rotulo="Nome">
                <input className="input" placeholder="Ex: João Silva" value={form.admin_nome} onChange={e => setForm(f => ({ ...f, admin_nome: e.target.value }))} />
              </Campo>
              <Campo rotulo="E-mail de acesso">
                <input className="input" type="email" autoComplete="off" placeholder="dono@loja.com" value={form.admin_email} onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} />
              </Campo>
              <Campo rotulo="Senha inicial">
                <input className="input" type="password" autoComplete="new-password" placeholder="Mín. 6 caracteres" value={form.admin_senha} onChange={e => setForm(f => ({ ...f, admin_senha: e.target.value }))} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
