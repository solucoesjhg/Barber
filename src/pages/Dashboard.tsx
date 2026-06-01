import { useEffect, useState } from 'react'
import { Calendar, Users, TrendingUp, DollarSign, Plus, ChevronRight, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Agendamento } from '../types'

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  agendado:        { label: 'Agendado',      className: 'bg-blue-50 text-blue-600',   dot: 'bg-blue-400' },
  confirmado:      { label: 'Confirmado',    className: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-400' },
  em_atendimento:  { label: 'Em andamento',  className: 'bg-amber-50 text-amber-600', dot: 'bg-amber-400' },
  finalizado:      { label: 'Finalizado',    className: 'bg-gray-100 text-gray-500',  dot: 'bg-gray-300' },
  cancelado:       { label: 'Cancelado',     className: 'bg-red-50 text-red-500',     dot: 'bg-red-400' },
  nao_compareceu:  { label: 'Não veio',      className: 'bg-orange-50 text-orange-500', dot: 'bg-orange-400' },
}

export default function Dashboard() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const dataHoje = new Date().toISOString().split('T')[0]

  const saudacao = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  const dataFormatada = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  })

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

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1 capitalize">{dataFormatada}</p>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{saudacao}</h1>
        </div>
        <button className="flex items-center gap-2 bg-black text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-900 active:scale-[0.97] transition-all shadow-sm">
          <Plus size={15} />
          Novo agendamento
        </button>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={<Calendar size={16} />}
          iconBg="bg-blue-50 text-blue-500"
          label="Agendamentos"
          value={String(total)}
          sub="hoje"
        />
        <MetricCard
          icon={<Users size={16} />}
          iconBg="bg-emerald-50 text-emerald-500"
          label="Atendidos"
          value={String(atendidos)}
          sub="finalizados"
        />
        <MetricCard
          icon={<TrendingUp size={16} />}
          iconBg="bg-amber-50 text-amber-500"
          label="Em andamento"
          value={String(emAndamento)}
          sub={`${proximos} aguardando`}
        />
        <MetricCard
          icon={<DollarSign size={16} />}
          iconBg="bg-violet-50 text-violet-500"
          label="Faturamento"
          value="—"
          sub="caixa não aberto"
        />
      </div>

      {/* Agenda do dia */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-gray-900">Agenda de hoje</h2>
            {total > 0 && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{total}</span>
            )}
          </div>
          <button className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 transition font-medium">
            Ver agenda completa <ChevronRight size={12} />
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Carregando...</span>
          </div>
        ) : agendamentos.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Calendar size={20} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Nenhum agendamento hoje</p>
            <p className="text-xs text-gray-400 mt-1">Clique em "Novo agendamento" para começar</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {agendamentos.map(ag => {
              const cfg = STATUS_CONFIG[ag.status_ag] ?? STATUS_CONFIG.agendado
              const hora = new Date(ag.dtini_ag).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={ag.id_ag} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/70 transition group cursor-pointer">
                  <div className="flex items-center gap-1.5 w-14 flex-shrink-0">
                    <Clock size={12} className="text-gray-300" />
                    <span className="text-sm font-semibold text-gray-900 tabular-nums">{hora}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{ag.clientes?.nome_cl ?? '—'}</p>
                    <p className="text-xs text-gray-400 truncate">{ag.servicos?.nome_sv ?? '—'}</p>
                  </div>

                  <div className="hidden sm:block text-xs text-gray-400 w-28 truncate">
                    {ag.funcionarios?.nome_fu ?? '—'}
                  </div>

                  <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${cfg.className}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                    {cfg.label}
                  </span>

                  <ChevronRight size={14} className="text-gray-200 group-hover:text-gray-400 transition flex-shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; sub: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-4 ${iconBg}`}>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-gray-900 tracking-tight">{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
      <p className="text-xs text-gray-300 mt-0.5">{sub}</p>
    </div>
  )
}
