import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calendar, Users, DollarSign, TrendingUp, Plus, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import type { Agendamento } from '../types'

const STATUS_LABEL: Record<string, string> = {
  pendente:   'Pendente',
  confirmado: 'Confirmado',
  concluido:  'Concluído',
  cancelado:  'Cancelado',
}

const STATUS_CLASS: Record<string, string> = {
  pendente:   'badge badge-pending',
  confirmado: 'badge badge-confirmed',
  concluido:  'badge badge-done',
  cancelado:  'badge badge-canceled',
}

const MOCK_AGENDA: Agendamento[] = [
  {
    id: '1', cliente_id: 'c1', profissional_id: 'p1', servico_id: 's1',
    data_hora: new Date().toISOString().replace(/T.*/, 'T09:00:00'), status: 'confirmado', created_at: '',
    cliente: { id: 'c1', nome: 'Rafael Mendes', telefone: '(11) 99887-6655', ativo: true, created_at: '' },
    profissional: { id: 'p1', nome: 'João Silva', especialidade: 'Cabelo e Barba', comissao_percentual: 50, ativo: true, created_at: '' },
    servico: { id: 's1', nome: 'Combo Cabelo + Barba', preco: 65, duracao_minutos: 50, ativo: true },
  },
  {
    id: '2', cliente_id: 'c2', profissional_id: 'p2', servico_id: 's2',
    data_hora: new Date().toISOString().replace(/T.*/, 'T10:00:00'), status: 'pendente', created_at: '',
    cliente: { id: 'c2', nome: 'Gustavo Lima', telefone: '(11) 98765-4321', ativo: true, created_at: '' },
    profissional: { id: 'p2', nome: 'Pedro Santos', especialidade: 'Coloração', comissao_percentual: 55, ativo: true, created_at: '' },
    servico: { id: 's2', nome: 'Pigmentação', preco: 80, duracao_minutos: 60, ativo: true },
  },
  {
    id: '3', cliente_id: 'c3', profissional_id: 'p1', servico_id: 's3',
    data_hora: new Date().toISOString().replace(/T.*/, 'T11:30:00'), status: 'concluido', created_at: '',
    cliente: { id: 'c3', nome: 'Bruno Castro', telefone: '(11) 91234-5678', ativo: true, created_at: '' },
    profissional: { id: 'p1', nome: 'João Silva', especialidade: 'Cabelo e Barba', comissao_percentual: 50, ativo: true, created_at: '' },
    servico: { id: 's3', nome: 'Corte de Cabelo', preco: 45, duracao_minutos: 30, ativo: true },
  },
  {
    id: '4', cliente_id: 'c4', profissional_id: 'p3', servico_id: 's4',
    data_hora: new Date().toISOString().replace(/T.*/, 'T14:00:00'), status: 'pendente', created_at: '',
    cliente: { id: 'c4', nome: 'Thiago Rocha', telefone: '(11) 97654-3210', ativo: true, created_at: '' },
    profissional: { id: 'p3', nome: 'Lucas Costa', especialidade: 'Sênior', comissao_percentual: 60, ativo: true, created_at: '' },
    servico: { id: 's4', nome: 'Barba', preco: 30, duracao_minutos: 20, ativo: true },
  },
]

export default function Dashboard() {
  const [agenda, setAgenda] = useState<Agendamento[]>(MOCK_AGENDA)
  const [loading, setLoading] = useState(false)

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const dataStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    supabase
      .from('agendamentos')
      .select('*, cliente:clientes(*), profissional:profissionais(*), servico:servicos(*)')
      .gte('data_hora', `${today}T00:00:00`)
      .lte('data_hora', `${today}T23:59:59`)
      .order('data_hora')
      .then(({ data }) => {
        if (data && data.length > 0) setAgenda(data as Agendamento[])
        setLoading(false)
      })
  }, [])

  const confirmados = agenda.filter(a => a.status === 'confirmado').length
  const concluidos  = agenda.filter(a => a.status === 'concluido').length
  const faturamento = agenda
    .filter(a => a.status === 'concluido')
    .reduce((sum, a) => sum + (a.servico?.preco ?? 0), 0)

  const stats = [
    { label: 'Agendamentos', value: agenda.length, sub: 'hoje', icon: Calendar },
    { label: 'Confirmados',  value: confirmados,   sub: 'aguardando', icon: Users },
    { label: 'Concluídos',   value: concluidos,    sub: 'finalizados', icon: TrendingUp },
    { label: 'Faturamento',  value: formatCurrency(faturamento), sub: 'hoje', icon: DollarSign },
  ]

  return (
    <div className="page">
      {/* Header */}
      <motion.div
        style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '36px' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <p style={{ fontSize: '11px', color: '#444', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
            {dataStr}
          </p>
          <h1 style={{ fontSize: '28px', color: '#FFFFFF', lineHeight: 1.1 }}>{saudacao}</h1>
          <p style={{ fontSize: '14px', color: '#A3A3A3', marginTop: '4px' }}>Resumo do dia.</p>
        </div>

        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Novo Agendamento
        </button>
      </motion.div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {stats.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{
                  width: '36px', height: '36px',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} style={{ color: '#A3A3A3' }} strokeWidth={1.75} />
                </div>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', fontFamily: 'DM Sans, sans-serif' }}>
                {s.value}
              </p>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginTop: '4px' }}>{s.label}</p>
              <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{s.sub}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Agenda do dia */}
      <motion.div
        className="card"
        style={{ padding: 0, overflow: 'hidden' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid #2A2A2A',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={15} style={{ color: '#666' }} strokeWidth={1.75} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Agenda de Hoje</span>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              padding: '2px 8px', borderRadius: '99px',
              background: 'rgba(255,255,255,0.07)', color: '#A3A3A3',
            }}>
              {agenda.length}
            </span>
          </div>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', color: '#555', background: 'none', border: 'none',
            cursor: 'pointer', transition: 'color 0.15s',
          }}>
            Ver agenda <ChevronRight size={12} />
          </button>
        </div>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '70px 1fr 160px 140px',
          padding: '10px 24px',
          borderBottom: '1px solid #222',
          fontSize: '10px',
          fontWeight: 600,
          color: '#444',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>Hora</span>
          <span>Cliente / Serviço</span>
          <span>Profissional</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#555', fontSize: '13px' }}>
            Carregando...
          </div>
        ) : agenda.map((ag, i) => {
          const hora = new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          return (
            <motion.div
              key={ag.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 160px 140px',
                padding: '14px 24px',
                borderBottom: i < agenda.length - 1 ? '1px solid #1F1F1F' : 'none',
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              whileHover={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={11} style={{ color: '#333' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                  {hora}
                </span>
              </div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{ag.cliente?.nome}</p>
                <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>{ag.servico?.nome}</p>
              </div>
              <div style={{ fontSize: '13px', color: '#A3A3A3', display: 'flex', alignItems: 'center' }}>
                {ag.profissional?.nome}
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className={STATUS_CLASS[ag.status] ?? 'badge badge-pending'}>
                  {STATUS_LABEL[ag.status]}
                </span>
              </div>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
