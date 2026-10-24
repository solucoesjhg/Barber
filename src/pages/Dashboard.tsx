import { useEffect, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, Users, DollarSign, TrendingUp, TrendingDown, Wallet, Plus, Clock, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { usePermissoes } from '../hooks/usePermissoes'
import type { Agendamento, CardDashboardId, TelaId } from '../types'

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

interface RankItem { nome: string; total: number }

function handleGlowMove(e: MouseEvent<HTMLDivElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`)
  e.currentTarget.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { podeVer, podeEditar, podeVerCard } = usePermissoes()
  const [agenda, setAgenda] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)
  const [financeiro, setFinanceiro] = useState({ faturamentoMes: 0, despesasMes: 0, aReceber: 0, aPagar: 0, saldoCaixa: 0, caixaAberto: false })
  const [topServicos, setTopServicos] = useState<RankItem[]>([])
  const [topProfissionais, setTopProfissionais] = useState<RankItem[]>([])

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
        setAgenda((data ?? []) as Agendamento[])
        setLoading(false)
      })

    const primeiroDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

    // Transferência entre contas não é faturamento nem despesa.
    supabase.from('movimentos_caixa').select('tipo, valor').gte('data', primeiroDiaMes).neq('categoria', 'transferencia')
      .then(({ data }) => {
        const rows = (data ?? []) as { tipo: string; valor: number }[]
        const faturamentoMes = rows.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.valor, 0)
        const despesasMes = rows.filter(r => r.tipo === 'saida').reduce((s, r) => s + r.valor, 0)
        setFinanceiro(f => ({ ...f, faturamentoMes, despesasMes }))
      })

    supabase.from('contas_receber').select('valor, valor_pago').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const total = ((data ?? []) as { valor: number; valor_pago: number }[]).reduce((s, c) => s + (c.valor - c.valor_pago), 0)
        setFinanceiro(f => ({ ...f, aReceber: total }))
      })
    supabase.from('contas_pagar').select('valor, valor_pago').in('status', ['aberta', 'parcial'])
      .then(({ data }) => {
        const total = ((data ?? []) as { valor: number; valor_pago: number }[]).reduce((s, c) => s + (c.valor - c.valor_pago), 0)
        setFinanceiro(f => ({ ...f, aPagar: total }))
      })

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('sessoes_caixa').select('*').eq('status', 'aberto').order('aberto_em').limit(1).maybeSingle()
        .then(async ({ data: sessao }) => {
          if (!sessao) { setFinanceiro(f => ({ ...f, caixaAberto: false })); return }
          const { data: movs } = await supabase.from('movimentos_caixa').select('tipo, valor').eq('sessao_caixa_id', sessao.id)
          const rows = (movs ?? []) as { tipo: string; valor: number }[]
          const saldo = sessao.valor_inicial
            + rows.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.valor, 0)
            - rows.filter(r => r.tipo === 'saida').reduce((s, r) => s + r.valor, 0)
          setFinanceiro(f => ({ ...f, saldoCaixa: saldo, caixaAberto: true }))
        })
    })

    // Banco sem a coluna de desconto: busca sem ela.
    supabase
      .from('itens_comanda')
      .select('tipo, nome, preco_unitario, quantidade, profissional:profissionais(nome), comanda:comandas(data, status, total, desconto)')
      .then(async res => res.error
        ? supabase.from('itens_comanda').select('tipo, nome, preco_unitario, quantidade, profissional:profissionais(nome), comanda:comandas(data, status)')
        : res)
      .then(({ data }) => {
        const rows = ((data ?? []) as any[]).filter(i => i.comanda?.status === 'fechada' && i.comanda?.data >= primeiroDiaMes)

        const servicos: Record<string, number> = {}
        const profissionaisMap: Record<string, number> = {}
        rows.forEach(i => {
          // Com desconto na venda, o item entra proporcional ao cobrado.
          const tv = Number(i.comanda?.total ?? 0), dv = Number(i.comanda?.desconto ?? 0)
          const valor = i.preco_unitario * i.quantidade * (dv > 0 && tv + dv > 0 ? tv / (tv + dv) : 1)
          if (i.tipo === 'servico') servicos[i.nome] = (servicos[i.nome] ?? 0) + valor
          if (i.profissional?.nome) profissionaisMap[i.profissional.nome] = (profissionaisMap[i.profissional.nome] ?? 0) + valor
        })
        setTopServicos(Object.entries(servicos).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total).slice(0, 5))
        setTopProfissionais(Object.entries(profissionaisMap).map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total).slice(0, 5))
      })
  }, [])

  const confirmados = agenda.filter(a => a.status === 'confirmado').length
  const concluidos  = agenda.filter(a => a.status === 'concluido').length
  const cancelados  = agenda.filter(a => a.status === 'cancelado' || a.status === 'nao_compareceu').length
  const faturamentoHoje = agenda
    .filter(a => a.status === 'concluido')
    .reduce((sum, a) => sum + (a.valor ?? a.servico?.preco ?? 0), 0)

  // Cada usuário vê só os cards liberados em Usuários → Permissões → Dashboard.
  const stats = ([
    { card: 'agendamentos_hoje', label: 'Agendamentos', value: agenda.length, sub: 'hoje', icon: Calendar, to: '/agenda' },
    { card: 'confirmados',       label: 'Confirmados',  value: confirmados,   sub: 'aguardando', icon: Users, to: '/agenda' },
    { card: 'concluidos',        label: 'Concluídos',   value: concluidos,    sub: 'finalizados', icon: TrendingUp, to: '/agenda' },
    { card: 'cancelamentos',     label: 'Cancelamentos', value: cancelados,   sub: 'hoje', icon: TrendingDown, to: '/agenda' },
    { card: 'faturamento_hoje',  label: 'Faturamento',  value: formatCurrency(faturamentoHoje), sub: 'hoje', icon: DollarSign, to: '/relatorios' },
  ] satisfies { card: CardDashboardId; [k: string]: unknown }[]).filter(s => podeVerCard(s.card))

  // Cada card só aparece pra quem pode ver a tela de onde vem o número
  // (o banco também não devolve o dado sem essa permissão).
  const statsFinanceiro = ([
    { card: 'faturamento_mes', label: 'Faturamento (mês)', value: formatCurrency(financeiro.faturamentoMes), icon: TrendingUp, to: '/relatorios', tela: 'financeiro' },
    { card: 'despesas_mes', label: 'Despesas (mês)', value: formatCurrency(financeiro.despesasMes),    icon: TrendingDown, to: '/financeiro', tela: 'financeiro' },
    { card: 'lucro_estimado', label: 'Lucro estimado', value: formatCurrency(financeiro.faturamentoMes - financeiro.despesasMes), icon: DollarSign, to: '/dre', tela: 'financeiro' },
    { card: 'a_receber', label: 'A Receber', value: formatCurrency(financeiro.aReceber), icon: TrendingUp, to: '/contas-receber', tela: 'contas_receber' },
    { card: 'a_pagar', label: 'A Pagar', value: formatCurrency(financeiro.aPagar),   icon: TrendingDown, to: '/contas-pagar', tela: 'contas_pagar' },
    { card: 'saldo_caixa', label: 'Saldo de Caixa', value: financeiro.caixaAberto ? formatCurrency(financeiro.saldoCaixa) : 'Fechado', icon: Wallet, to: '/caixa', tela: 'caixa' },
  ] satisfies { card: CardDashboardId; tela: TelaId; [k: string]: unknown }[]).filter(s => podeVerCard(s.card) && podeVer(s.tela))

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
          <p style={{ fontSize: '11px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
            {dataStr}
          </p>
          <h1 style={{ fontSize: '28px', color: 'var(--c-fff)', lineHeight: 1.1 }}>{saudacao}</h1>
          <p style={{ fontSize: '14px', color: 'var(--c-a3)', marginTop: '4px' }}>Resumo do dia.</p>
        </div>

        {podeEditar('agenda') && (
          <button className="btn btn-primary" onClick={() => navigate('/agenda')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Agendamento
          </button>
        )}
      </motion.div>

      {/* Stat cards */}
      {stats.length > 0 && <div className="dashboard-stats-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: '16px', marginBottom: '28px' }}>
        {stats.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card glow-card"
              onMouseMove={handleGlowMove}
              onClick={() => navigate(s.to)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div style={{
                  width: '36px', height: '36px',
                  background: 'rgba(var(--ink),0.06)',
                  borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={16} style={{ color: 'var(--c-a3)' }} strokeWidth={1.75} />
                </div>
              </div>
              <p style={{ fontSize: '26px', fontWeight: 700, color: 'var(--c-fff)', letterSpacing: '-0.02em', fontFamily: 'DM Sans, sans-serif' }}>
                {s.value}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--c-a3)', marginTop: '4px' }}>{s.label}</p>
              <p style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '2px' }}>{s.sub}</p>
            </motion.div>
          )
        })}
      </div>}

      {/* Financeiro do mês */}
      {statsFinanceiro.length > 0 && <div className="dashboard-fin-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${statsFinanceiro.length}, minmax(0, 1fr))`, gap: '16px', marginBottom: '28px' }}>
        {statsFinanceiro.map((s, i) => {
          const Icon = s.icon
          return (
            <motion.div
              key={s.label}
              className="card glow-card"
              onMouseMove={handleGlowMove}
              onClick={() => navigate(s.to)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.3 }}
            >
              <Icon size={14} style={{ color: 'var(--c-55)', marginBottom: '10px' }} strokeWidth={1.75} />
              <p style={{ fontSize: '18px', fontWeight: 700, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif' }}>{s.value}</p>
              <p style={{ fontSize: '11px', color: 'var(--c-66)', marginTop: '4px' }}>{s.label}</p>
            </motion.div>
          )
        })}
      </div>}

      {/* Rankings do mês */}
      {(podeVerCard('top_servicos') || podeVerCard('top_profissionais')) && <div className="dashboard-rankings-grid" style={{ display: 'grid', gridTemplateColumns: podeVerCard('top_servicos') && podeVerCard('top_profissionais') ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {podeVerCard('top_servicos') && <div className="card">
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '14px' }}>Serviços mais vendidos (mês)</p>
          {topServicos.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--c-44)' }}>Sem vendas no mês.</p>
          ) : topServicos.map(s => (
            <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--c-1a)' }}>
              <span style={{ fontSize: '13px', color: 'var(--c-a3)' }}>{s.nome}</span>
              <span style={{ fontSize: '13px', color: 'var(--c-fff)', fontWeight: 600 }}>{formatCurrency(s.total)}</span>
            </div>
          ))}
        </div>}
        {podeVerCard('top_profissionais') && <div className="card">
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '14px' }}>Profissionais — faturamento (mês)</p>
          {topProfissionais.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--c-44)' }}>Sem vendas no mês.</p>
          ) : topProfissionais.map(p => (
            <div key={p.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--c-1a)' }}>
              <span style={{ fontSize: '13px', color: 'var(--c-a3)' }}>{p.nome}</span>
              <span style={{ fontSize: '13px', color: 'var(--c-fff)', fontWeight: 600 }}>{formatCurrency(p.total)}</span>
            </div>
          ))}
        </div>}
      </div>}

      {/* Agenda do dia */}
      {podeVerCard('agenda_hoje') && <motion.div
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
          borderBottom: '1px solid var(--c-2a)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={15} style={{ color: 'var(--c-66)' }} strokeWidth={1.75} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)' }}>Agenda de Hoje</span>
            <span style={{
              fontSize: '11px', fontWeight: 600,
              padding: '2px 8px', borderRadius: '99px',
              background: 'rgba(var(--ink),0.07)', color: 'var(--c-a3)',
            }}>
              {agenda.length}
            </span>
          </div>
          <button style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', color: 'var(--c-55)', background: 'none', border: 'none',
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
          borderBottom: '1px solid var(--c-22)',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--c-44)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          background: 'var(--header-bg)',
        }}>
          <span>Hora</span>
          <span>Cliente / Serviço</span>
          <span>Profissional</span>
          <span>Status</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--c-55)', fontSize: '13px' }}>
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
                borderBottom: i < agenda.length - 1 ? '1px solid var(--c-1f)' : 'none',
                cursor: 'pointer',
                transition: 'background 0.12s ease',
              }}
              whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={11} style={{ color: 'var(--c-33)' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--c-fff)', fontVariantNumeric: 'tabular-nums' }}>
                  {hora}
                </span>
              </div>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{ag.cliente?.nome}</p>
                <p style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '2px' }}>{ag.servico?.nome}</p>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--c-a3)', display: 'flex', alignItems: 'center' }}>
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
      </motion.div>}
    </div>
  )
}
