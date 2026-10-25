import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CreditCard, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate } from '../lib/utils'
import { dataLocalISO } from '../lib/periodo'
import { usePermissoes } from '../hooks/usePermissoes'
import { useSelecao } from '../hooks/useSelecao'
import Checkbox from '../components/ui/Checkbox'
import StatCard from '../components/ui/StatCard'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import VendaDetalheModal from '../components/VendaDetalheModal'

interface Recebivel {
  id: string
  comanda_id: string | null
  maquininha_id: string | null
  forma: 'credito' | 'debito'
  numero_parcela: number
  total_parcelas: number
  valor_bruto: number
  taxa: number
  valor_liquido: number
  data_venda: string
  data_prevista: string
  status: 'previsto' | 'recebido'
  recebido_em: string | null
  maquininha?: { nome: string } | null
  comanda?: { cliente_nome: string | null } | null
}

type Filtro = 'aberto' | 'atrasado' | 'recebido' | 'todos'
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'aberto', label: 'A receber' }, { id: 'atrasado', label: 'Atrasados' },
  { id: 'recebido', label: 'Recebidos' }, { id: 'todos', label: 'Todos' },
]
const COLUNAS = '22px 104px minmax(160px, 1fr) minmax(130px, 170px) 92px 80px 100px 110px'

/**
 * O que as maquininhas têm que pagar à loja, parcela a parcela: cada
 * venda no cartão gera os recebíveis com a data prevista. Aqui a loja
 * confere o que caiu na conta e corrige a data quando a maquininha
 * pagar em outro dia. O valor já entrou no financeiro na venda; isto é
 * só o controle (conferência).
 */
export default function Recebiveis() {
  const { podeEditar: podeEditarTela } = usePermissoes()
  const podeEditar = podeEditarTela('financeiro')
  const [lista, setLista] = useState<Recebivel[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [maquininha, setMaquininha] = useState('')
  const [vendaAberta, setVendaAberta] = useState<string | null>(null)
  const hoje = dataLocalISO()

  const carregar = useCallback(() => {
    supabase.from('recebiveis_cartao')
      .select('*, maquininha:maquininhas(nome), comanda:comandas(cliente_nome)')
      .order('data_prevista').order('numero_parcela').limit(2000)
      .then(({ data, error }) => {
        if (error) setErro('Rode o SQL dos recebíveis do cartão no Supabase para usar esta tela.')
        setLista((data ?? []) as Recebivel[])
        setLoading(false)
      })
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const maquininhas = useMemo(() => {
    const m = new Map<string, string>()
    lista.forEach(r => { if (r.maquininha_id) m.set(r.maquininha_id, r.maquininha?.nome ?? 'Maquininha') })
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [lista])

  const daMaquininha = lista.filter(r => !maquininha || r.maquininha_id === maquininha)
  const atrasado = (r: Recebivel) => r.status === 'previsto' && r.data_prevista < hoje
  const passa = (r: Recebivel, f: Filtro) =>
    f === 'todos' ? true : f === 'recebido' ? r.status === 'recebido' : f === 'atrasado' ? atrasado(r) : r.status === 'previsto'
  const filtrados = daMaquininha.filter(r => passa(r, filtro))
  const contagem = Object.fromEntries(FILTROS.map(f => [f.id, daMaquininha.filter(r => passa(r, f.id)).length])) as Record<Filtro, number>

  const em30 = dataLocalISO(new Date(Date.now() + 30 * 86400000))
  const inicioMes = hoje.slice(0, 8) + '01'
  const soma = (rs: Recebivel[]) => rs.reduce((s, r) => s + Number(r.valor_liquido), 0)
  const aReceber = soma(daMaquininha.filter(r => r.status === 'previsto'))
  const proximos = soma(daMaquininha.filter(r => r.status === 'previsto' && r.data_prevista >= hoje && r.data_prevista <= em30))
  const atrasados = soma(daMaquininha.filter(atrasado))
  const recebidoMes = soma(daMaquininha.filter(r => r.status === 'recebido' && (r.recebido_em ?? '') >= inicioMes))

  const selecao = useSelecao(filtrados.map(r => r.id))
  const marcados = filtrados.filter(r => selecao.tem(r.id))

  async function marcar(ids: string[], recebido: boolean) {
    if (!ids.length) return
    setErro('')
    const { error } = await supabase.from('recebiveis_cartao')
      .update(recebido ? { status: 'recebido', recebido_em: hoje } : { status: 'previsto', recebido_em: null })
      .in('id', ids)
    if (error) { setErro(error.message); return }
    selecao.limpar()
    carregar()
  }

  async function mudarData(r: Recebivel, data: string) {
    if (!data || data === r.data_prevista) return
    setLista(prev => prev.map(x => (x.id === r.id ? { ...x, data_prevista: data } : x)))
    const { error } = await supabase.from('recebiveis_cartao').update({ data_prevista: data }).eq('id', r.id)
    if (error) { setErro(error.message); carregar() }
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Recebíveis do cartão</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            O que as maquininhas vão depositar, parcela a parcela. Marque quando cair na conta.
          </p>
        </div>
        {maquininhas.length > 1 && (
          <select className="input" style={{ width: '220px' }} value={maquininha} onChange={e => setMaquininha(e.target.value)} aria-label="Maquininha">
            <option value="">Todas as maquininhas</option>
            {maquininhas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        )}
      </div>

      <div className="stat-grid-auto" style={{ marginBottom: '16px' }}>
        <StatCard rotulo="A receber" icone={CreditCard} valor={formatCurrency(aReceber)} sub="Líquido, já sem a taxa" />
        <StatCard rotulo="Próximos 30 dias" icone={CreditCard} valor={formatCurrency(proximos)} />
        <StatCard rotulo="Atrasados" icone={AlertTriangle} valor={formatCurrency(atrasados)} sub="Passou da data e não foi marcado" />
        <StatCard rotulo="Recebido no mês" icone={Check} valor={formatCurrency(recebidoMes)} />
      </div>

      <div className="barra-filtros">
        <div className="pilulas" role="tablist">
          {FILTROS.map(f => (
            <button key={f.id} role="tab" aria-selected={filtro === f.id} className={`pilula${filtro === f.id ? ' ativa' : ''}`} onClick={() => { setFiltro(f.id); selecao.limpar() }}>
              {f.label}<span className="pilula-contagem">{contagem[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      {erro && <p className="aviso-erro" style={{ marginBottom: '12px' }}>{erro}</p>}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <div className="list-header" style={{
          display: 'grid', minWidth: '900px', gridTemplateColumns: COLUNAS, gap: '12px', alignItems: 'center',
          padding: '10px 20px', borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'var(--header-bg)',
        }}>
          <span className="celula-check">
            <Checkbox label="Selecionar todos" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={filtrados.length === 0} />
          </span>
          <span>Cai em</span><span>Venda</span><span>Maquininha</span>
          <span style={{ textAlign: 'right' }}>Bruto</span><span style={{ textAlign: 'right' }}>Taxa</span>
          <span style={{ textAlign: 'right' }}>Líquido</span><span />
        </div>
        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
            {filtro === 'aberto' ? 'Nada a receber das maquininhas.' : 'Nenhum recebível aqui.'}
          </div>
        ) : filtrados.map((r, i) => (
          <div key={r.id} className={`list-row${selecao.tem(r.id) ? ' selecionada' : ''}`} style={{
            display: 'grid', minWidth: '900px', gridTemplateColumns: COLUNAS, gap: '12px', alignItems: 'center',
            padding: '9px 20px', borderBottom: i < filtrados.length - 1 ? '1px solid var(--c-1f)' : 'none',
          }}>
            <span className="celula-check">
              <Checkbox label={`Selecionar parcela ${r.numero_parcela}`} checked={selecao.tem(r.id)} onChange={m => selecao.alternar(r.id, m)} />
            </span>
            {r.status === 'previsto' && podeEditar ? (
              <input className="input" type="date" value={r.data_prevista} onChange={e => mudarData(r, e.target.value)}
                aria-label="Data prevista" title="Mude se a maquininha depositar em outro dia"
                style={{ padding: '5px 8px', fontSize: '12px', color: atrasado(r) ? '#f59e0b' : undefined }} />
            ) : (
              <span style={{ fontSize: '12px', color: 'var(--c-a3)' }}>{formatDate(r.data_prevista)}</span>
            )}
            <button type="button" className="link-sutil" onClick={() => r.comanda_id && setVendaAberta(r.comanda_id)} style={{ textAlign: 'left', minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: r.comanda_id ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              <span className="texto-cortado" style={{ display: 'block', fontSize: '13px', color: 'var(--c-fff)' }}>{r.comanda?.cliente_nome || 'Balcão'}</span>
              <span className="subtexto">Venda de {formatDate(r.data_venda)}</span>
            </button>
            <span style={{ minWidth: 0 }}>
              <span className="texto-cortado" style={{ display: 'block', fontSize: '12px', color: 'var(--c-a3)' }}>{r.maquininha?.nome ?? 'Sem maquininha'}</span>
              <span className="subtexto">{r.forma === 'debito' ? 'Débito' : r.total_parcelas > 1 ? `Crédito ${r.numero_parcela}/${r.total_parcelas}` : 'Crédito à vista'}</span>
            </span>
            <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-a3)', textAlign: 'right' }}>{formatCurrency(Number(r.valor_bruto))}</span>
            <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-66)', textAlign: 'right' }}>{Number(r.taxa) > 0 ? `− ${formatCurrency(Number(r.taxa))}` : '—'}</span>
            <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', textAlign: 'right' }}>{formatCurrency(Number(r.valor_liquido))}</span>
            {r.status === 'recebido' ? (
              <span style={{ justifySelf: 'end', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span className="badge badge-confirmed" title={r.recebido_em ? `Recebido em ${formatDate(r.recebido_em)}` : undefined}>Recebido</span>
                {podeEditar && (
                  <button type="button" className="btn btn-icon" title="Desfazer" aria-label="Desfazer recebido" onClick={() => marcar([r.id], false)} style={{ width: '26px', height: '26px' }}>
                    <RotateCcw size={11} />
                  </button>
                )}
              </span>
            ) : podeEditar ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => marcar([r.id], true)} style={{ justifySelf: 'end' }}>Recebido</button>
            ) : <span className="badge badge-pending" style={{ justifySelf: 'end' }}>{atrasado(r) ? 'Atrasado' : 'A receber'}</span>}
          </div>
        ))}
      </div>

      <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
        <ItemSelecao rotulo="Líquido" valor={formatCurrency(soma(marcados))} />
        <ItemSelecao rotulo="Bruto" valor={formatCurrency(marcados.reduce((s, r) => s + Number(r.valor_bruto), 0))} />
        {podeEditar && marcados.some(r => r.status === 'previsto') && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => marcar(marcados.filter(r => r.status === 'previsto').map(r => r.id), true)}>
            <Check size={12} /> Marcar como recebido
          </button>
        )}
      </BarraSelecao>

      {vendaAberta && <VendaDetalheModal comandaId={vendaAberta} onClose={() => setVendaAberta(null)} />}
    </div>
  )
}
