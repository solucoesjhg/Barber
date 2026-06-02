import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Users, TrendingUp, DollarSign, Plus, ChevronRight, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Agendamento } from '../types'
import { stagger, staggerItem } from '../lib/motion'

const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  agendado:       { label: 'Agendado',     dot: '#60a5fa', text: '#2563eb', bg: '#eff6ff' },
  confirmado:     { label: 'Confirmado',   dot: '#34d399', text: '#059669', bg: '#ecfdf5' },
  em_atendimento: { label: 'Em andamento', dot: '#fbbf24', text: '#d97706', bg: '#fffbeb' },
  finalizado:     { label: 'Finalizado',   dot: '#9ca3af', text: '#6b7280', bg: '#f9fafb' },
  cancelado:      { label: 'Cancelado',    dot: '#f87171', text: '#dc2626', bg: '#fef2f2' },
  nao_compareceu: { label: 'Não veio',     dot: '#fb923c', text: '#ea580c', bg: '#fff7ed' },
}

export default function Dashboard() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const dataHoje = new Date().toISOString().split('T')[0]

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const dataFormatada = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => {
    async function fetch() {
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
    fetch()
  }, [dataHoje])

  const total = agendamentos.length
  const atendidos = agendamentos.filter(a => a.status_ag === 'finalizado').length
  const emAndamento = agendamentos.filter(a => a.status_ag === 'em_atendimento').length
  const proximos = agendamentos.filter(a => ['agendado', 'confirmado'].includes(a.status_ag)).length

  const cards = [
    { icon: Calendar,    bg: '#eff6ff', color: '#3b82f6', label: 'Agendamentos', value: String(total),       sub: 'hoje' },
    { icon: Users,       bg: '#ecfdf5', color: '#10b981', label: 'Atendidos',    value: String(atendidos),   sub: 'finalizados' },
    { icon: TrendingUp,  bg: '#fffbeb', color: '#f59e0b', label: 'Em andamento', value: String(emAndamento), sub: `${proximos} aguardando` },
    { icon: DollarSign,  bg: '#f5f3ff', color: '#8b5cf6', label: 'Faturamento',  value: '—',                 sub: 'caixa não aberto' },
  ]

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">

      {/* Header */}
      <motion.div
        className="flex items-start justify-between mb-8"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.15em] mb-1 capitalize">{dataFormatada}</p>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-[-0.02em]">{saudacao}</h1>
        </div>
        <motion.button
          className="flex items-center gap-2 bg-black text-white text-[13px] font-semibold px-4 py-2.5 rounded-xl shadow-sm"
          whileHover={{ scale: 1.02, backgroundColor: '#1a1a1a' }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.15 }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Novo agendamento
        </motion.button>
      </motion.div>

      {/* Cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        {cards.map(({ icon: Icon, bg, color, label, value, sub }) => (
          <motion.div
            key={label}
            variants={staggerItem}
            className="bg-white rounded-2xl border border-gray-100 p-5 cursor-pointer"
            whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.07)' }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="w-8 h-8 rounded-xl flex items-center justify-center mb-4"
              style={{ backgroundColor: bg }}
              whileHover={{ scale: 1.08 }}
            >
              <Icon size={16} style={{ color }} strokeWidth={2} />
            </motion.div>
            <motion.p
              className="text-[26px] font-semibold text-gray-900 tracking-tight leading-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            >
              {value}
            </motion.p>
            <p className="text-[12px] font-medium text-gray-500 mt-1.5">{label}</p>
            <p className="text-[11px] text-gray-300 mt-0.5">{sub}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Tabela de agenda */}
      <motion.div
        className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)' }}
      >
        {/* Header tabela */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div className="flex items-center gap-3">
            <h2 className="text-[13px] font-semibold text-gray-900">Agenda de hoje</h2>
            {total > 0 && (
              <motion.span
                className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold tabular-nums"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.4 }}
              >
                {total}
              </motion.span>
            )}
          </div>
          <motion.button
            className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-700 transition-colors font-medium"
            whileHover={{ x: 2 }}
          >
            Ver tudo <ChevronRight size={12} />
          </motion.button>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="px-6 py-12 flex items-center justify-center gap-3">
            <motion.div
              className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
            <span className="text-[13px] text-gray-400">Carregando...</span>
          </div>
        ) : agendamentos.length === 0 ? (
          <motion.div
            className="px-6 py-14 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <Calendar size={20} className="text-gray-300" />
            </motion.div>
            <p className="text-[13px] font-medium text-gray-500">Nenhum agendamento hoje</p>
            <p className="text-[12px] text-gray-300 mt-1">Clique em "Novo agendamento" para começar</p>
          </motion.div>
        ) : (
          <motion.div
            className="divide-y divide-gray-50"
            variants={stagger}
            initial="initial"
            animate="animate"
          >
            {agendamentos.map(ag => {
              const cfg = STATUS_CONFIG[ag.status_ag] ?? STATUS_CONFIG.agendado
              const hora = new Date(ag.dtini_ag).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

              return (
                <motion.div
                  key={ag.id_ag}
                  variants={staggerItem}
                  className="flex items-center gap-4 px-6 py-3.5 group cursor-pointer"
                  whileHover={{ backgroundColor: 'rgba(249,250,251,0.8)' }}
                  transition={{ duration: 0.12 }}
                >
                  <div className="flex items-center gap-1.5 w-14 flex-shrink-0">
                    <Clock size={11} className="text-gray-300" />
                    <span className="text-[13px] font-semibold text-gray-900 tabular-nums">{hora}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{ag.clientes?.nome_cl ?? '—'}</p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{ag.servicos?.nome_sv ?? '—'}</p>
                  </div>

                  <div className="hidden sm:block text-[12px] text-gray-400 w-28 truncate font-medium">
                    {ag.funcionarios?.nome_fu ?? '—'}
                  </div>

                  <motion.span
                    className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                    style={{ color: cfg.text, backgroundColor: cfg.bg }}
                    whileHover={{ scale: 1.03 }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
                    {cfg.label}
                  </motion.span>

                  <motion.div
                    className="text-gray-200 group-hover:text-gray-400 transition-colors"
                    whileHover={{ x: 2 }}
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
