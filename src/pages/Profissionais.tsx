import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Scissors, Percent, Pencil, Power } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, initials } from '../lib/utils'
import { usePermissoes } from '../hooks/usePermissoes'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../components/ui/ModalDetalhe'
import ModalFormulario, { Campo, FormGrade } from '../components/ui/ModalFormulario'
import type { Profissional } from '../types'
import { exibirDocumento, exibirTelefone, mascaraCpfCnpj, mascaraTelefone } from '../lib/mascaras'

const FORM_INICIAL = { nome: '', especialidade: '', comissao_percentual: '50', telefone: '', email: '', documento: '', valor_fixo: '' }

type ServicoDoProfissional = { id: string; nome: string; ativo: boolean }

/** Card do profissional: dados do cadastro e os serviços que ele faz. */
function ProfissionalDetalhe({ profissional: p, podeEditar, onClose, onEditar, onAlternarAtivo }: {
  profissional: Profissional
  podeEditar: boolean
  onClose: () => void
  onEditar: () => void
  onAlternarAtivo: () => void
}) {
  const [servicos, setServicos] = useState<ServicoDoProfissional[] | null>(null)

  useEffect(() => {
    supabase.from('profissional_servicos').select('servico:servicos(id, nome, ativo)').eq('profissional_id', p.id)
      .then(({ data }) => {
        const lista = ((data ?? []) as unknown as { servico: ServicoDoProfissional | null }[])
          .map(l => l.servico).filter((s): s is ServicoDoProfissional => !!s)
          .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))
        setServicos(lista)
      })
  }, [p.id])

  return (
    <ModalDetalhe
      icone={initials(p.nome)}
      titulo={p.nome}
      subtitulo={<>
        {p.especialidade && <span>{p.especialidade}</span>}
        <span className={`status-pill${p.ativo ? '' : ' inativo'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
      </>}
      onClose={onClose}
      acoes={podeEditar ? (
        <>
          <button className="btn btn-secondary" onClick={onAlternarAtivo}><Power size={13} /> {p.ativo ? 'Desativar' : 'Ativar'}</button>
          <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar</button>
        </>
      ) : undefined}
    >
      <InfoGrade>
        <Info rotulo="Comissão">{`${p.comissao_percentual}%`}</Info>
        <Info rotulo="Valor fixo">{p.valor_fixo ? formatCurrency(p.valor_fixo) : undefined}</Info>
        <Info rotulo="Telefone">{exibirTelefone(p.telefone)}</Info>
        <Info rotulo="Documento (CPF)">{exibirDocumento(p.documento)}</Info>
        <Info rotulo="E-mail" largo>{p.email}</Info>
        <Info rotulo="Cadastrado em">{formatDate(p.created_at)}</Info>
      </InfoGrade>

      <SecaoDetalhe titulo={servicos ? `Serviços que realiza (${servicos.length})` : 'Serviços que realiza'}>
        {servicos === null ? (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Carregando...</p>
        ) : servicos.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhum serviço vinculado. O vínculo é feito no cadastro do serviço.</p>
        ) : (
          <div className="chip-lista">
            {servicos.map(s => (
              <span key={s.id} className={`chip${s.ativo ? '' : ' fraco'}`} title={s.ativo ? undefined : 'Serviço inativo'}>{s.nome}</span>
            ))}
          </div>
        )}
      </SecaoDetalhe>
    </ModalDetalhe>
  )
}

export default function Profissionais() {
  const { podeEditar: podeEditarTela } = usePermissoes()
  const podeEditar = podeEditarTela('profissionais')
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [loading, setLoading] = useState(true)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { setProfissionais((data ?? []) as Profissional[]); setLoading(false) })
  }, [])

  const profissionalAberto = abertoId ? profissionais.find(p => p.id === abertoId) ?? null : null

  async function handleSave() {
    if (!form.nome.trim() || !form.especialidade.trim()) {
      setError('Nome e especialidade são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const payload = {
      nome: form.nome,
      especialidade: form.especialidade,
      comissao_percentual: Number(form.comissao_percentual),
      telefone: form.telefone || null,
      email: form.email || null,
      documento: form.documento || null,
      valor_fixo: form.valor_fixo ? Number(form.valor_fixo) : null,
    }
    if (editId) {
      const { data, error: err } = await supabase.from('profissionais').update(payload).eq('id', editId).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setProfissionais(prev => prev.map(p => p.id === editId ? (data as Profissional) : p))
    } else {
      const { data, error: err } = await supabase.from('profissionais').insert({ ...payload, ativo: true }).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setProfissionais(prev => [...prev, data as Profissional])
    }
    fecharModal()
    setSaving(false)
  }

  function abrirNovo() {
    setEditId(null)
    setForm(FORM_INICIAL)
    setError('')
    setShowModal(true)
  }

  function abrirEdicao(p: Profissional) {
    setEditId(p.id)
    setForm({
      nome: p.nome, especialidade: p.especialidade, comissao_percentual: String(p.comissao_percentual),
      telefone: exibirTelefone(p.telefone), email: p.email ?? '', documento: exibirDocumento(p.documento), valor_fixo: p.valor_fixo != null ? String(p.valor_fixo) : '',
    })
    setError('')
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false)
    setEditId(null)
    setForm(FORM_INICIAL)
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    setProfissionais(prev => prev.map(p => p.id === id ? { ...p, ativo: !ativo } : p))
    await supabase.from('profissionais').update({ ativo: !ativo }).eq('id', id)
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Profissionais</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {profissionais.filter(p => p.ativo).length} ativos · {profissionais.length} cadastrados
          </p>
        </div>
        {podeEditar && (
          <button className="btn btn-primary" onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Profissional
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
      ) : profissionais.length === 0 ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
          Nenhum profissional cadastrado.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))', gap: '12px' }}>
        {profissionais.map((p, i) => (
          <motion.div
            key={p.id}
            className="card clicavel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: p.ativo ? 1 : 0.6, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.04 }}
            onClick={() => setAbertoId(p.id)}
            style={{ padding: '14px 16px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px', height: '36px',
                borderRadius: '50%',
                background: 'var(--c-26)',
                border: '1px solid var(--c-33)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: 700, color: 'var(--c-a3)',
                flexShrink: 0,
              }}>
                {initials(p.nome)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 className="texto-cortado" title={p.nome} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif' }}>{p.nome}</h3>
                <p className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-66)', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Scissors size={10} style={{ color: 'var(--c-44)', flexShrink: 0 }} /> <span className="texto-cortado">{p.especialidade}</span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--c-22)' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--c-77)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--c-fff)', fontWeight: 600 }}>
                  <Percent size={11} style={{ color: 'var(--c-88)' }} /> {p.comissao_percentual}
                  <span style={{ color: 'var(--c-66)', fontWeight: 400, marginLeft: '2px' }}>comissão</span>
                </span>
              </div>
              <span className={`status-pill${p.ativo ? '' : ' inativo'}`} style={{ flexShrink: 0 }}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
              {podeEditar && (
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button className="btn btn-icon" title="Editar" aria-label={`Editar ${p.nome}`} onClick={e => { e.stopPropagation(); abrirEdicao(p) }} style={{ width: '28px', height: '28px' }}>
                    <Pencil size={12} />
                  </button>
                  <button
                    className="btn btn-icon"
                    title={p.ativo ? 'Desativar' : 'Ativar'}
                    aria-label={`${p.ativo ? 'Desativar' : 'Ativar'} ${p.nome}`}
                    onClick={e => { e.stopPropagation(); toggleAtivo(p.id, p.ativo) }}
                    style={{ width: '28px', height: '28px' }}
                  >
                    <Power size={12} />
                  </button>
                </div>
              )}
            </div>
            {(p.valor_fixo || p.telefone || p.email || p.documento) && (
              <p className="texto-cortado" style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '6px' }}>
                {[p.valor_fixo ? `fixo ${formatCurrency(p.valor_fixo)}` : null, p.telefone ? exibirTelefone(p.telefone) : null, p.email, p.documento ? exibirDocumento(p.documento) : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </motion.div>
        ))}
      </div>
      )}

      {/* Card do profissional */}
      <AnimatePresence>
        {profissionalAberto && (
          <ProfissionalDetalhe
            key={profissionalAberto.id}
            profissional={profissionalAberto}
            podeEditar={podeEditar}
            onClose={() => setAbertoId(null)}
            onEditar={() => { setAbertoId(null); abrirEdicao(profissionalAberto) }}
            onAlternarAtivo={() => toggleAtivo(profissionalAberto.id, profissionalAberto.ativo)}
          />
        )}
      </AnimatePresence>

      {/* Cadastro / edição */}
      <AnimatePresence>
        {showModal && (
          <ModalFormulario
            icone={<Scissors size={18} />}
            titulo={editId ? 'Editar Profissional' : 'Novo Profissional'}
            descricao={editId ? profissionais.find(p => p.id === editId)?.nome : 'Os serviços que ele faz são marcados no cadastro de cada serviço.'}
            onClose={fecharModal}
            onSalvar={handleSave}
            salvando={saving}
            rotuloSalvar={editId ? 'Salvar' : 'Cadastrar'}
            erro={error}
          >
            <FormGrade>
              <Campo rotulo="Nome *" span={2}>
                <input className="input" placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </Campo>
              <Campo rotulo="Especialidade *">
                <input className="input" placeholder="Ex: Cabelo e Barba" value={form.especialidade} onChange={e => setForm(f => ({ ...f, especialidade: e.target.value }))} />
              </Campo>
              <Campo rotulo="Comissão (%)">
                <input className="input" type="number" min={0} max={100} value={form.comissao_percentual} onChange={e => setForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
              </Campo>
              <Campo rotulo="Valor fixo (R$)">
                <input className="input" type="number" min={0} step={0.01} placeholder="opcional" value={form.valor_fixo} onChange={e => setForm(f => ({ ...f, valor_fixo: e.target.value }))} />
              </Campo>
              <Campo rotulo="Documento (CPF)">
                <input className="input" placeholder="000.000.000-00" inputMode="numeric" value={form.documento} onChange={e => setForm(f => ({ ...f, documento: mascaraCpfCnpj(e.target.value) }))} />
              </Campo>
              <Campo rotulo="Telefone">
                <input className="input" placeholder="(11) 99999-9999" inputMode="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: mascaraTelefone(e.target.value) }))} />
              </Campo>
              <Campo rotulo="E-mail" span={2}>
                <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
