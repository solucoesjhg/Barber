import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, X, Clock, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import type { Agendamento, AgendamentoStatus, Cliente, Profissional, Servico } from '../types'

const STATUS_CFG: Record<AgendamentoStatus, { label: string; cls: string }> = {
  pendente:   { label: 'Pendente',   cls: 'badge badge-pending'   },
  confirmado: { label: 'Confirmado', cls: 'badge badge-confirmed' },
  concluido:  { label: 'Concluído',  cls: 'badge badge-done'      },
  cancelado:  { label: 'Cancelado',  cls: 'badge badge-canceled'  },
}

const toKey = (d: Date) => d.toISOString().split('T')[0]

const MOCK_AG: Agendamento[] = [
  {
    id: '1', cliente_id: 'c1', profissional_id: 'p1', servico_id: 's1',
    data_hora: new Date().toISOString().replace(/T.*/, 'T09:00:00'),
    status: 'confirmado', created_at: '',
    cliente: { id: 'c1', nome: 'Rafael Mendes', telefone: '(11) 99887-6655', created_at: '' },
    profissional: { id: 'p1', nome: 'João Silva', especialidade: 'Cabelo e Barba', comissao_percentual: 50, ativo: true, created_at: '' },
    servico: { id: 's1', nome: 'Combo Cabelo + Barba', preco: 65, duracao_minutos: 50, ativo: true },
  },
  {
    id: '2', cliente_id: 'c2', profissional_id: 'p2', servico_id: 's2',
    data_hora: new Date().toISOString().replace(/T.*/, 'T10:00:00'),
    status: 'pendente', created_at: '',
    cliente: { id: 'c2', nome: 'Gustavo Lima', telefone: '(11) 98765-4321', created_at: '' },
    profissional: { id: 'p2', nome: 'Pedro Santos', especialidade: 'Coloração', comissao_percentual: 55, ativo: true, created_at: '' },
    servico: { id: 's2', nome: 'Pigmentação', preco: 80, duracao_minutos: 60, ativo: true },
  },
  {
    id: '3', cliente_id: 'c3', profissional_id: 'p1', servico_id: 's3',
    data_hora: new Date().toISOString().replace(/T.*/, 'T14:00:00'),
    status: 'pendente', created_at: '',
    cliente: { id: 'c3', nome: 'Bruno Castro', telefone: '(11) 91234-5678', created_at: '' },
    profissional: { id: 'p1', nome: 'João Silva', especialidade: 'Cabelo e Barba', comissao_percentual: 50, ativo: true, created_at: '' },
    servico: { id: 's3', nome: 'Barba', preco: 30, duracao_minutos: 20, ativo: true },
  },
]

const MOCK_PROF: Profissional[] = [
  { id: 'p1', nome: 'João Silva',    especialidade: 'Cabelo e Barba', comissao_percentual: 50, ativo: true, created_at: '' },
  { id: 'p2', nome: 'Pedro Santos',  especialidade: 'Coloração',      comissao_percentual: 55, ativo: true, created_at: '' },
  { id: 'p3', nome: 'Lucas Costa',   especialidade: 'Sênior',         comissao_percentual: 60, ativo: true, created_at: '' },
]

const MOCK_SERV: Servico[] = [
  { id: 's1', nome: 'Combo Cabelo + Barba', preco: 65, duracao_minutos: 50, ativo: true },
  { id: 's2', nome: 'Pigmentação',          preco: 80, duracao_minutos: 60, ativo: true },
  { id: 's3', nome: 'Corte de Cabelo',      preco: 45, duracao_minutos: 30, ativo: true },
  { id: 's4', nome: 'Barba',                preco: 30, duracao_minutos: 20, ativo: true },
  { id: 's5', nome: 'Sobrancelha',          preco: 15, duracao_minutos: 10, ativo: true },
]

function buildWeek(base: Date): Date[] {
  const arr: Date[] = []
  for (let i = -2; i <= 4; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    arr.push(d)
  }
  return arr
}

export default function Agenda() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [agenda, setAgenda]   = useState<Agendamento[]>(MOCK_AG)
  const [profissionais]       = useState<Profissional[]>(MOCK_PROF)
  const [servicos]            = useState<Servico[]>(MOCK_SERV)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [showModal, setShowModal] = useState(false)

  const [form, setForm] = useState({
    cliente_id: '', profissional_id: '', servico_id: '',
    data: toKey(new Date()), hora: '09:00', obs: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const dateKey = toKey(selectedDate)
  const filtrado = agenda.filter(a => a.data_hora.startsWith(dateKey))

  const week = buildWeek(new Date())

  useEffect(() => {
    const day = toKey(selectedDate)
    supabase
      .from('agendamentos')
      .select('*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*)')
      .gte('data_hora', `${day}T00:00:00`)
      .lte('data_hora', `${day}T23:59:59`)
      .order('data_hora')
      .then(({ data }) => { if (data && data.length > 0) setAgenda(data as Agendamento[]) })

    supabase.from('clientes').select('*').order('nome')
      .then(({ data }) => { if (data) setClientes(data as Cliente[]) })
  }, [selectedDate])

  async function handleSave() {
    if (!form.cliente_id && !form.profissional_id) {
      setError('Selecione um cliente e um profissional.')
      return
    }
    setSaving(true); setError('')
    const data_hora = `${form.data}T${form.hora}:00`
    const { error: err } = await supabase.from('agendamentos').insert({
      cliente_id: form.cliente_id || null,
      profissional_id: form.profissional_id || null,
      servico_id: form.servico_id || null,
      data_hora, observacoes: form.obs, status: 'pendente',
    })
    if (err) { setError(err.message); setSaving(false); return }
    setShowModal(false)
    setForm({ cliente_id: '', profissional_id: '', servico_id: '', data: toKey(new Date()), hora: '09:00', obs: '' })
    setSaving(false)
  }

  async function updateStatus(id: string, status: AgendamentoStatus) {
    setAgenda(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    await supabase.from('agendamentos').update({ status }).eq('id', id)
  }

  const navDay = (n: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + n)
    setSelectedDate(d)
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Agenda</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Agendar
        </button>
      </div>

      {/* Week strip */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '28px', alignItems: 'center' }}>
        <button className="btn-icon btn" onClick={() => navDay(-7)} style={{ marginRight: '4px' }}>
          <ChevronLeft size={14} />
        </button>
        {week.map(d => {
          const key = toKey(d)
          const isSelected = key === dateKey
          const isToday = key === toKey(new Date())
          const count = agenda.filter(a => a.data_hora.startsWith(key)).length
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(new Date(d))}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: '8px',
                border: isSelected ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                background: isSelected ? '#FFFFFF' : 'transparent',
                color: isSelected ? '#0D0D0D' : isToday ? '#A3A3A3' : '#555',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </div>
              <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1 }}>
                {d.getDate()}
              </div>
              {count > 0 && (
                <div style={{
                  marginTop: '5px', width: '5px', height: '5px', borderRadius: '50%',
                  background: isSelected ? '#0D0D0D' : '#555',
                  margin: '5px auto 0',
                }} />
              )}
            </button>
          )
        })}
        <button className="btn-icon btn" onClick={() => navDay(7)} style={{ marginLeft: '4px' }}>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Appointments list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #222',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <Clock size={14} style={{ color: '#555' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
            {filtrado.length} {filtrado.length === 1 ? 'agendamento' : 'agendamentos'}
          </span>
        </div>

        {filtrado.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#555' }}>Nenhum agendamento neste dia.</p>
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: '16px' }}
              onClick={() => { setForm(f => ({ ...f, data: dateKey })); setShowModal(true) }}
            >
              <Plus size={13} /> Agendar
            </button>
          </div>
        ) : filtrado.sort((a, b) => a.data_hora.localeCompare(b.data_hora)).map((ag, i) => {
          const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          const fim = ag.servico ? new Date(new Date(ag.data_hora).getTime() + ag.servico.duracao_minutos * 60000)
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
          const cfg = STATUS_CFG[ag.status]

          return (
            <motion.div
              key={ag.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                display: 'flex',
                gap: '20px',
                padding: '18px 24px',
                borderBottom: i < filtrado.length - 1 ? '1px solid #1F1F1F' : 'none',
                alignItems: 'flex-start',
              }}
            >
              {/* Time */}
              <div style={{ width: '70px', flexShrink: 0, paddingTop: '2px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{hora}</p>
                {fim && <p style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>até {fim}</p>}
              </div>

              {/* Left strip */}
              <div style={{ width: '2px', background: '#2A2A2A', borderRadius: '1px', alignSelf: 'stretch', flexShrink: 0 }} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>{ag.cliente?.nome ?? 'Sem cliente'}</p>
                  <span className={cfg.cls}>{cfg.label}</span>
                </div>
                <p style={{ fontSize: '12px', color: '#555' }}>
                  {ag.servico?.nome}{ag.servico?.preco ? ` · ${formatCurrency(ag.servico.preco)}` : ''}
                  {ag.profissional ? ` · ${ag.profissional.nome}` : ''}
                </p>
                {ag.observacoes && (
                  <p style={{ fontSize: '12px', color: '#444', marginTop: '4px', fontStyle: 'italic' }}>"{ag.observacoes}"</p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {ag.status === 'pendente' && (
                  <button
                    className="btn btn-icon"
                    title="Confirmar"
                    onClick={() => updateStatus(ag.id, 'confirmado')}
                  >
                    <Check size={13} />
                  </button>
                )}
                {ag.status === 'confirmado' && (
                  <button
                    className="btn btn-icon"
                    title="Concluir"
                    onClick={() => updateStatus(ag.id, 'concluido')}
                  >
                    <Check size={13} />
                  </button>
                )}
                <button
                  className="btn btn-icon"
                  title="Cancelar"
                  onClick={() => updateStatus(ag.id, 'cancelado')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowModal(false)}
          >
            <motion.div
              className="card"
              style={{ width: '100%', maxWidth: '480px', padding: '28px' }}
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Novo Agendamento</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {clientes.length > 0 && (
                  <div className="field">
                    <label className="label">Cliente</label>
                    <select className="input" value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                      <option value="">Selecionar...</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </div>
                )}

                <div className="field">
                  <label className="label">Profissional</label>
                  <select className="input" value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>

                <div className="field">
                  <label className="label">Serviço</label>
                  <select className="input" value={form.servico_id} onChange={e => setForm(f => ({ ...f, servico_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {servicos.map(s => <option key={s.id} value={s.id}>{s.nome} · {formatCurrency(s.preco)}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Data</label>
                    <input type="date" className="input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Hora</label>
                    <input type="time" className="input" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
                  </div>
                </div>

                <div className="field">
                  <label className="label">Observações</label>
                  <input type="text" className="input" placeholder="Opcional..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
                </div>

                {error && <p style={{ fontSize: '13px', color: '#888' }}>{error}</p>}

                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
