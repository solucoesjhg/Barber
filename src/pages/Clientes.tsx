import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, X, Phone, Pencil, Power, UserRound, Receipt, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatTime, initials } from '../lib/utils'
import { dataLocalISO } from '../lib/periodo'
import { usePermissoes } from '../hooks/usePermissoes'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../components/ui/ModalDetalhe'
import ModalFormulario, { Campo, FormGrade } from '../components/ui/ModalFormulario'
import { STATUS_AGENDA } from '../components/AgendamentoDetalheModal'
import type { Agendamento, Cliente } from '../types'
import { exibirDocumento, exibirTelefone, mascaraCpf, mascaraTelefone } from '../lib/mascaras'

const FORM_INICIAL = { nome: '', telefone: '', email: '', cpf: '', data_nascimento: '', endereco: '', observacoes: '' }

/** Idade a partir de "AAAA-MM-DD" (sem passar por fuso). */
function idadeDe(nascimento?: string): number | null {
  if (!nascimento) return null
  const [ano, mes, dia] = nascimento.split('-').map(Number)
  if (!ano || !mes || !dia) return null
  const hoje = new Date()
  let idade = hoje.getFullYear() - ano
  if (hoje.getMonth() + 1 < mes || (hoje.getMonth() + 1 === mes && hoje.getDate() < dia)) idade--
  return idade >= 0 && idade < 130 ? idade : null
}

interface ParcelaAberta { id: string; descricao: string; valor: number; valor_pago: number; data_vencimento: string; numero_parcela: number; total_parcelas: number }

/** Card do cliente: dados do cadastro, as parcelas em aberto (se tiver) e os últimos atendimentos. */
function ClienteDetalhe({ cliente: c, podeEditar, verAgenda, verContas, abrirParcelas = false, onClose, onEditar, onAlternarAtivo }: {
  cliente: Cliente
  podeEditar: boolean
  verAgenda: boolean
  /** Pode ver Contas a Receber: mostra as parcelas em aberto do cliente. */
  verContas: boolean
  abrirParcelas?: boolean
  onClose: () => void
  onEditar: () => void
  onAlternarAtivo: () => void
}) {
  const navigate = useNavigate()
  const [atendimentos, setAtendimentos] = useState<Agendamento[] | null>(null)
  const [parcelas, setParcelas] = useState<ParcelaAberta[]>([])
  const [mostrarParcelas, setMostrarParcelas] = useState(abrirParcelas)
  const hoje = dataLocalISO()

  useEffect(() => {
    if (!verContas) return
    supabase.from('contas_receber')
      .select('id, descricao, valor, valor_pago, data_vencimento, numero_parcela, total_parcelas')
      .eq('cliente_id', c.id).in('status', ['aberta', 'parcial']).order('data_vencimento')
      .then(({ data }) => setParcelas((data ?? []) as ParcelaAberta[]))
  }, [c.id, verContas])
  const saldo = (p: ParcelaAberta) => Number(p.valor) - Number(p.valor_pago)
  const totalAberto = parcelas.reduce((t, p) => t + saldo(p), 0)
  const vencidas = parcelas.filter(p => p.data_vencimento < hoje)

  useEffect(() => {
    if (!verAgenda) return
    supabase.from('agendamentos')
      .select('id, data_hora, status, servico:servicos(nome), profissional:profissionais(nome)')
      .eq('cliente_id', c.id).order('data_hora', { ascending: false }).limit(5)
      .then(({ data }) => setAtendimentos((data ?? []) as unknown as Agendamento[]))
  }, [c.id, verAgenda])

  const idade = idadeDe(c.data_nascimento)

  return (
    <ModalDetalhe
      icone={initials(c.nome)}
      titulo={c.nome}
      subtitulo={<>
        <span>{exibirTelefone(c.telefone)}</span>
        <span className={`status-pill${c.ativo ? '' : ' inativo'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
      </>}
      onClose={onClose}
      acoes={podeEditar || parcelas.length > 0 ? (
        <>
          {parcelas.length > 0 && (
            <button className={`btn btn-secondary${mostrarParcelas ? ' ativo' : ''}`} onClick={() => setMostrarParcelas(v => !v)} aria-expanded={mostrarParcelas}
              style={vencidas.length ? { color: '#f59e0b', borderColor: 'rgba(245,158,11,.45)' } : undefined}>
              <Receipt size={13} /> Parcelas em aberto ({parcelas.length}) · {formatCurrency(totalAberto)}
            </button>
          )}
          {podeEditar && <>
          <button className="btn btn-secondary" onClick={onAlternarAtivo}><Power size={13} /> {c.ativo ? 'Desativar' : 'Ativar'}</button>
          <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar</button>
          </>}
        </>
      ) : undefined}
    >
      {mostrarParcelas && parcelas.length > 0 && (
        <div style={{ marginBottom: '18px' }}>
        <SecaoDetalhe titulo={`Parcelas em aberto · ${formatCurrency(totalAberto)}${vencidas.length ? ` · ${vencidas.length} vencida${vencidas.length > 1 ? 's' : ''}` : ''}`}
          acao={<button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/contas-receber')}>Abrir Contas a Receber</button>}>
          <div className="detalhe-lista">
            {parcelas.map(p => {
              const vencida = p.data_vencimento < hoje
              return (
                <div key={p.id} className="detalhe-lista-item">
                  <span className="valor-num" style={{ flexShrink: 0, color: vencida ? '#f59e0b' : 'var(--c-fff)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {vencida && <AlertTriangle size={11} />}{formatDate(p.data_vencimento)}
                  </span>
                  <span className="texto-cortado" style={{ flex: 1 }}>{p.descricao}</span>
                  <span className="valor-num" style={{ color: 'var(--c-fff)', fontWeight: 600 }}>{formatCurrency(saldo(p))}</span>
                </div>
              )
            })}
          </div>
        </SecaoDetalhe>
        </div>
      )}

      <InfoGrade>
        <Info rotulo="Telefone">{exibirTelefone(c.telefone)}</Info>
        <Info rotulo="CPF">{exibirDocumento(c.cpf)}</Info>
        <Info rotulo="E-mail" largo>{c.email}</Info>
        <Info rotulo="Nascimento">
          {c.data_nascimento ? `${formatDate(c.data_nascimento)}${idade != null ? ` · ${idade} anos` : ''}` : undefined}
        </Info>
        <Info rotulo="Cliente desde">{formatDate(c.created_at)}</Info>
        <Info rotulo="Endereço" largo>{c.endereco}</Info>
        <Info rotulo="Observações" largo>{c.observacoes}</Info>
      </InfoGrade>

      {verAgenda && (
        <SecaoDetalhe titulo="Últimos atendimentos">
          {atendimentos === null ? (
            <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Carregando...</p>
          ) : atendimentos.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhum agendamento para este cliente.</p>
          ) : (
            <div className="detalhe-lista">
              {atendimentos.map(a => (
                <div key={a.id} className="detalhe-lista-item">
                  <span className="valor-num" style={{ color: 'var(--c-fff)', flexShrink: 0 }}>
                    {formatDate(a.data_hora)} <span style={{ color: 'var(--c-66)' }}>{formatTime(a.data_hora)}</span>
                  </span>
                  <span className="texto-cortado" style={{ flex: 1 }}>
                    {[a.servico?.nome, a.profissional?.nome].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span className={STATUS_AGENDA[a.status]?.cls ?? 'badge badge-pending'}>{STATUS_AGENDA[a.status]?.label ?? a.status}</span>
                </div>
              ))}
            </div>
          )}
        </SecaoDetalhe>
      )}
    </ModalDetalhe>
  )
}

export default function Clientes() {
  const { podeEditar: podeEditarTela, podeVer } = usePermissoes()
  const podeEditar = podeEditarTela('clientes')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [abrirComParcelas, setAbrirComParcelas] = useState(false)
  // Saldo em aberto por cliente (parcelado, contas a receber).
  const [emAberto, setEmAberto] = useState<Record<string, number>>({})
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome')
      .then(({ data }) => { setClientes((data ?? []) as Cliente[]); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!podeVer('contas_receber')) return
    supabase.from('contas_receber').select('cliente_id, valor, valor_pago').in('status', ['aberta', 'parcial']).not('cliente_id', 'is', null)
      .then(({ data }) => {
        const mapa: Record<string, number> = {}
        ;((data ?? []) as { cliente_id: string; valor: number; valor_pago: number }[])
          .forEach(r => { mapa[r.cliente_id] = (mapa[r.cliente_id] ?? 0) + Number(r.valor) - Number(r.valor_pago) })
        setEmAberto(mapa)
      })
  }, [podeVer])

  const filtered = clientes
    .filter(c => mostrarInativos || c.ativo)
    .filter(c =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone.includes(search)
    )
  const clienteAberto = abertoId ? clientes.find(c => c.id === abertoId) ?? null : null

  async function handleSave() {
    if (!form.nome.trim() || !form.telefone.trim()) {
      setError('Nome e telefone são obrigatórios.')
      return
    }
    setSaving(true); setError('')
    const payload = {
      nome: form.nome,
      telefone: form.telefone,
      email: form.email || null,
      cpf: form.cpf || null,
      data_nascimento: form.data_nascimento || null,
      endereco: form.endereco || null,
      observacoes: form.observacoes || null,
    }
    if (editId) {
      const { data, error: err } = await supabase.from('clientes').update(payload).eq('id', editId).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setClientes(prev => prev.map(c => c.id === editId ? (data as Cliente) : c))
    } else {
      const { data, error: err } = await supabase.from('clientes').insert(payload).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setClientes(prev => [...prev, data as Cliente])
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

  function abrirEdicao(c: Cliente) {
    setEditId(c.id)
    setForm({
      nome: c.nome, telefone: exibirTelefone(c.telefone), email: c.email ?? '', cpf: exibirDocumento(c.cpf),
      data_nascimento: c.data_nascimento ?? '', endereco: c.endereco ?? '', observacoes: c.observacoes ?? '',
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
    setClientes(prev => prev.map(c => c.id === id ? { ...c, ativo: !ativo } : c))
    await supabase.from('clientes').update({ ativo: !ativo }).eq('id', id)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Clientes</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {clientes.filter(c => c.ativo).length} ativos · {clientes.length} cadastrados
          </p>
        </div>
        {podeEditar && (
          <button className="btn btn-primary" onClick={abrirNovo} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Cliente
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
          placeholder="Buscar por nome ou telefone..."
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
          minWidth: '720px', gridTemplateColumns: '1fr 150px minmax(150px, 200px) 96px 70px 36px', gap: '12px', alignItems: 'center',
          padding: '10px 20px',
          borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'var(--header-bg)',
        }}>
          <span>Nome</span>
          <span>Telefone</span>
          <span>E-mail</span>
          <span>Cadastro</span>
          <span>Status</span>
          <span></span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
            Nenhum cliente encontrado.
          </div>
        ) : filtered.map((c, i) => (
          <motion.div
            key={c.id}
            className="list-row clicavel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: Math.min(i, 20) * 0.02 }}
            onClick={() => { setAbrirComParcelas(false); setAbertoId(c.id) }}
            style={{
              display: 'grid',
              minWidth: '720px', gridTemplateColumns: '1fr 150px minmax(150px, 200px) 96px 70px 36px', gap: '12px',
              padding: '11px 20px',
              borderBottom: i < filtered.length - 1 ? '1px solid var(--c-1f)' : 'none',
              alignItems: 'center',
              transition: 'background 0.12s',
            }}
            whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{
                width: '32px', height: '32px',
                borderRadius: '50%',
                background: 'var(--c-26)',
                border: '1px solid var(--c-33)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: 'var(--c-a3)',
                flexShrink: 0,
              }}>
                {initials(c.nome)}
              </div>
              <span className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{c.nome}</span>
              {emAberto[c.id] > 0.009 && (
                <button type="button" className="pilula-aberto" title="Parcelas em aberto"
                  onClick={e => { e.stopPropagation(); setAbrirComParcelas(true); setAbertoId(c.id) }}>
                  {formatCurrency(emAberto[c.id])} em aberto
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--c-a3)' }}>
              <Phone size={11} style={{ color: 'var(--c-44)' }} /> {exibirTelefone(c.telefone)}
            </div>
            <div className="texto-cortado" style={{ fontSize: '13px', color: 'var(--c-55)' }}>
              {c.email ?? <span style={{ color: 'var(--c-33)' }}>—</span>}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--c-44)' }}>{formatDate(c.created_at)}</div>
            <div>
              <button
                className={`status-pill${c.ativo ? '' : ' inativo'}`}
                onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivo(c.id, c.ativo) }}
                disabled={!podeEditar}
                title={podeEditar ? (c.ativo ? 'Clique para desativar' : 'Clique para ativar') : undefined}
              >
                {c.ativo ? 'Ativo' : 'Inativo'}
              </button>
            </div>
            {podeEditar ? (
              <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicao(c) }}>
                <Pencil size={12} />
              </button>
            ) : <span />}
          </motion.div>
        ))}
      </div>

      {/* Cards (mobile) */}
      {!loading && filtered.length > 0 && (
        <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              className="card entity-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 20) * 0.04 }}
              onClick={() => { setAbrirComParcelas(false); setAbertoId(c.id) }}
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
                  {initials(c.nome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <h3 className="entity-title" style={{
                      fontSize: '15px', fontWeight: 600, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                    }}>{c.nome}</h3>
                    <span className={`status-pill${c.ativo ? '' : ' inativo'}`} style={{ flexShrink: 0 }}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={11} style={{ color: 'var(--c-44)' }} />
                    <span style={{ fontSize: '12px', color: 'var(--c-66)' }}>{exibirTelefone(c.telefone)}</span>
                  </div>
                  {c.email && (
                    <p className="entity-subtle" style={{ fontSize: '11px', color: 'var(--c-44)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="entity-divider" style={{ height: '1px', background: 'var(--c-22)', margin: '16px 0' }} />

              <div className="entity-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="entity-subtle">
                  <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Cadastro</p>
                  <p style={{ fontSize: '13px', color: 'var(--c-a3)' }}>{formatDate(c.created_at)}</p>
                </div>
                {podeEditar && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicao(c) }}>
                      <Pencil size={12} />
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); toggleAtivo(c.id, c.ativo) }}>
                      {c.ativo ? 'Desativar' : 'Ativar'}
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
          Nenhum cliente encontrado.
        </div>
      )}

      {/* Card do cliente */}
      <AnimatePresence>
        {clienteAberto && (
          <ClienteDetalhe
            key={clienteAberto.id}
            cliente={clienteAberto}
            podeEditar={podeEditar}
            verAgenda={podeVer('agenda')}
            verContas={podeVer('contas_receber')}
            abrirParcelas={abrirComParcelas}
            onClose={() => setAbertoId(null)}
            onEditar={() => { setAbertoId(null); abrirEdicao(clienteAberto) }}
            onAlternarAtivo={() => toggleAtivo(clienteAberto.id, clienteAberto.ativo)}
          />
        )}
      </AnimatePresence>

      {/* Cadastro / edição */}
      <AnimatePresence>
        {showModal && (
          <ModalFormulario
            icone={<UserRound size={18} />}
            titulo={editId ? 'Editar Cliente' : 'Novo Cliente'}
            descricao={editId ? clientes.find(c => c.id === editId)?.nome : 'Nome e telefone são obrigatórios; o resto pode ser preenchido depois.'}
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
              <Campo rotulo="Telefone *">
                <input className="input" placeholder="(11) 99999-9999" inputMode="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: mascaraTelefone(e.target.value) }))} />
              </Campo>
              <Campo rotulo="CPF">
                <input className="input" placeholder="000.000.000-00" inputMode="numeric" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: mascaraCpf(e.target.value) }))} />
              </Campo>
              <Campo rotulo="E-mail">
                <input className="input" type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </Campo>
              <Campo rotulo="Nascimento">
                <input className="input" type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))} />
              </Campo>
              <Campo rotulo="Endereço" span="total">
                <input className="input" placeholder="Rua, número, bairro..." value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
              </Campo>
              <Campo rotulo="Observações" span="total">
                <textarea className="input textarea" placeholder="Preferências, alergias, etc." value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
