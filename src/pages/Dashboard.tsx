import { useEffect, useState } from 'react'
import { Calendar, Users, DollarSign, TrendingUp, Plus, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Agendamento } from '../types'

const STATUS_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  em_atendimento: 'Em andamento',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

const STATUS_COLOR: Record<string, string> = {
  agendado: 'bg-blue-50 text-blue-700',
  confirmado: 'bg-green-50 text-green-700',
  em_atendimento: 'bg-amber-50 text-amber-700',
  finalizado: 'bg-gray-100 text-gray-600',
  cancelado: 'bg-red-50 text-red-600',
  nao_compareceu: 'bg-orange-50 text-orange-600',
}

export default function Dashboard() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const dataHoje = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function fetchAgendamentos() {
      const { data } = await supabase
        .from('agendamentos')
        .select('*, clientes(*), funcionarios(*), servicos(*)')
        .gte('dtini_ag', `${dataHoje}T00:00:00`)
        .lte('dtini_ag', `${dataHoje}T23:59:59`)
        .order('dtini_ag')
      setAgendamentos(data ?? [])
      setLoading(false)
    }
    fetchAgendamentos()
  }, [])

  const totalHoje = agendamentos.length
  const atendidos = agendamentos.filter(a => a.status_ag === 'finalizado').length
  const emAndamento = agendamentos.filter(a => a.status_ag === 'em_atendimento').length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{hoje}</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card
          icon={<Calendar size={18} className="text-blue-600" />}
          bg="bg-blue-50"
          label="Agendamentos hoje"
          value={String(totalHoje)}
        />
        <Card
          icon={<Users size={18} className="text-green-600" />}
          bg="bg-green-50"
          label="Atendidos hoje"
          value={String(atendidos)}
        />
        <Card
          icon={<TrendingUp size={18} className="text-amber-600" />}
          bg="bg-amber-50"
          label="Em andamento"
          value={String(emAndamento)}
        />
        <Card
          icon={<DollarSign size={18} className="text-purple-600" />}
          bg="bg-purple-50"
          label="Caixa atual"
          value="—"
        />
      </div>

      {/* Agenda rápida */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Agenda de hoje</h2>
          <button className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition">
            <Plus size={13} />
            Novo agendamento
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : agendamentos.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <AlertCircle size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nenhum agendamento para hoje</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-2.5 font-medium">Horário</th>
                <th className="text-left px-5 py-2.5 font-medium">Cliente</th>
                <th className="text-left px-5 py-2.5 font-medium">Serviço</th>
                <th className="text-left px-5 py-2.5 font-medium">Barbeiro</th>
                <th className="text-left px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {agendamentos.map(ag => (
                <tr key={ag.id_ag} className="border-b border-gray-50 hover:bg-gray-50 transition">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900">
                    {new Date(ag.dtini_ag).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-700">{ag.clientes?.nome_cl ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{ag.servicos?.nome_sv ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{ag.funcionarios?.nome_fu ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOR[ag.status_ag] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_LABEL[ag.status_ag] ?? ag.status_ag}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Card({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
