import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Plus, X,
  Clock, Calendar, AlertCircle, ChevronDown,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Agendamento, Cliente, Funcionario, Servico, StatusAgendamento } from '../types'

/* ─── Constants ────────────────────────────────────── */

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8h–20h

const STATUS_CFG: Record<StatusAgendamento, { label: string; color: string; bg: string }> = {
  agendado:       { label: 'Agendado',     color: '#60a5fa', bg: 'rgba(59,130,246,0.12)'  },
  confirmado:     { label: 'Confirmado',   color: '#4ADE80', bg: 'rgba(74,222,128,0.12)'  },
  em_atendimento: { label: 'Em andamento', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'  },
  finalizado:     { label: 'Finalizado',   color: '#9CA3AF', bg: 'rgba(156,163,175,0.10)' },
  cancelado:      { label: 'Cancelado',    color: '#F87171', bg: 'rgba(248,113,113,0.10)' },
  nao_compareceu: { label: 'Não veio',     color: '#fb923c', bg: 'rgba(251,146,60,0.10)'  },
}

const toKey  = (d: Date) => d.toISOString().split('T')[0]
const addMin = (iso: string, min: number) => {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() + min)
  return d.toISOString()
}

/* ─── Main component ───────────────────────────────── */

export default function Agenda() {
  const { usuario } = useAuth()
  const empres = usuario?.empres_us ?? ''

  const [date,         setDate]         = useState(new Date())
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)

  const [clientes,    setClientes]    = useState<Cliente[]>([])
  const [funcionarios,setFuncionarios]= useState<Funcionario[]>([])
  const [servicos,    setServicos]    = useState<Servico[]>([])

  const dateKey = toKey(date)
  const isToday = dateKey === toKey(new Date())

  /* load agendamentos whenever date changes */
  useEffect(() => { load() }, [dateKey])

  /* load dropdown data once */
  useEffect(() => {
    Promise.all([
      supabase.from('clientes').select('id_cl,nome_cl,fone_cl').order('nome_cl'),
      supabase.from('funcionarios').select('id_fu,nome_fu').eq('status_fu','ativo').order('nome_fu'),
      supabase.from('servicos').select('id_sv,nome_sv,durac_sv,valor_sv').eq('ativo_sv',true).order('nome_sv'),
    ]).then(([c,f,s]) => {
      setClientes(c.data ?? [])
      setFuncionarios(f.data ?? [])
      setServicos(s.data ?? [])
    })
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('agendamentos')
      .select('*, clientes(*), funcionarios(*), servicos(*)')
      .gte('dtini_ag', `${dateKey}T00:00:00`)
      .lte('dtini_ag', `${dateKey}T23:59:59`)
      .order('dtini_ag')
    setAgendamentos(data ?? [])
    setLoading(false)
  }

  const prev  = () => setDate(d => { const n=new Date(d); n.setDate(n.getDate()-1); return n })
  const next  = () => setDate(d => { const n=new Date(d); n.setDate(n.getDate()+1); return n })
  const today = () => setDate(new Date())

  /* group by hour */
  const byHour: Record<number, Agendamento[]> = {}
  agendamentos.forEach(ag => {
    const h = new Date(ag.dtini_ag).getHours()
    ;(byHour[h] ??= []).push(ag)
  })

  const dateLabel = date.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '48px 40px 64px' }}>

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between" style={{ marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: '6px' }}>
            Agenda
          </p>
          <h1 className="capitalize" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {dateLabel}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
            {loading
              ? 'Carregando...'
              : agendamentos.length === 0
              ? 'Nenhum agendamento'
              : `${agendamentos.length} agendamento${agendamentos.length > 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date nav */}
          <div className="flex items-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button onClick={prev} style={{ width: 38, height: 38, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={today}
              style={{ padding: '0 16px', height: 38, fontSize: '12px', fontWeight: 600, color: isToday ? 'var(--accent)' : 'var(--text-secondary)', background: 'none', border: 'none', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)', cursor: 'pointer' }}
            >
              Hoje
            </button>
            <button onClick={next} style={{ width: 38, height: 38, display:'flex', alignItems:'center', justifyContent:'center', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <motion.button
            className="btn-primary btn-sm"
            onClick={() => setModalOpen(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={14} strokeWidth={2.5} />
            Novo agendamento
          </motion.button>
        </div>
      </div>

      {/* ── Time grid ──────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>

        {/* Grid header */}
        <div style={{ padding: '12px 24px 12px 80px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={13} style={{ color: 'var(--accent-text)' }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {isToday ? 'Hoje' : date.toLocaleDateString('pt-BR', { weekday: 'long' })}
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '80px 24px' }}>
            <motion.div
              style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando agenda...</span>
          </div>
        ) : (
          HOURS.map((h, idx) => {
            const apps   = byHour[h] ?? []
            const isLast = idx === HOURS.length - 1

            return (
              <div
                key={h}
                style={{ display: 'flex', alignItems: 'flex-start', borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)', minHeight: apps.length > 0 ? 'auto' : 52 }}
              >
                {/* Hour label */}
                <div style={{ width: 80, flexShrink: 0, padding: '14px 16px 14px 0', textAlign: 'right', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600 }}>
                  {`${String(h).padStart(2,'0')}:00`}
                </div>

                {/* Separator */}
                <div style={{ width: 1, background: 'var(--border)', flexShrink: 0, alignSelf: 'stretch' }} />

                {/* Cards */}
                <div style={{ flex: 1, padding: apps.length > 0 ? '10px 16px' : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {apps.map(ag => <AppCard key={ag.id_ag} ag={ag} />)}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Modal ──────────────────────────────────── */}
      <AnimatePresence>
        {modalOpen && (
          <NovoModal
            empres={empres}
            defaultDate={dateKey}
            clientes={clientes}
            funcionarios={funcionarios}
            servicos={servicos}
            onClose={() => setModalOpen(false)}
            onSaved={(savedDate) => {
              setModalOpen(false)
              if (savedDate === dateKey) load()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Appointment card ─────────────────────────────── */

function AppCard({ ag }: { ag: Agendamento }) {
  const cfg     = STATUS_CFG[ag.status_ag] ?? STATUS_CFG.agendado
  const horaIni = new Date(ag.dtini_ag).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const horaFim = ag.dtfim_ag ? new Date(ag.dtfim_ag).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '12px 16px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${cfg.color}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
      }}
      whileHover={{ background: 'rgba(255,255,255,0.04)', borderColor: cfg.color }}
      transition={{ duration: 0.15 }}
    >
      {/* Time */}
      <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 52 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-primary)' }}>
          <Clock size={10} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{horaIni}</span>
        </div>
        {horaFim && <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>até {horaFim}</p>}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 32, background: 'var(--border)', flexShrink: 0 }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ag.clientes?.nome_cl ?? '—'}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ag.servicos?.nome_sv ?? '—'} · {ag.funcionarios?.nome_fu ?? '—'}
        </p>
      </div>

      {/* Status */}
      <span style={{ flexShrink: 0, fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-full)', color: cfg.color, background: cfg.bg }}>
        {cfg.label}
      </span>
    </motion.div>
  )
}

/* ─── Modal: Novo Agendamento ──────────────────────── */

interface ModalProps {
  empres: string
  defaultDate: string
  clientes: Cliente[]
  funcionarios: Funcionario[]
  servicos: Servico[]
  onClose: () => void
  onSaved: (date: string) => void
}

function NovoModal({ empres, defaultDate, clientes, funcionarios, servicos, onClose, onSaved }: ModalProps) {
  const [form, setForm] = useState({
    client_ag:  '',
    funcio_ag:  '',
    servic_ag:  '',
    data:       defaultDate,
    hora:       '09:00',
    obs_ag:     '',
  })
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_ag || !form.funcio_ag || !form.servic_ag) {
      setSaveError('Selecione cliente, profissional e serviço.')
      return
    }
    setSaving(true)
    setSaveError('')

    const servico = servicos.find(s => s.id_sv === form.servic_ag)
    const durac   = servico?.durac_sv ?? 30
    const dtini   = `${form.data}T${form.hora}:00`
    const dtfim   = addMin(dtini, durac)

    const { error } = await supabase.from('agendamentos').insert({
      empres_ag:  empres,
      client_ag:  form.client_ag,
      funcio_ag:  form.funcio_ag,
      servic_ag:  form.servic_ag,
      dtini_ag:   dtini,
      dtfim_ag:   dtfim,
      status_ag:  'agendado',
      obs_ag:     form.obs_ag || null,
    })

    if (error) {
      setSaveError(
        error.message.includes('Conflito') || error.message.includes('conflito')
          ? 'Conflito de horário: o profissional já tem agendamento neste período.'
          : error.message
      )
    } else {
      onSaved(form.data)
    }
    setSaving(false)
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', zIndex: 40 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0" style={{ zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <motion.div
          style={{
            width: '100%', maxWidth: 500,
            maxHeight: '90vh', overflowY: 'auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
          }}
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '28px 28px 0' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Playfair Display', serif" }}>
                Novo Agendamento
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 6 }}>
                Preencha os dados para confirmar o horário
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border)', margin: '24px 0 0' }} />

          {/* Form */}
          <form onSubmit={handleSave} style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Cliente */}
            <FieldLabel label="Cliente">
              <SelectWrap>
                <select className="input" value={form.client_ag} onChange={set('client_ag')} required style={{ paddingRight: 40, appearance: 'none', cursor: 'pointer' }}>
                  <option value="">Selecionar cliente...</option>
                  {clientes.map(c => <option key={c.id_cl} value={c.id_cl}>{c.nome_cl}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              </SelectWrap>
            </FieldLabel>

            {/* Profissional */}
            <FieldLabel label="Profissional">
              <SelectWrap>
                <select className="input" value={form.funcio_ag} onChange={set('funcio_ag')} required style={{ paddingRight: 40, appearance: 'none', cursor: 'pointer' }}>
                  <option value="">Selecionar profissional...</option>
                  {funcionarios.map(f => <option key={f.id_fu} value={f.id_fu}>{f.nome_fu}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              </SelectWrap>
            </FieldLabel>

            {/* Serviço */}
            <FieldLabel label="Serviço">
              <SelectWrap>
                <select className="input" value={form.servic_ag} onChange={set('servic_ag')} required style={{ paddingRight: 40, appearance: 'none', cursor: 'pointer' }}>
                  <option value="">Selecionar serviço...</option>
                  {servicos.map(s => (
                    <option key={s.id_sv} value={s.id_sv}>
                      {s.nome_sv} — {s.durac_sv}min · R$ {(s.valor_sv ?? 0).toFixed(2).replace('.', ',')}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              </SelectWrap>
              {/* Service info chip */}
              {form.servic_ag && (() => {
                const sv = servicos.find(s => s.id_sv === form.servic_ag)
                if (!sv) return null
                return (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-full)', background: 'var(--accent-muted)', color: 'var(--accent-text)' }}>
                      {sv.durac_sv} min
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(74,222,128,0.1)', color: 'var(--success)' }}>
                      R$ {(sv.valor_sv ?? 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                )
              })()}
            </FieldLabel>

            {/* Data + Hora */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldLabel label="Data">
                <input type="date" className="input" value={form.data} onChange={set('data')} required style={{ cursor: 'pointer' }} />
              </FieldLabel>
              <FieldLabel label="Horário">
                <input type="time" className="input" value={form.hora} onChange={set('hora')} step={900} required style={{ cursor: 'pointer' }} />
              </FieldLabel>
            </div>

            {/* Observação */}
            <FieldLabel label="Observação (opcional)">
              <textarea
                className="input"
                value={form.obs_ag}
                onChange={set('obs_ag')}
                placeholder="Alguma observação sobre o agendamento..."
                style={{ height: 80, resize: 'none', paddingTop: 12 }}
              />
            </FieldLabel>

            {/* Error */}
            <AnimatePresence>
              {saveError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 'var(--radius-md)', color: 'var(--error)', fontSize: '13px' }}
                >
                  <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  {saveError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
              <button type="button" onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>
                Cancelar
              </button>
              <motion.button
                type="submit"
                disabled={saving}
                className="btn-primary"
                style={{ flex: 1, opacity: saving ? 0.65 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                whileHover={!saving ? { scale: 1.01 } : {}}
                whileTap={!saving ? { scale: 0.98 } : {}}
              >
                {saving ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <motion.span
                      style={{ width: 15, height: 15, border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#0f0f0f', borderRadius: '50%', display: 'inline-block' }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    />
                    Salvando...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Plus size={15} strokeWidth={2.5} />
                    Confirmar
                  </span>
                )}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </>
  )
}

/* ─── Helpers ──────────────────────────────────────── */

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function SelectWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
    </div>
  )
}
