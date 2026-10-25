import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, Plus, Clock,
  Check, Trash2, List, CalendarDays, CalendarRange, CalendarPlus, ShoppingCart, Play, MessageCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { dataLocalISO } from '../lib/periodo'
import { usePermissoes } from '../hooks/usePermissoes'
import { usePerfil } from '../hooks/usePerfil'
import AgendamentoDetalheModal, { STATUS_AGENDA, vendaDoAgendamento } from '../components/AgendamentoDetalheModal'
import VendaDetalheModal from '../components/VendaDetalheModal'
import VendaAgendamentoModal from '../components/VendaAgendamentoModal'
import ModalFormulario, { Campo, FormGrade } from '../components/ui/ModalFormulario'
import FiltroProfissional, { corDoProfissional } from '../components/agenda/FiltroProfissional'
import BotaoWhatsApp from '../components/agenda/BotaoWhatsApp'
import LembretesModal from '../components/agenda/LembretesModal'
import type { Agendamento, AgendamentoStatus, Cliente, Profissional, Servico } from '../types'

/* ── Types ──────────────────────────────────────────────── */
type ViewMode = 'lista' | 'semanal' | 'mensal'

/* ── Constants ──────────────────────────────────────────── */
const STATUS_CFG = STATUS_AGENDA

// vendas: a venda gerada a partir do agendamento (comandas.agendamento_id).
function somarDias(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

const FILTRO_PROF_KEY = 'barber-agenda-profissionais'
const SELECT_AGENDA = '*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*), vendas:comandas(id, status)'

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8) // 8–20
const HOUR_H = 64 // px per hour in weekly grid
const GRID_START = 8

const WEEK_DAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

/* ── Date helpers ───────────────────────────────────────── */
// Data local (toISOString usa UTC: depois das 21h "hoje" virava amanhã).
const toKey = (d: Date) => dataLocalISO(d)

function startOfWeekMon(d: Date): Date {
  const r = new Date(d)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

function getWeekDays(base: Date): Date[] {
  const mon = startOfWeekMon(base)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const dow   = first.getDay()
  const lead  = dow === 0 ? 6 : dow - 1
  const days: Date[] = []
  for (let i = lead - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push(d)
  }
  const last = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= last; i++) days.push(new Date(year, month, i))
  while (days.length < 42) {
    const prev = days[days.length - 1]
    const d = new Date(prev)
    d.setDate(prev.getDate() + 1)
    days.push(d)
  }
  return days
}

const pad = (n: number) => String(n).padStart(2, '0')

/* ── View toggle button ─────────────────────────────────── */
function ViewBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 12px',
        borderRadius: '7px',
        border: active ? '1px solid var(--c-fff)' : '1px solid transparent',
        background: active ? 'rgba(var(--ink),0.07)' : 'transparent',
        color: active ? 'var(--c-fff)' : 'var(--c-55)',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-a3)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'var(--c-55)' }}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════
   LISTA VIEW (existing)
══════════════════════════════════════════════════════════ */
function ListaView({
  selectedDate, setSelectedDate, inicioFaixa, onNavegar, agenda, updateStatus,
  onOpenModal, setFormDate, podeEditar, podeVender, verTodasVendas, onAbrir, onGerarVenda, onLembrete,
}: {
  onLembrete: (id: string, quando: string) => void
  podeEditar: boolean
  podeVender: boolean
  verTodasVendas: boolean
  selectedDate: Date
  setSelectedDate: (d: Date) => void
  /** Primeiro dos 7 dias da faixa (as setas andam uma semana). */
  inicioFaixa: Date
  onNavegar: (semanas: number) => void
  agenda: Agendamento[]
  updateStatus: (id: string, s: AgendamentoStatus) => void
  onOpenModal: () => void
  setFormDate: (k: string) => void
  onAbrir: (id: string) => void
  onGerarVenda: (id: string) => void
}) {
  const dateKey  = toKey(selectedDate)
  const todayKey = toKey(new Date())
  const filtrado = agenda
    .filter(a => a.data_hora.startsWith(dateKey))
    .sort((a, b) => a.data_hora.localeCompare(b.data_hora))

  const weekDays: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(inicioFaixa)
    d.setDate(d.getDate() + i)
    weekDays.push(d)
  }


  return (
    <>
      {/* Week strip */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '28px', alignItems: 'center' }}>
        <button className="btn-icon btn" style={{ flexShrink: 0 }} onClick={() => onNavegar(-1)} aria-label="Semana anterior">
          <ChevronLeft size={14} />
        </button>
        <div className="agenda-days-scroll" style={{ display: 'flex', gap: '6px', flex: 1, minWidth: 0 }}>
          {weekDays.map(d => {
            const key = toKey(d)
            const isSel   = key === dateKey
            const isToday = key === todayKey
            const count   = agenda.filter(a => a.data_hora.startsWith(key)).length
            return (
              <button key={key} onClick={() => setSelectedDate(new Date(d))} style={{
                flex: 1, padding: '10px 8px', borderRadius: '8px', fontFamily: 'inherit',
                border: isSel ? '1px solid var(--c-fff)' : '1px solid var(--c-2a)',
                background: isSel ? 'var(--c-fff)' : 'transparent',
                color: isSel ? 'var(--c-0d)' : isToday ? 'var(--c-a3)' : 'var(--c-55)',
                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s ease',
              }}>
                <div style={{ fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</div>
                {count > 0 && (
                  <div style={{
                    marginTop: '5px', width: '5px', height: '5px', borderRadius: '50%',
                    background: isSel ? 'var(--c-0d)' : 'var(--c-55)', margin: '5px auto 0',
                  }} />
                )}
              </button>
            )
          })}
        </div>
        <button className="btn-icon btn" style={{ flexShrink: 0 }} onClick={() => onNavegar(1)} aria-label="Próxima semana">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* List */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--c-22)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={14} style={{ color: 'var(--c-55)' }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>
            {filtrado.length} {filtrado.length === 1 ? 'agendamento' : 'agendamentos'}
          </span>
        </div>

        {filtrado.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: 'var(--c-55)' }}>Nenhum agendamento neste dia.</p>
            {podeEditar && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                onClick={() => { setFormDate(dateKey); onOpenModal() }}
              >
                <Plus size={13} /> Agendar
              </button>
            )}
          </div>
        ) : filtrado.map((ag, i) => {
          const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          const fim  = ag.servico
            ? new Date(new Date(ag.data_hora).getTime() + ag.servico.duracao_minutos * 60000)
                .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : ''
          const cfg = STATUS_CFG[ag.status]
          const temVenda = !!vendaDoAgendamento(ag)
          // Concluído sem venda visível só é certeza pra quem vê as vendas de todos
          // (senão pode ser venda registrada por outro usuário).
          const gerarVenda = podeVender && !temVenda && (ag.status === 'em_atendimento' || (ag.status === 'concluido' && verTodasVendas))
          const parar = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }
          return (
            <motion.div
              key={ag.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.04 }}
              className="agenda-item"
              onClick={() => onAbrir(ag.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter') onAbrir(ag.id) }}
              style={{
                display: 'flex', gap: '18px', padding: '14px 20px',
                borderBottom: i < filtrado.length - 1 ? '1px solid var(--c-1f)' : 'none',
                alignItems: 'flex-start', cursor: 'pointer',
              }}
              whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
            >
              <div style={{ width: '64px', flexShrink: 0, paddingTop: '2px' }}>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-fff)', fontVariantNumeric: 'tabular-nums' }}>{hora}</p>
                {fim && <p style={{ fontSize: '11px', color: 'var(--c-44)', marginTop: '2px' }}>até {fim}</p>}
              </div>
              <div title={ag.profissional?.nome} style={{ width: '3px', background: corDoProfissional(ag.profissional_id), borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="agenda-item-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                  <p className="texto-cortado" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)' }}>{ag.cliente?.nome ?? 'Sem cliente'}</p>
                  <span className={cfg.cls}>{cfg.label}</span>
                  {temVenda && <span className="badge badge-done" title="Venda registrada para este atendimento">Venda</span>}
                </div>
                <p className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-55)' }}>
                  {ag.servico?.nome}{ag.valor != null ? ` · ${formatCurrency(ag.valor)}` : ag.servico?.preco_na_venda ? ' · valor na venda' : ag.servico?.preco ? ` · ${formatCurrency(ag.servico.preco)}` : ''}
                  {ag.profissional ? ` · ${ag.profissional.nome}` : ''}
                </p>
                {ag.observacoes && (
                  <p className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-44)', marginTop: '3px', fontStyle: 'italic' }}>"{ag.observacoes}"</p>
                )}
              </div>
              {(podeEditar || gerarVenda) && <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                {gerarVenda && (
                  <button
                    className={ag.status === 'em_atendimento' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    title="Registra a venda deste atendimento: só falta escolher a forma de pagamento"
                    onClick={parar(() => onGerarVenda(ag.id))}
                  >
                    <ShoppingCart size={12} /> Gerar venda
                  </button>
                )}
                {podeEditar && (ag.status === 'pendente' || ag.status === 'confirmado') && ag.cliente && (
                  <BotaoWhatsApp agendamento={ag} compacto onEnviado={q => onLembrete(ag.id, q)} />
                )}
                {podeEditar && ag.status === 'pendente' && (
                  <button className="btn btn-icon" title="Confirmar" onClick={parar(() => updateStatus(ag.id, 'confirmado'))}>
                    <Check size={13} />
                  </button>
                )}
                {podeEditar && ag.status === 'confirmado' && (
                  <button className="btn btn-icon" title="Iniciar atendimento" onClick={parar(() => updateStatus(ag.id, 'em_atendimento'))}>
                    <Play size={12} />
                  </button>
                )}
                {podeEditar && ag.status === 'em_atendimento' && (
                  <button className="btn btn-icon" title="Concluir sem venda" onClick={parar(() => updateStatus(ag.id, 'concluido'))}>
                    <Check size={13} />
                  </button>
                )}
                {podeEditar && (ag.status === 'pendente' || ag.status === 'confirmado') && (
                  <button className="btn btn-icon" title="Não compareceu" onClick={parar(() => updateStatus(ag.id, 'nao_compareceu'))}>
                    <Clock size={13} />
                  </button>
                )}
                {podeEditar && ag.status !== 'concluido' && ag.status !== 'cancelado' && ag.status !== 'nao_compareceu' && (
                  <button className="btn btn-icon" title="Cancelar" onClick={parar(() => { if (window.confirm('Cancelar este agendamento?')) updateStatus(ag.id, 'cancelado') })}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>}
            </motion.div>
          )
        })}
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════
   SEMANAL VIEW — time grid
══════════════════════════════════════════════════════════ */
const PASSO_ARRASTO = 15 // minutos

function SemanalView({
  baseDate, setBaseDate, agenda, onDayClick, onAbrir, onRemarcar,
}: {
  baseDate: Date
  setBaseDate: (d: Date) => void
  agenda: Agendamento[]
  onDayClick: (d: Date) => void
  onAbrir: (id: string) => void
  /** Arrastar o atendimento para outro dia/horário. Ausente = sem permissão. */
  onRemarcar?: (id: string, dataHora: string) => void
}) {
  // Arrastar para remarcar: guarda o atendimento arrastado e onde ele
  // foi pego (para o topo do card cair onde o mouse está) e o destino.
  const [arrasto, setArrasto] = useState<{ id: string; pegaY: number; altura: number } | null>(null)
  const [destino, setDestino] = useState<{ dia: string; minutos: number } | null>(null)

  function minutosNaColuna(e: React.DragEvent<HTMLDivElement>): number {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top - (arrasto?.pegaY ?? 0)
    const minutos = Math.round(((y / HOUR_H) * 60) / PASSO_ARRASTO) * PASSO_ARRASTO
    return Math.min(Math.max(minutos, 0), HOURS.length * 60 - PASSO_ARRASTO)
  }

  function soltar(e: React.DragEvent<HTMLDivElement>, dia: string) {
    e.preventDefault()
    if (!arrasto || !onRemarcar) return
    const total = GRID_START * 60 + minutosNaColuna(e)
    const ag = agenda.find(a => a.id === arrasto.id)
    const novo = `${dia}T${pad(Math.floor(total / 60))}:${pad(total % 60)}:00`
    setArrasto(null); setDestino(null)
    if (ag && !(ag.data_hora.startsWith(dia) && timeToPx(ag.data_hora) === ((total / 60) - GRID_START) * HOUR_H)) onRemarcar(arrasto.id, novo)
  }

  const weekDays = getWeekDays(baseDate)
  const todayKey = toKey(new Date())

  const navWeek = (n: number) => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + n * 7)
    setBaseDate(d)
  }

  const filtered = agenda

  // Get appointments for a specific day key, sorted
  function agForDay(dayKey: string) {
    return filtered
      .filter(a => a.data_hora.startsWith(dayKey))
      .sort((a, b) => a.data_hora.localeCompare(b.data_hora))
  }

  // Convert time to px offset from top of grid
  function timeToPx(iso: string): number {
    const d = new Date(iso)
    const h = d.getHours() + d.getMinutes() / 60
    return (h - GRID_START) * HOUR_H
  }

  function durationToPx(mins: number): number {
    return Math.max((mins / 60) * HOUR_H, 28)
  }

  const weekLabel = `${weekDays[0].getDate()} ${MONTH_NAMES[weekDays[0].getMonth()]} — ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`

  return (
    <div>
      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-icon" onClick={() => navWeek(-1)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-a3)', flex: 1 }}>{weekLabel}</span>
        <button className="btn btn-icon" onClick={() => navWeek(1)}><ChevronRight size={14} /></button>
      </div>

      {/* Grid */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="agenda-week-scroll">
      <div className="agenda-week-inner">
        {/* Day headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '52px repeat(7, 1fr)',
          borderBottom: '1px solid var(--c-22)',
          background: 'var(--header-bg)',
        }}>
          <div />
          {weekDays.map((d, i) => {
            const key     = toKey(d)
            const isToday = key === todayKey
            const count   = agForDay(key).length
            return (
              <div
                key={key}
                onClick={() => onDayClick(d)}
                style={{
                  padding: '10px 8px',
                  textAlign: 'center',
                  borderLeft: '1px solid var(--c-1a)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(var(--ink),0.03)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <p style={{
                  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: isToday ? 'var(--c-fff)' : 'var(--c-55)', marginBottom: '4px',
                }}>
                  {WEEK_DAYS_SHORT[i]}
                </p>
                <p style={{
                  fontSize: '18px', fontWeight: 700, lineHeight: 1, fontFamily: 'DM Sans, sans-serif',
                  color: isToday ? 'var(--c-fff)' : 'var(--c-a3)',
                }}>
                  {d.getDate()}
                </p>
                {count > 0 && (
                  <div style={{
                    marginTop: '4px', fontSize: '10px', color: 'var(--c-44)',
                    background: 'rgba(var(--ink),0.05)', borderRadius: '99px',
                    padding: '1px 5px', display: 'inline-block',
                  }}>
                    {count}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Time body — scrollable */}
        <div style={{ overflowY: 'auto', maxHeight: '520px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '52px repeat(7, 1fr)',
            position: 'relative',
          }}>
            {/* Hour labels column */}
            <div style={{ borderRight: '1px solid var(--c-1a)' }}>
              {HOURS.map(h => (
                <div key={h} style={{
                  height: `${HOUR_H}px`, display: 'flex', alignItems: 'flex-start',
                  justifyContent: 'flex-end', padding: '4px 8px 0 0',
                  borderBottom: '1px solid var(--c-1a)',
                }}>
                  <span style={{ fontSize: '10px', color: 'var(--c-3a)', fontVariantNumeric: 'tabular-nums' }}>
                    {pad(h)}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((d) => {
              const key  = toKey(d)
              const ags  = agForDay(key)
              const isToday = key === todayKey
              return (
                <div
                  key={key}
                  onDragOver={arrasto ? e => {
                    e.preventDefault()
                    const minutos = minutosNaColuna(e)
                    if (destino?.dia !== key || destino.minutos !== minutos) setDestino({ dia: key, minutos })
                  } : undefined}
                  onDrop={arrasto ? e => soltar(e, key) : undefined}
                  style={{
                    borderLeft: '1px solid var(--c-1a)',
                    position: 'relative',
                    background: destino?.dia === key ? 'rgba(var(--ink),0.04)' : isToday ? 'rgba(var(--ink),0.015)' : 'transparent',
                  }}
                >
                  {/* Onde o atendimento arrastado vai cair */}
                  {arrasto && destino?.dia === key && (
                    <div className="agenda-destino" style={{ top: `${(destino.minutos / 60) * HOUR_H}px`, height: `${arrasto.altura}px` }}>
                      {pad(GRID_START + Math.floor(destino.minutos / 60))}:{pad(destino.minutos % 60)}
                    </div>
                  )}
                  {/* Hour lines */}
                  {HOURS.map(h => (
                    <div key={h} style={{ height: `${HOUR_H}px`, borderBottom: '1px solid var(--c-1a)' }} />
                  ))}

                  {/* Appointments */}
                  {ags.map(ag => {
                    const top  = timeToPx(ag.data_hora)
                    const h    = durationToPx(ag.servico?.duracao_minutos ?? 30)
                    const cfg  = STATUS_CFG[ag.status]
                    const arrastavel = !!onRemarcar && (ag.status === 'pendente' || ag.status === 'confirmado')
                    return (
                      <div
                        key={ag.id}
                        draggable={arrastavel}
                        onDragStart={arrastavel ? e => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', ag.id)
                          setArrasto({ id: ag.id, pegaY: e.clientY - e.currentTarget.getBoundingClientRect().top, altura: h })
                        } : undefined}
                        onDragEnd={() => { setArrasto(null); setDestino(null) }}
                        title={`${ag.cliente?.nome ?? 'Sem cliente'} — ${ag.servico?.nome ?? ''}${ag.profissional ? ` · ${ag.profissional.nome}` : ''}${arrastavel ? ' · arraste para remarcar' : ''}`}
                        onClick={() => onAbrir(ag.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter') onAbrir(ag.id) }}
                        style={{
                          position: 'absolute',
                          top: `${top}px`,
                          left: '3px',
                          right: '3px',
                          height: `${h}px`,
                          background: `color-mix(in srgb, ${corDoProfissional(ag.profissional_id)} 14%, var(--c-26))`,
                          border: '1px solid var(--c-3a)',
                          borderLeft: `3px solid ${corDoProfissional(ag.profissional_id)}`,
                          borderRadius: '5px',
                          padding: '4px 7px',
                          overflow: 'hidden',
                          cursor: arrastavel ? 'grab' : 'pointer',
                          zIndex: 1,
                          opacity: arrasto?.id === ag.id ? 0.35 : ag.status === 'cancelado' || ag.status === 'nao_compareceu' ? 0.5 : 1,
                        }}
                      >
                        <p style={{
                          fontSize: '11px', fontWeight: 600, color: 'var(--c-fff)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          lineHeight: 1.2,
                        }}>
                          {ag.cliente?.nome ?? 'Cliente'}
                          {h < 40 && ag.profissional && <span style={{ fontWeight: 400, color: 'var(--c-66)' }}> · {ag.profissional.nome.split(' ')[0]}</span>}
                        </p>
                        {h >= 40 && (
                          <p style={{
                            fontSize: '10px', color: 'var(--c-66)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            marginTop: '2px',
                          }}>
                            {ag.servico?.nome}{ag.profissional ? ` · ${ag.profissional.nome.split(' ')[0]}` : ''}
                          </p>
                        )}
                        {h >= 52 && (
                          <span className={cfg.cls} style={{ fontSize: '9px', padding: '1px 6px', marginTop: '3px', display: 'inline-block' }}>
                            {cfg.label}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MENSAL VIEW — month calendar
══════════════════════════════════════════════════════════ */
function MensalView({
  baseDate, setBaseDate, agenda, onDayClick, selectedDate, onAbrir,
}: {
  baseDate: Date
  setBaseDate: (d: Date) => void
  agenda: Agendamento[]
  onDayClick: (d: Date) => void
  selectedDate: Date
  onAbrir: (id: string) => void
}) {
  const year  = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const grid  = getMonthGrid(year, month)
  const todayKey   = toKey(new Date())
  const selectedKey = toKey(selectedDate)

  const navMonth = (n: number) => {
    const d = new Date(year, month + n, 1)
    setBaseDate(d)
  }

  const filtered = agenda

  function agForDay(dayKey: string) {
    return filtered.filter(a => a.data_hora.startsWith(dayKey))
  }

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button className="btn btn-icon" onClick={() => navMonth(-1)}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--c-fff)', flex: 1 }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button className="btn btn-icon" onClick={() => navMonth(1)}><ChevronRight size={14} /></button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="agenda-month-scroll">
      <div className="agenda-month-inner">
        {/* Day of week headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--c-22)',
          background: 'var(--header-bg)',
        }}>
          {WEEK_DAYS_SHORT.map(d => (
            <div key={d} style={{
              padding: '10px 0',
              textAlign: 'center',
              fontSize: '10px', fontWeight: 600,
              color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {grid.map((d, i) => {
            const key       = toKey(d)
            const isToday   = key === todayKey
            const isSel     = key === selectedKey
            const isThisMon = d.getMonth() === month
            const ags       = agForDay(key)
            const maxShow   = 3
            const extra     = Math.max(0, ags.length - maxShow)

            return (
              <motion.div
                key={key}
                onClick={() => onDayClick(d)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.004 }}
                style={{
                  minHeight: '90px',
                  padding: '8px',
                  borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid var(--c-1a)',
                  borderBottom: i < grid.length - 7 ? '1px solid var(--c-1a)' : 'none',
                  cursor: 'pointer',
                  background: isSel ? 'rgba(var(--ink),0.06)' : 'transparent',
                  transition: 'background 0.12s',
                  position: 'relative',
                }}
                whileHover={{ backgroundColor: 'rgba(var(--ink),0.03)' }}
              >
                {/* Day number */}
                <div style={{
                  width: '26px', height: '26px',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '6px',
                  background: isToday ? 'var(--c-fff)' : 'transparent',
                }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--c-0d)' : isThisMon ? (isSel ? 'var(--c-fff)' : 'var(--c-a3)') : 'var(--c-33)',
                    fontFamily: 'DM Sans, sans-serif',
                  }}>
                    {d.getDate()}
                  </span>
                </div>

                {/* Appointment pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {ags.slice(0, maxShow).map(ag => {
                    const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div
                        key={ag.id}
                        role="button"
                        title={`${hora} · ${ag.cliente?.nome ?? 'Sem cliente'} — ${ag.servico?.nome ?? ''}${ag.profissional ? ` · ${ag.profissional.nome}` : ''}`}
                        onClick={e => { e.stopPropagation(); onAbrir(ag.id) }}
                        style={{
                          fontSize: '10px', color: 'var(--c-a3)',
                          background: 'rgba(var(--ink),0.06)',
                          border: '1px solid var(--c-2a)',
                          borderLeft: `3px solid ${corDoProfissional(ag.profissional_id)}`,
                          borderRadius: '3px',
                          padding: '1px 5px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ color: 'var(--c-55)', marginRight: '4px' }}>{hora}</span>
                        {ag.cliente?.nome ?? ag.servico?.nome}
                      </div>
                    )
                  })}
                  {extra > 0 && (
                    <div style={{ fontSize: '10px', color: 'var(--c-44)', paddingLeft: '2px' }}>
                      +{extra} mais
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
      </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function Agenda() {
  const { podeEditar: podeEditarTela, verVendasOutros, verAgendamentosOutros } = usePermissoes()
  const { profissionalId: meuProfissional } = usePerfil()
  const podeEditar = podeEditarTela('agenda')
  const podeVender = podeEditarTela('pdv')
  const podeTirarComissao = podeEditarTela('comissoes')
  const navigate = useNavigate()
  const [agAbertoId, setAgAbertoId] = useState<string | null>(null)
  const [lembretesAberto, setLembretesAberto] = useState(false)
  const [vendaAbertaId, setVendaAbertaId] = useState<string | null>(null)
  // "Gerar venda": modal de venda do atendimento e o aviso depois de vender.
  const [vendaAgId, setVendaAgId] = useState<string | null>(null)
  const [vendaFeita, setVendaFeita] = useState<{ comandaId: string; total: number; vinculada: boolean } | null>(null)
  const [viewMode, setViewMode]     = useState<ViewMode>('lista')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [calBase, setCalBase]       = useState(new Date()) // week/month navigation base
  // Faixa de 7 dias da Lista: começa 2 dias antes de hoje e anda uma
  // semana pelas setas; se o dia escolhido sair dela, ela o acompanha.
  const [inicioFaixa, setInicioFaixa] = useState(() => somarDias(new Date(), -2))
  const [recarga, setRecarga] = useState(0)
  // Profissionais escolhidos no filtro (vazio = todos).
  const [filterProfIds, setFilterProfIds] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(FILTRO_PROF_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
  })

  const [agenda, setAgenda]         = useState<Agendamento[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [servicos, setServicos]     = useState<Servico[]>([])
  const [profServMap, setProfServMap] = useState<Record<string, string[]>>({})
  const [clientes, setClientes]     = useState<Cliente[]>([])
  const [showModal, setShowModal]   = useState(false)
  const [avisoAgenda, setAvisoAgenda] = useState('')

  const [form, setForm] = useState({
    cliente_id: '', profissional_id: '', servico_id: '',
    data: toKey(new Date()), hora: '09:00', obs: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    let inicio: string
    let fim: string
    if (viewMode === 'semanal') {
      const dias = getWeekDays(calBase)
      inicio = toKey(dias[0]); fim = toKey(dias[6])
    } else if (viewMode === 'mensal') {
      const dias = getMonthGrid(calBase.getFullYear(), calBase.getMonth())
      inicio = toKey(dias[0]); fim = toKey(dias[dias.length - 1])
    } else {
      inicio = toKey(inicioFaixa); fim = toKey(somarDias(inicioFaixa, 6))
    }
    supabase
      .from('agendamentos')
      .select(SELECT_AGENDA)
      .gte('data_hora', `${inicio}T00:00:00`)
      .lte('data_hora', `${fim}T23:59:59`)
      .order('data_hora')
      .then(({ data }) => { setAgenda((data ?? []) as Agendamento[]) })
  }, [inicioFaixa, viewMode, calBase, recarga])

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome')
      .then(({ data }) => { if (data) setClientes(data as Cliente[]) })

    supabase.from('profissionais').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })

    supabase.from('servicos').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setServicos(data as Servico[]) })

    supabase.from('profissional_servicos').select('*')
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string[]> = {}
          ;(data as { profissional_id: string; servico_id: string }[]).forEach(ps => {
            if (!map[ps.profissional_id]) map[ps.profissional_id] = []
            map[ps.profissional_id].push(ps.servico_id)
          })
          setProfServMap(map)
        }
      })
  }, [])

  async function handleSave() {
    if (!form.profissional_id) { setError('Selecione um profissional.'); return }
    if (!form.servico_id) { setError('Selecione o serviço.'); return }
    setSaving(true); setError('')
    const data_hora = `${form.data}T${form.hora}:00`
    const servicoSelecionado = servicos.find(s => s.id === form.servico_id)
    const { error: err } = await supabase.from('agendamentos').insert({
      cliente_id: form.cliente_id || null,
      profissional_id: form.profissional_id,
      servico_id: form.servico_id || null,
      data_hora,
      duracao_minutos: servicoSelecionado?.duracao_minutos ?? 30,
      // Serviço com valor decidido na venda fica sem valor no agendamento.
      valor: servicoSelecionado && !servicoSelecionado.preco_na_venda ? servicoSelecionado.preco : null,
      observacoes: form.obs, status: 'pendente',
    })
    if (err) {
      setError(
        err.code === '23P01'
          ? 'Esse profissional já tem outro atendimento nesse horário.'
          : err.message
      )
      setSaving(false); return
    }
    setShowModal(false)
    // Agendou para um profissional cuja agenda o usuário não vê: avisa,
    // porque o agendamento não vai aparecer na tela dele.
    if (!verAgendamentosOutros && form.profissional_id !== meuProfissional) {
      const nome = profissionais.find(p => p.id === form.profissional_id)?.nome ?? 'o profissional'
      setAvisoAgenda(`Agendado para ${nome}. O agendamento aparece na agenda de ${nome}, não na sua.`)
      setTimeout(() => setAvisoAgenda(''), 6000)
    }
    setForm({ cliente_id: '', profissional_id: '', servico_id: '', data: toKey(new Date()), hora: '09:00', obs: '' })
    setSaving(false)
    setRecarga(n => n + 1)
  }

  // "Gerar venda" registra a venda ali mesmo (só falta a forma de
  // pagamento); a venda fica ligada ao agendamento e ele vira concluído.
  function gerarVenda(id: string) {
    setAgAbertoId(null)
    setVendaAgId(id)
  }

  // Para vender outros itens junto: abre Vendas com a comanda já montada.
  function adicionarItens(id: string) {
    setVendaAgId(null)
    navigate(`/vendas?agendamento=${id}`)
  }

  function vendido(id: string, comandaId: string, total: number, vinculada: boolean) {
    setVendaAgId(null)
    setAgenda(prev => prev.map(a => a.id === id
      ? { ...a, status: vinculada ? 'concluido' : a.status, vendas: [...(a.vendas ?? []), { id: comandaId, status: 'fechada' }] }
      : a))
    setVendaFeita({ comandaId, total, vinculada })
    setTimeout(() => setVendaFeita(v => (v?.comandaId === comandaId ? null : v)), 7000)
  }

  const agAberto = agAbertoId ? agenda.find(a => a.id === agAbertoId) ?? null : null
  const agVenda = vendaAgId ? agenda.find(a => a.id === vendaAgId) ?? null : null

  async function updateStatus(id: string, status: AgendamentoStatus) {
    const anterior = agenda.find(a => a.id === id)?.status
    setAgenda(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    const { error: err } = await supabase.from('agendamentos').update({ status }).eq('id', id)
    if (err && anterior) {
      setAgenda(prev => prev.map(a => a.id === id ? { ...a, status: anterior } : a))
      window.alert(`Não foi possível mudar o status: ${err.message}`)
    }
  }

  // Dia escolhido fora da faixa da Lista (pelo calendário ou ao agendar
  // em outra data): a faixa vai até ele.
  useEffect(() => {
    const k = toKey(selectedDate)
    if (k < toKey(inicioFaixa) || k > toKey(somarDias(inicioFaixa, 6))) setInicioFaixa(somarDias(selectedDate, -2))
  }, [selectedDate])

  // Setas da Lista: anda uma semana e leva o dia escolhido junto.
  function navegarSemana(n: number) {
    setInicioFaixa(d => somarDias(d, n * 7))
    setSelectedDate(d => somarDias(d, n * 7))
  }

  // Lembrete aberto no WhatsApp: marca na lista sem recarregar.
  function marcarLembrete(id: string, quando: string) {
    setAgenda(prev => prev.map(a => a.id === id ? { ...a, lembrete_enviado_em: quando } : a))
  }

  // Arrastar na semanal: muda o horário na hora e desfaz se o banco
  // recusar (ex.: o profissional já tem atendimento nesse horário).
  async function remarcar(id: string, dataHora: string) {
    const anterior = agenda.find(a => a.id === id)
    if (!anterior) return
    setAgenda(prev => prev.map(a => a.id === id ? { ...a, data_hora: dataHora } : a))
    // Vai para o banco com o fuso do navegador (o mesmo usado para exibir).
    const { error: err } = await supabase.from('agendamentos').update({ data_hora: new Date(dataHora).toISOString() }).eq('id', id)
    if (err) {
      setAgenda(prev => prev.map(a => a.id === id ? { ...a, data_hora: anterior.data_hora } : a))
      window.alert(err.code === '23P01' ? 'Esse profissional já tem outro atendimento nesse horário.' : `Não foi possível remarcar: ${err.message}`)
    }
  }

  // When clicking a day in semanal/mensal views
  function handleDayClick(d: Date) {
    setSelectedDate(d)
    setViewMode('lista')
  }

  // Filtro de profissional vale para as três visões; a contagem é do
  // período que a tela mostra (o dia na lista, a semana, o mês).
  const chaveDia = toKey(selectedDate)
  const agendaPeriodo = viewMode === 'lista' ? agenda.filter(a => a.data_hora.startsWith(chaveDia)) : agenda
  const contagemProf: Record<string, number> = {}
  agendaPeriodo.forEach(a => { contagemProf[a.profissional_id] = (contagemProf[a.profissional_id] ?? 0) + 1 })
  // Sem "ver agendamentos de outros", só o profissional vinculado ao
  // usuário aparece (o banco já devolve só os agendamentos dele).
  const profissionaisVisiveis = verAgendamentosOutros ? profissionais : profissionais.filter(p => p.id === meuProfissional)

  // Filtro salvo de um profissional que saiu da lista não esconde a agenda.
  const filtroAtivo = filterProfIds.filter(id => profissionaisVisiveis.some(p => p.id === id))
  const agendaFiltrada = filtroAtivo.length > 0 ? agenda.filter(a => filtroAtivo.includes(a.profissional_id)) : agenda

  // O novo agendamento já vem com o profissional filtrado ou, sem
  // filtro, com o profissional vinculado ao usuário. Dá para agendar
  // para qualquer profissional, mesmo sem ver a agenda dos outros.
  function abrirNovo() {
    setError('')
    const vinculado = meuProfissional && profissionais.some(p => p.id === meuProfissional) ? meuProfissional : ''
    // Data: o dia aberto na lista (se não for passado) ou hoje. Hora: hoje,
    // o próximo horário cheio de 15 em 15 min a partir de agora.
    const hojeKey = toKey(new Date())
    const diaTela = viewMode === 'lista' ? toKey(selectedDate) : hojeKey
    const data = diaTela > hojeKey ? diaTela : hojeKey
    let hora = '09:00'
    if (data === hojeKey) {
      const agora = new Date()
      const min = Math.ceil((agora.getHours() * 60 + agora.getMinutes() + 1) / 15) * 15
      hora = min >= 24 * 60 ? '23:45' : `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
    }
    setForm(f => {
      const prof = (filtroAtivo.length === 1 ? filtroAtivo[0] : '') || f.profissional_id || vinculado
      const base = { ...f, data, hora }
      return prof === f.profissional_id ? base : { ...base, profissional_id: prof, servico_id: '' }
    })
    setShowModal(true)
  }

  function escolherProfissionais(ids: string[]) {
    setFilterProfIds(ids)
    try { localStorage.setItem(FILTRO_PROF_KEY, JSON.stringify(ids)) } catch { /* sem storage */ }
  }

  // Só os serviços que o profissional faz; profissional sem nenhum
  // serviço vinculado vê todos (antes ficava com a lista vazia e o
  // agendamento era salvo sem serviço, e a venda não trazia o item).
  const servicosDoProf = profServMap[form.profissional_id] ?? []
  const servicosFiltrados = form.profissional_id && servicosDoProf.length > 0
    ? servicos.filter(s => servicosDoProf.includes(s.id))
    : servicos

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Agenda</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {viewMode === 'lista'
              ? selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
              : viewMode === 'mensal'
              ? `${MONTH_NAMES[calBase.getMonth()]} ${calBase.getFullYear()}`
              : `Semana de ${getWeekDays(calBase)[0].toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
            }
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* View toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '2px',
            padding: '4px',
            background: 'var(--c-1a)',
            border: '1px solid var(--c-25)',
            borderRadius: '9px',
          }}>
            <ViewBtn active={viewMode === 'lista'}   onClick={() => setViewMode('lista')}   icon={List}          label="Lista"   />
            <ViewBtn active={viewMode === 'semanal'} onClick={() => { setViewMode('semanal'); setCalBase(selectedDate) }} icon={CalendarDays} label="Semanal" />
            <ViewBtn active={viewMode === 'mensal'}  onClick={() => { setViewMode('mensal');  setCalBase(selectedDate) }} icon={CalendarRange} label="Mensal"  />
          </div>

          {podeEditar && (
            <button className="btn btn-secondary" onClick={() => setLembretesAberto(true)} title="Mandar lembrete no WhatsApp para os clientes de amanhã" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageCircle size={14} /> Lembretes de amanhã
            </button>
          )}

          {podeEditar && (
            <button
              className="btn btn-primary"
              onClick={abrirNovo}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={14} strokeWidth={2.5} /> Agendar
            </button>
          )}
        </div>
      </div>

      <FiltroProfissional
        profissionais={profissionaisVisiveis}
        contagem={contagemProf}
        total={agendaPeriodo.length}
        valor={filtroAtivo}
        onChange={escolherProfissionais}
      />

      {/* Views */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          {viewMode === 'lista' && (
            <ListaView
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              inicioFaixa={inicioFaixa}
              onNavegar={navegarSemana}
              agenda={agendaFiltrada}
              updateStatus={updateStatus}
              podeEditar={podeEditar}
              podeVender={podeVender}
              verTodasVendas={verVendasOutros}
              onOpenModal={abrirNovo}
              setFormDate={k => setForm(f => ({ ...f, data: k }))}
              onAbrir={setAgAbertoId}
              onGerarVenda={gerarVenda}
              onLembrete={marcarLembrete}
            />
          )}
          {viewMode === 'semanal' && (
            <SemanalView
              baseDate={calBase}
              setBaseDate={setCalBase}
              agenda={agendaFiltrada}
              onDayClick={handleDayClick}
              onAbrir={setAgAbertoId}
              onRemarcar={podeEditar ? remarcar : undefined}
            />
          )}
          {viewMode === 'mensal' && (
            <MensalView
              baseDate={calBase}
              setBaseDate={setCalBase}
              agenda={agendaFiltrada}
              onDayClick={handleDayClick}
              selectedDate={selectedDate}
              onAbrir={setAgAbertoId}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Card do agendamento */}
      <AnimatePresence>
        {agAberto && (
          <AgendamentoDetalheModal
            key={agAberto.id}
            agendamento={agAberto}
            podeEditar={podeEditar}
            podeVender={podeVender}
            verTodasVendas={verVendasOutros}
            onClose={() => setAgAbertoId(null)}
            onStatus={s => updateStatus(agAberto.id, s)}
            onObservacaoSalva={texto => setAgenda(prev => prev.map(a => a.id === agAberto.id ? { ...a, observacoes: texto || undefined } : a))}
            onGerarVenda={() => gerarVenda(agAberto.id)}
            onVerVenda={comandaId => { setAgAbertoId(null); setVendaAbertaId(comandaId) }}
            onLembrete={quando => marcarLembrete(agAberto.id, quando)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lembretesAberto && (
          <LembretesModal onClose={() => setLembretesAberto(false)} onEnviado={marcarLembrete} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {vendaAbertaId && (
          <VendaDetalheModal comandaId={vendaAbertaId} onClose={() => setVendaAbertaId(null)} />
        )}
      </AnimatePresence>

      {/* Gerar venda do atendimento */}
      <AnimatePresence>
        {agVenda && (
          <VendaAgendamentoModal
            key={agVenda.id}
            agendamento={agVenda}
            podeTirarComissao={podeTirarComissao}
            onClose={() => setVendaAgId(null)}
            onVendido={(comandaId, total, vinculada) => vendido(agVenda.id, comandaId, total, vinculada)}
            onAdicionarItens={() => adicionarItens(agVenda.id)}
          />
        )}
      </AnimatePresence>

      {/* Aviso de venda registrada */}
      <AnimatePresence>
        {vendaFeita && (
          <motion.div
            className="aviso-flutuante"
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
          >
            <span className="aviso-flutuante-icone"><Check size={14} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '13px', color: 'var(--c-fff)' }}>Venda registrada</strong>
              <span style={{ fontSize: '12px', color: 'var(--c-a3)' }}>{formatCurrency(vendaFeita.total)}{vendaFeita.vinculada ? ' · agendamento concluído' : ''}</span>
            </span>
            <button className="btn btn-secondary btn-sm" onClick={() => { setVendaAbertaId(vendaFeita.comandaId); setVendaFeita(null) }}>Ver venda</button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {avisoAgenda && !vendaFeita && (
          <motion.div
            className="aviso-flutuante"
            role="status"
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16 }}
          >
            <span className="aviso-flutuante-icone"><Check size={14} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: 'var(--c-fff)' }}>{avisoAgenda}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Novo agendamento */}
      <AnimatePresence>
        {showModal && (
          <ModalFormulario
            icone={<CalendarPlus size={18} />}
            titulo="Novo Agendamento"
            descricao="O horário não pode bater com outro atendimento do mesmo profissional."
            onClose={() => setShowModal(false)}
            onSalvar={handleSave}
            salvando={saving}
            rotuloSalvar="Confirmar"
            erro={error}
          >
            <FormGrade colunas={4}>
              {clientes.length > 0 && (
                <Campo rotulo="Cliente" span={2}>
                  <select className="input" value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </Campo>
              )}
              <Campo rotulo="Profissional *" span={2}>
                <select className="input" value={form.profissional_id} onChange={e => setForm(f => ({ ...f, profissional_id: e.target.value, servico_id: '' }))}>
                  <option value="">Selecionar...</option>
                  {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Serviço *" span={2}>
                <select className="input" value={form.servico_id} onChange={e => setForm(f => ({ ...f, servico_id: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {servicosFiltrados.map(s => <option key={s.id} value={s.id}>{s.nome} · {s.preco_na_venda ? 'valor na venda' : formatCurrency(s.preco)}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Data">
                <input type="date" className="input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
              </Campo>
              <Campo rotulo="Hora">
                <input type="time" className="input" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
              </Campo>
              <Campo rotulo="Observações" span="total">
                <textarea className="input textarea" style={{ minHeight: '64px' }} placeholder="Opcional..." value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
