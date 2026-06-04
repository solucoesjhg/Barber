import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Calendar, Users, TrendingUp, DollarSign,
  Plus, ChevronRight, Clock, ArrowUpRight,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Agendamento } from '../types'
import { stagger, staggerItem } from '../lib/motion'

const STATUS_CONFIG: Record<string, { label: string; dot: string; color: string; bg: string }> = {
  agendado:       { label: 'Agendado',     dot: '#60a5fa', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)'  },
  confirmado:     { label: 'Confirmado',   dot: '#4ADE80', color: '#4ADE80', bg: 'rgba(74,222,128,0.12)'  },
  em_atendimento: { label: 'Em andamento', dot: '#FBBF24', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)'  },
  finalizado:     { label: 'Finalizado',   dot: '#9CA3AF', color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)'  },
  cancelado:      { label: 'Cancelado',    dot: '#F87171', color: '#F87171', bg: 'rgba(248,113,113,0.1)'  },
  nao_compareceu: { label: 'Não veio',     dot: '#fb923c', color: '#fb923c', bg: 'rgba(251,146,60,0.1)'   },
}

interface CardConfig {
  label: string
  icon: typeof Calendar
  iconColor: string
  iconBg: string
  trend: string | null
  trendUp: boolean | null
}

const CARD_CONFIGS: CardConfig[] = [
  {
    label:     'Agendamentos',
    icon:      Calendar,
    iconColor: '#60a5fa',
    iconBg:    'rgba(59,130,246,0.15)',
    trend:     '+8%',
    trendUp:   true,
  },
  {
    label:     'Atendidos',
    icon:      Users,
    iconColor: '#4ADE80',
    iconBg:    'rgba(74,222,128,0.15)',
    trend:     '+12%',
    trendUp:   true,
  },
  {
    label:     'Em andamento',
    icon:      TrendingUp,
    iconColor: '#FBBF24',
    iconBg:    'rgba(251,191,36,0.15)',
    trend:     null,
    trendUp:   null,
  },
  {
    label:     'Faturamento',
    icon:      DollarSign,
    iconColor: '#C8A951',
    iconBg:    'rgba(200,169,81,0.15)',
    trend:     null,
    trendUp:   null,
  },
]

export default function Dashboard() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading]           = useState(true)
  const dataHoje = new Date().toISOString().split('T')[0]

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  useEffect(() => {
    async function loadAgendamentos() {
      const { data } = await supabase
        .from('agendamentos')
        .select('*, clientes(*), funcionarios(*), servicos(*)')
        .gte('dtini_ag', `${dataHoje}T00:00:00`)
        .lte('dtini_ag', `${dataHoje}T23:59:59`)
        .neq('status_ag', 'cancelado')
        .order('dtini_ag')
      setAgendamentos(data ?? [])
      setLoading(false)
    }
    loadAgendamentos()
  }, [dataHoje])

  const total       = agendamentos.length
  const atendidos   = agendamentos.filter(a => a.status_ag === 'finalizado').length
  const emAndamento = agendamentos.filter(a => a.status_ag === 'em_atendimento').length
  const proximos    = agendamentos.filter(a => ['agendado', 'confirmado'].includes(a.status_ag)).length

  const cardValues = [String(total), String(atendidos), String(emAndamento), '—']
  const cardSubs   = ['hoje', 'finalizados hoje', `${proximos} aguardando`, 'caixa não aberto']

  return (
    <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '48px 40px 64px' }}>

      {/* Page header */}
      <motion.div
        className="flex items-start justify-between"
        style={{ marginBottom: '32px' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div>
          <p
            className="uppercase font-semibold capitalize"
            style={{ fontSize: '11px', letterSpacing: '0.16em', color: 'var(--text-muted)', marginBottom: '6px' }}
          >
            {dataFormatada}
          </p>
          <h1
            className="font-bold tracking-tight"
            style={{ fontSize: '26px', color: 'var(--text-primary)', lineHeight: 1.2 }}
          >
            {saudacao}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
            Aqui está o resumo do seu dia.
          </p>
        </div>

        <motion.button
          className="flex items-center gap-2 font-semibold rounded-xl"
          style={{
            fontSize: '13px',
            padding: '10px 18px',
            background: 'var(--accent)',
            color: '#0f0f0f',
            boxShadow: 'var(--shadow-accent)',
            transition: 'all 0.2s ease',
            border: 'none',
            cursor: 'pointer',
          }}
          whileHover={{
            scale: 1.02,
            background: '#D4AF37',
            boxShadow: '0 6px 24px rgba(200,169,81,0.4)',
          }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.18 }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Novo agendamento
        </motion.button>
      </motion.div>

      {/* Metric cards */}
      <motion.div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        {CARD_CONFIGS.map((cfg, i) => {
          const Icon  = cfg.icon
          const value = cardValues[i]
          const sub   = cardSubs[i]
          const isLive = i === 2

          return (
            <motion.div
              key={cfg.label}
              variants={staggerItem}
              className="rounded-2xl cursor-pointer"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
                padding: '20px',
                transition: 'border-color 0.2s ease',
              }}
              whileHover={{
                y: -3,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                transition: { duration: 0.18 },
              }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Top row */}
              <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: '38px', height: '38px', background: cfg.iconBg }}
                >
                  <Icon size={16} style={{ color: cfg.iconColor }} strokeWidth={2} />
                </div>

                {isLive ? (
                  <div className="flex items-center gap-1.5">
                    <motion.div
                      className="rounded-full"
                      style={{ width: '6px', height: '6px', background: '#FBBF24' }}
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#FBBF24' }}>
                      ao vivo
                    </span>
                  </div>
                ) : cfg.trend ? (
                  <div
                    className="flex items-center gap-0.5"
                    style={{ fontSize: '11px', fontWeight: 600, color: cfg.trendUp ? 'var(--success)' : 'var(--text-muted)' }}
                  >
                    {cfg.trendUp && <ArrowUpRight size={12} />}
                    {cfg.trend}
                  </div>
                ) : null}
              </div>

              {/* Value */}
              <motion.p
                className="font-bold tabular-nums"
                style={{ fontSize: '30px', color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.03em' }}
                initial={{ opacity: 0, scale: 0.84 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.12 + i * 0.06, type: 'spring', stiffness: 220, damping: 18 }}
              >
                {value}
              </motion.p>

              <p className="font-semibold" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                {cfg.label}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {sub}
              </p>
            </motion.div>
          )
        })}
      </motion.div>

      {/* Agenda table */}
      <motion.div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Table toolbar */}
        <div
          className="flex items-center justify-between"
          style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: '30px', height: '30px', background: 'var(--accent-muted)' }}
            >
              <Calendar size={13} style={{ color: 'var(--accent-text)' }} strokeWidth={2} />
            </div>
            <h2 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Agenda de hoje
            </h2>
            {total > 0 && (
              <motion.span
                className="font-bold tabular-nums rounded-full"
                style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  background: 'var(--accent-muted)',
                  color: 'var(--accent-text)',
                }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.38 }}
              >
                {total}
              </motion.span>
            )}
          </div>

          <motion.button
            className="flex items-center gap-1 font-semibold"
            style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            whileHover={{ color: '#F5F5F0', x: 2 }}
            transition={{ duration: 0.13 }}
          >
            Ver tudo <ChevronRight size={12} />
          </motion.button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center gap-3" style={{ padding: '56px 24px' }}>
            <motion.div
              className="rounded-full"
              style={{ width: '16px', height: '16px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.75, repeat: Infinity, ease: 'linear' }}
            />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Carregando agenda...</span>
          </div>

        ) : agendamentos.length === 0 ? (
          <motion.div
            className="text-center"
            style={{ padding: '64px 24px' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="flex items-center justify-center rounded-2xl mx-auto"
              style={{ width: '52px', height: '52px', background: 'var(--accent-muted)', marginBottom: '16px' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8A951" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <circle cx="6" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                <line x1="8.12" y1="8.12" x2="12" y2="12"/>
              </svg>
            </motion.div>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Nenhum agendamento hoje
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Adicione um novo agendamento para começar.
            </p>
            <motion.button
              className="inline-flex items-center gap-2 font-semibold rounded-xl"
              style={{
                fontSize: '13px',
                padding: '9px 16px',
                background: 'var(--accent)',
                color: '#0f0f0f',
                boxShadow: 'var(--shadow-accent)',
                border: 'none',
                cursor: 'pointer',
              }}
              whileHover={{ scale: 1.03, background: '#D4AF37' }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus size={13} strokeWidth={2.5} />
              Novo agendamento
            </motion.button>
          </motion.div>

        ) : (
          <motion.div variants={stagger} initial="initial" animate="animate">
            {/* Column headers */}
            <div
              className="grid"
              style={{
                gridTemplateColumns: '72px 1fr 160px 130px 28px',
                padding: '8px 24px',
                fontSize: '10.5px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
              }}
            >
              <span>Hora</span>
              <span>Cliente</span>
              <span className="hidden sm:block">Profissional</span>
              <span>Status</span>
              <span />
            </div>

            {agendamentos.map(ag => {
              const cfg  = STATUS_CONFIG[ag.status_ag] ?? STATUS_CONFIG.agendado
              const hora = new Date(ag.dtini_ag).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

              return (
                <motion.div
                  key={ag.id_ag}
                  variants={staggerItem}
                  className="grid items-center group cursor-pointer"
                  style={{
                    gridTemplateColumns: '72px 1fr 160px 130px 28px',
                    padding: '14px 24px',
                    borderBottom: '1px solid var(--border-subtle)',
                    transition: 'background 0.1s ease',
                  }}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.025)' }}
                >
                  {/* Hora */}
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} style={{ color: 'var(--border)', flexShrink: 0 }} />
                    <span className="font-bold tabular-nums" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      {hora}
                    </span>
                  </div>

                  {/* Cliente + serviço */}
                  <div style={{ minWidth: 0 }}>
                    <p className="font-semibold truncate" style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      {ag.clientes?.nome_cl ?? '—'}
                    </p>
                    <p className="truncate" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {ag.servicos?.nome_sv ?? '—'}
                    </p>
                  </div>

                  {/* Profissional */}
                  <div className="hidden sm:block truncate font-medium" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {ag.funcionarios?.nome_fu ?? '—'}
                  </div>

                  {/* Status */}
                  <div>
                    <motion.span
                      className="inline-flex items-center gap-1.5 rounded-full font-semibold"
                      style={{ fontSize: '11px', padding: '4px 10px', color: cfg.color, background: cfg.bg }}
                      whileHover={{ scale: 1.04 }}
                    >
                      <span className="rounded-full flex-shrink-0" style={{ width: '5px', height: '5px', background: cfg.dot }} />
                      {cfg.label}
                    </motion.span>
                  </div>

                  {/* Arrow */}
                  <motion.div
                    className="flex items-center justify-center"
                    style={{ color: 'var(--border)', transition: 'color 0.12s ease' }}
                    whileHover={{ color: 'var(--text-secondary)', x: 2 }}
                  >
                    <ChevronRight size={14} />
                  </motion.div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
