import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, X, Phone, Truck, Pencil, Power } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, initials } from '../lib/utils'
import { dataLocalISO } from '../lib/periodo'
import { usePermissoes } from '../hooks/usePermissoes'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../components/ui/ModalDetalhe'
import ModalFormulario, { Campo, FormGrade } from '../components/ui/ModalFormulario'
import type { ContaPagar, Fornecedor } from '../types'

const FORM_INICIAL = { nome: '', nome_fantasia: '', documento: '', telefone: '', email: '', endereco: '', observacoes: '' }
const COLUNAS = 'minmax(220px, 1fr) 150px minmax(160px, 220px) 70px 36px'

/** Card do fornecedor: dados, contato e as contas a pagar dele. */
function FornecedorDetalhe({ fornecedor: f, podeEditar, verContas, onClose, onEditar, onAlternarAtivo }: {
  fornecedor: Fornecedor
  podeEditar: boolean
  verContas: boolean
  onClose: () => void
  onEditar: () => void
  onAlternarAtivo: () => void
}) {
  const [contas, setContas] = useState<ContaPagar[] | null>(null)

  useEffect(() => {
    if (!verContas) return
    supabase.from('contas_pagar').select('id, descricao, valor, valor_pago, status, data_vencimento, numero_parcela, total_parcelas')
      .eq('fornecedor_id', f.id).order('data_vencimento', { ascending: false }).limit(50)
      .then(({ data }) => setContas((data ?? []) as ContaPagar[]))
  }, [f.id, verContas])

  const abertas = (contas ?? []).filter(c => c.status === 'aberta' || c.status === 'parcial')
  const totalAberto = abertas.reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago), 0)
  const hoje = dataLocalISO()

  return (
    <ModalDetalhe
      icone={initials(f.nome)}
      titulo={f.nome}
      subtitulo={<>
        {f.nome_fantasia && <span>{f.nome_fantasia}</span>}
        <span className={`status-pill${f.ativo ? '' : ' inativo'}`}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
      </>}
      onClose={onClose}
      acoes={podeEditar ? (
        <>
          <button className="btn btn-secondary" onClick={onAlternarAtivo}><Power size={13} /> {f.ativo ? 'Desativar' : 'Ativar'}</button>
          <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar</button>
        </>
      ) : undefined}
    >
      <InfoGrade>
        <Info rotulo="CNPJ / CPF">{f.documento}</Info>
        <Info rotulo="Telefone">{f.telefone}</Info>
        <Info rotulo="E-mail" largo>{f.email}</Info>
        <Info rotulo="Endereço" largo>{f.endereco}</Info>
        <Info rotulo="Observações" largo>{f.observacoes}</Info>
        <Info rotulo="Cadastrado em">{formatDate(f.created_at)}</Info>
      </InfoGrade>

      {verContas && (
        <SecaoDetalhe titulo={contas && abertas.length > 0 ? `Contas a pagar · ${formatCurrency(totalAberto)} em aberto` : 'Contas a pagar'}>
          {contas === null ? (
            <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Carregando...</p>
          ) : contas.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhuma conta lançada para este fornecedor.</p>
          ) : (
            <div className="detalhe-lista">
              {contas.slice(0, 6).map(c => {
                const aberta = c.status === 'aberta' || c.status === 'parcial'
                const vencida = aberta && c.data_vencimento < hoje
                return (
                  <div key={c.id} className="detalhe-lista-item">
                    <span className="texto-cortado" style={{ flex: 1, color: 'var(--c-fff)' }}>{c.descricao}</span>
                    <span style={{ color: vencida ? 'var(--c-fff)' : 'var(--c-66)', flexShrink: 0 }}>{formatDate(c.data_vencimento)}</span>
                    <span className={c.status === 'paga' ? 'badge badge-done' : vencida || c.status === 'cancelada' ? 'badge badge-canceled' : 'badge badge-pending'}>
                      {vencida ? 'Vencida' : c.status === 'paga' ? 'Paga' : c.status === 'parcial' ? 'Parcial' : c.status === 'cancelada' ? 'Cancelada' : 'Aberta'}
                    </span>
                    <span className="valor-num" style={{ width: '92px', textAlign: 'right', flexShrink: 0 }}>{formatCurrency(Number(c.valor))}</span>
                  </div>
                )
              })}
              {contas.length > 6 && <p className="subtexto">Mais {contas.length - 6} em Contas a Pagar.</p>}
            </div>
          )}
        </SecaoDetalhe>
      )}
    </ModalDetalhe>
  )
}

export default function Fornecedores() {
  const { podeEditar: podeEditarTela, podeVer } = usePermissoes()
  const podeEditar = podeEditarTela('fornecedores')
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('fornecedores').select('*').order('nome')
      .then(({ data }) => { setFornecedores((data ?? []) as Fornecedor[]); setLoading(false) })
  }, [])

  const filtered = fornecedores
    .filter(f => mostrarInativos || f.ativo)
    .filter(f =>
      f.nome.toLowerCase().includes(search.toLowerCase()) ||
      (f.nome_fantasia ?? '').toLowerCase().includes(search.toLowerCase())
    )

  async function handleSave() {
    if (!form.nome.trim()) {
      setError('Nome é obrigatório.')
      return
    }
    setSaving(true); setError('')
    const payload = {
      nome: form.nome,
      nome_fantasia: form.nome_fantasia || null,
      documento: form.documento || null,
      telefone: form.telefone || null,
      email: form.email || null,
      endereco: form.endereco || null,
      observacoes: form.observacoes || null,
    }
    if (editId) {
      const { data, error: err } = await supabase.from('fornecedores').update(payload).eq('id', editId).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setFornecedores(prev => prev.map(f => f.id === editId ? (data as Fornecedor) : f))
    } else {
      const { data, error: err } = await supabase.from('fornecedores').insert(payload).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setFornecedores(prev => [...prev, data as Fornecedor])
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

  function abrirEdicao(f: Fornecedor) {
    setEditId(f.id)
    setForm({
      nome: f.nome, nome_fantasia: f.nome_fantasia ?? '', documento: f.documento ?? '',
      telefone: f.telefone ?? '', email: f.email ?? '', endereco: f.endereco ?? '', observacoes: f.observacoes ?? '',
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
    setFornecedores(prev => prev.map(f => f.id === id ? { ...f, ativo: !ativo } : f))
    await supabase.from('fornecedores').update({ ativo: !ativo }).eq('id', id)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Fornecedores</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {fornecedores.filter(f => f.ativo).length} ativos · {fornecedores.length} cadastrados
          </p>
        </div>
        {podeEditar && (
          <button className="btn btn-primary" onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Fornecedor
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '11px 14px',
        background: 'var(--c-1a)',
        border: '1px solid var(--c-25)',
        borderRadius: '8px',
        marginBottom: '20px',
      }}>
        <Search size={14} style={{ color: 'var(--c-44)', flexShrink: 0 }} />
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '13px', color: 'var(--c-fff)', fontFamily: 'inherit' }}
          placeholder="Buscar por nome..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: 'var(--c-55)', cursor: 'pointer', padding: '2px' }}>
            <X size={13} />
          </button>
        )}
        <label className="check-rotulo" style={{ flexShrink: 0, paddingLeft: '10px', borderLeft: '1px solid var(--c-25)' }}>
          <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {/* Table (desktop) */}
      <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid',
          minWidth: '640px', gridTemplateColumns: COLUNAS, gap: '12px', alignItems: 'center',
          padding: '10px 20px',
          borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'var(--header-bg)',
        }}>
          <span>Nome</span>
          <span>Telefone</span>
          <span>E-mail</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
            Nenhum fornecedor encontrado.
          </div>
        ) : filtered.map((f, i) => (
          <motion.div
            key={f.id}
            className="list-row clicavel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i, 20) * 0.02 }}
            onClick={() => setAbertoId(f.id)}
            style={{
              display: 'grid',
              minWidth: '640px', gridTemplateColumns: COLUNAS, gap: '12px',
              padding: '11px 20px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--c-1f)' : 'none',
              alignItems: 'center',
            }}
            whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{
                width: '30px', height: '30px',
                borderRadius: '50%',
                background: 'var(--c-26)',
                border: '1px solid var(--c-33)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: 'var(--c-a3)',
                flexShrink: 0,
              }}>
                {initials(f.nome)}
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{f.nome}</p>
                {f.nome_fantasia && <p className="subtexto texto-cortado">{f.nome_fantasia}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-a3)', minWidth: 0 }}>
              {f.telefone ? <><Phone size={11} style={{ color: 'var(--c-44)', flexShrink: 0 }} /> <span className="texto-cortado">{f.telefone}</span></> : <span style={{ color: 'var(--c-33)' }}>—</span>}
            </div>
            <div className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-55)' }}>
              {f.email ?? <span style={{ color: 'var(--c-33)' }}>—</span>}
            </div>
            <button
              className={`status-pill${f.ativo ? '' : ' inativo'}`}
              onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivo(f.id, f.ativo) }}
              disabled={!podeEditar}
              title={podeEditar ? (f.ativo ? 'Clique para desativar' : 'Clique para ativar') : undefined}
            >
              {f.ativo ? 'Ativo' : 'Inativo'}
            </button>
            {podeEditar ? (
              <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicao(f) }} style={{ width: '30px', height: '30px', justifySelf: 'end' }}>
                <Pencil size={12} />
              </button>
            ) : <span />}
          </motion.div>
        ))}
      </div>

      {/* Cards (mobile) */}
      {!loading && filtered.length > 0 && (
        <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
          {filtered.map((f, i) => (
            <motion.div
              key={f.id}
              className="card entity-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 20) * 0.04 }}
              onClick={() => setAbertoId(f.id)}
              style={{ cursor: 'pointer' }}
            >
              <div className="entity-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div className="entity-avatar" style={{
                  width: '44px', height: '44px',
                  borderRadius: '50%',
                  background: 'var(--c-26)',
                  border: '1px solid var(--c-33)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700, color: 'var(--c-a3)',
                  flexShrink: 0,
                }}>
                  {initials(f.nome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <h3 className="entity-title" style={{
                      fontSize: '15px', fontWeight: 600, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                    }}>{f.nome}</h3>
                    <span className={`status-pill${f.ativo ? '' : ' inativo'}`} style={{ flexShrink: 0 }}>
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {f.nome_fantasia && <p className="entity-subtle" style={{ fontSize: '11px', color: 'var(--c-55)' }}>{f.nome_fantasia}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <Phone size={11} style={{ color: 'var(--c-44)' }} />
                    <span style={{ fontSize: '12px', color: 'var(--c-66)' }}>{f.telefone ?? '—'}</span>
                  </div>
                  {f.email && (
                    <p className="entity-subtle" style={{ fontSize: '11px', color: 'var(--c-44)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="entity-divider" style={{ height: '1px', background: 'var(--c-22)', margin: '16px 0' }} />

              <div className="entity-footer" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {podeEditar && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicao(f) }}>
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); toggleAtivo(f.id, f.ativo) }}>
                      {f.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
          Nenhum fornecedor encontrado.
        </div>
      )}

      {/* Card do fornecedor */}
      <AnimatePresence>
        {abertoId && (() => {
          const f = fornecedores.find(x => x.id === abertoId)
          if (!f) return null
          return (
            <FornecedorDetalhe
              key={f.id}
              fornecedor={f}
              podeEditar={podeEditar}
              verContas={podeVer('contas_pagar')}
              onClose={() => setAbertoId(null)}
              onEditar={() => { setAbertoId(null); abrirEdicao(f) }}
              onAlternarAtivo={() => toggleAtivo(f.id, f.ativo)}
            />
          )
        })()}
      </AnimatePresence>

      {/* Cadastro / edição */}
      <AnimatePresence>
        {showModal && (
          <ModalFormulario
            icone={<Truck size={18} />}
            titulo={editId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            descricao={editId ? fornecedores.find(f => f.id === editId)?.nome : 'Só o nome é obrigatório.'}
            onClose={fecharModal}
            onSalvar={handleSave}
            salvando={saving}
            rotuloSalvar={editId ? 'Salvar' : 'Cadastrar'}
            erro={error}
          >
            <FormGrade>
              <Campo rotulo="Nome / Razão Social *" span={2}>
                <input className="input" placeholder="Nome completo" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </Campo>
              <Campo rotulo="Nome Fantasia">
                <input className="input" placeholder="opcional" value={form.nome_fantasia} onChange={e => setForm(f => ({ ...f, nome_fantasia: e.target.value }))} />
              </Campo>
              <Campo rotulo="CNPJ/CPF">
                <input className="input" placeholder="opcional" value={form.documento} onChange={e => setForm(f => ({ ...f, documento: e.target.value }))} />
              </Campo>
              <Campo rotulo="Telefone">
                <input className="input" placeholder="(11) 99999-9999" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
              </Campo>
              <Campo rotulo="E-mail">
                <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Campo>
              <Campo rotulo="Endereço" span="total">
                <input className="input" placeholder="Rua, número, bairro..." value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
              </Campo>
              <Campo rotulo="Observações" span="total">
                <textarea className="input textarea" placeholder="opcional" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
