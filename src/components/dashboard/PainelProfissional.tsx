import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Wallet, Percent, HandCoins, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import { dataLocalISO, intervaloMes } from '../../lib/periodo'
import StatCard from '../ui/StatCard'
import type { Agendamento } from '../../types'

interface Resumo {
  agenda: Agendamento[]
  faturadoMes: number
  atendimentosMes: number
  comissaoAberta: number
  valesAbertos: number
}

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', em_atendimento: 'Em atendimento',
  concluido: 'Concluído', cancelado: 'Cancelado', nao_compareceu: 'Não veio',
}

/**
 * "Seu painel" para o usuário vinculado a um profissional: a agenda dele
 * de hoje, quanto faturou no mês, a comissão que ainda vai receber e os
 * vales em aberto (que serão descontados no fechamento).
 */
export default function PainelProfissional({ profissionalId }: { profissionalId: string }) {
  const navigate = useNavigate()
  const [r, setR] = useState<Resumo | null>(null)

  useEffect(() => {
    let ativo = true
    const hoje = dataLocalISO()
    const mes = intervaloMes()
    Promise.all([
      supabase.from('agendamentos').select('*, cliente:clientes(nome), servico:servicos(nome, duracao_minutos)')
        .eq('profissional_id', profissionalId)
        .gte('data_hora', new Date(`${hoje}T00:00:00`).toISOString()).lte('data_hora', new Date(`${hoje}T23:59:59`).toISOString())
        .order('data_hora'),
      supabase.from('itens_comanda').select('preco_unitario, quantidade, comanda_id, comanda:comandas!inner(status, data, total, desconto)')
        .eq('profissional_id', profissionalId).eq('comanda.status', 'fechada')
        .gte('comanda.data', mes.inicio).lte('comanda.data', mes.fim),
      supabase.from('comissoes').select('valor_comissao')
        .eq('profissional_id', profissionalId).in('status', ['pendente', 'aprovada']).is('fechamento_id', null),
      supabase.from('vales_profissional').select('valor').eq('profissional_id', profissionalId).eq('status', 'aberto'),
    ]).then(([{ data: ag }, { data: itens }, { data: com }, { data: vales }]) => {
      if (!ativo) return
      const linhas = (itens ?? []) as unknown as { preco_unitario: number; quantidade: number; comanda_id: string; comanda: { total: number; desconto?: number } }[]
      const faturado = linhas.reduce((s, i) => {
        const t = Number(i.comanda?.total ?? 0), d = Number(i.comanda?.desconto ?? 0)
        return s + Number(i.preco_unitario) * i.quantidade * (d > 0 && t + d > 0 ? t / (t + d) : 1)
      }, 0)
      setR({
        agenda: (ag ?? []) as Agendamento[],
        faturadoMes: faturado,
        atendimentosMes: new Set(linhas.map(i => i.comanda_id)).size,
        comissaoAberta: ((com ?? []) as { valor_comissao: number }[]).reduce((s, c) => s + Number(c.valor_comissao), 0),
        valesAbertos: ((vales ?? []) as { valor: number }[]).reduce((s, v) => s + Number(v.valor), 0),
      })
    })
    return () => { ativo = false }
  }, [profissionalId])

  if (!r) return null
  const proximos = r.agenda.filter(a => a.status !== 'cancelado' && a.status !== 'nao_compareceu')
  const aReceber = Math.max(r.comissaoAberta - r.valesAbertos, 0)

  return (
    <div className="painel-profissional">
      <p className="label" style={{ marginBottom: '10px' }}>Seu painel</p>
      <div className="stat-grid-auto" style={{ marginBottom: '14px' }}>
        <StatCard rotulo="Seus atendimentos hoje" icone={Calendar} valor={String(proximos.length)} sub={proximos[0] ? `Próximo às ${new Date(proximos[0].data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Agenda livre'} />
        <StatCard rotulo="Você faturou no mês" icone={Wallet} valor={formatCurrency(r.faturadoMes)} sub={`${r.atendimentosMes} ${r.atendimentosMes === 1 ? 'venda' : 'vendas'}`} />
        <StatCard rotulo="Comissão a receber" icone={Percent} valor={formatCurrency(aReceber)} sub={r.valesAbertos > 0 ? `${formatCurrency(r.comissaoAberta)} − vales ${formatCurrency(r.valesAbertos)}` : 'Ainda não fechada'} />
        <StatCard rotulo="Vales em aberto" icone={HandCoins} valor={formatCurrency(r.valesAbertos)} sub="Descontados no fechamento" />
      </div>
      {proximos.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '28px' }}>
          {proximos.slice(0, 8).map((a, i) => (
            <button key={a.id} type="button" className="painel-prof-linha" onClick={() => navigate('/agenda')} style={{ borderBottom: i < Math.min(proximos.length, 8) - 1 ? '1px solid var(--c-1a)' : 'none' }}>
              <strong className="valor-num">{new Date(a.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
              <span className="texto-cortado">{a.cliente?.nome ?? 'Sem cliente'}{a.servico ? ` · ${a.servico.nome}` : ''}</span>
              <span className="subtexto">{STATUS_LABEL[a.status] ?? a.status}</span>
              <ChevronRight size={13} style={{ color: 'var(--c-44)' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
