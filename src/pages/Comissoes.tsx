import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Percent, Receipt, Wallet, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateTime } from '../lib/utils'
import { intervaloMes, rotuloIntervalo, type Intervalo } from '../lib/periodo'
import { carregarNomesUsuarios } from '../lib/usuarios'
import { usePermissoes } from '../hooks/usePermissoes'
import { useSelecao } from '../hooks/useSelecao'
import VendaDetalheModal from '../components/VendaDetalheModal'
import FiltroPeriodo from '../components/ui/FiltroPeriodo'
import Checkbox from '../components/ui/Checkbox'
import StatCard from '../components/ui/StatCard'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import type { Comissao } from '../types'

// Quem recebe: profissional do item ou usuário que registrou a venda.
const chavePessoa = (c: Comissao) => c.profissional_id ? `p:${c.profissional_id}` : c.usuario_id ? `u:${c.usuario_id}` : '—'

export default function Comissoes() {
  // Editar Comissões = vê as de todos e pode tirar a comissão de uma
  // venda; sem isso o banco só devolve as comissões do próprio usuário.
  const { podeEditar } = usePermissoes()
  const podeGerenciar = podeEditar('comissoes')
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({})
  const [periodo, setPeriodo] = useState<Intervalo>(() => intervaloMes())
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [vendaAbertaId, setVendaAbertaId] = useState<string | null>(null)

  // As comissões tiradas de uma venda ficam com status "cancelada" e
  // não aparecem aqui (nem nos totais, nem na DRE).
  const carregar = useCallback(() => {
    setLoading(true); setErro('')
    supabase
      .from('comissoes')
      .select('*, profissional:profissionais(nome), comanda:comandas(id, data, cliente_nome, total)')
      .neq('status', 'cancelada')
      .gte('created_at', `${periodo.inicio}T00:00:00`)
      .lte('created_at', `${periodo.fim}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(2000)
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        setComissoes((data ?? []) as Comissao[])
        setLoading(false)
      })
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarNomesUsuarios().then(setNomesUsuarios) }, [])

  function nomeExibicao(c: Comissao): string {
    if (c.profissional?.nome) return c.profissional.nome
    if (c.usuario_id) return nomesUsuarios[c.usuario_id] ?? 'Usuário'
    return '—'
  }

  // Filtro por pessoa: só quem tem comissão no período.
  const pessoas = useMemo(() => {
    const mapa = new Map<string, string>()
    comissoes.forEach(c => { if (!mapa.has(chavePessoa(c))) mapa.set(chavePessoa(c), nomeExibicao(c)) })
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comissoes, nomesUsuarios])

  const filtradas = comissoes.filter(c => !filtroPessoa || chavePessoa(c) === filtroPessoa)
  const totalComissao = filtradas.reduce((s, c) => s + Number(c.valor_comissao), 0)
  const totalBase = filtradas.reduce((s, c) => s + Number(c.valor_base), 0)
  const numVendas = new Set(filtradas.map(c => c.comanda_id).filter(Boolean)).size

  const selecao = useSelecao(filtradas.map(c => c.id))
  const selecionadas = filtradas.filter(c => selecao.tem(c.id))

  async function tirar(c: Comissao) {
    if (!window.confirm(`Tirar a comissão de ${nomeExibicao(c)} (${formatCurrency(Number(c.valor_comissao))}) desta venda?`)) return
    const { error } = await supabase.from('comissoes').update({ status: 'cancelada' }).eq('id', c.id)
    if (error) { window.alert(`Não foi possível tirar a comissão: ${error.message}`); return }
    setComissoes(prev => prev.filter(x => x.id !== c.id))
  }

  const colunas = podeGerenciar
    ? '22px minmax(170px, 1fr) minmax(120px, 190px) 100px 56px 104px 32px'
    : '22px minmax(170px, 1fr) minmax(120px, 190px) 100px 56px 104px'

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Comissões</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            Geradas pelas vendas{podeGerenciar ? '' : ' · somente as suas'}
          </p>
        </div>
      </div>

      <div className="barra-filtros">
        <FiltroPeriodo valor={periodo} onChange={v => v && setPeriodo(v)} alinhar="esquerda" />
        {pessoas.length > 1 && (
          <select className="filtro-select" aria-label="Filtrar por pessoa" value={filtroPessoa} onChange={e => setFiltroPessoa(e.target.value)}>
            <option value="">Todos</option>
            {pessoas.map(([chave, nome]) => <option key={chave} value={chave}>{nome}</option>)}
          </select>
        )}
      </div>

      <div className="stat-grid-auto">
        <StatCard rotulo="Comissões" icone={Percent} valor={formatCurrency(totalComissao)} sub={rotuloIntervalo(periodo)} />
        <StatCard rotulo="Vendas com comissão" icone={Receipt} valor={String(numVendas)} sub={`${filtradas.length} ${filtradas.length === 1 ? 'lançamento' : 'lançamentos'}`} />
        <StatCard rotulo="Base de cálculo" icone={Wallet} valor={formatCurrency(totalBase)} sub="Valor dos itens comissionados" />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', minWidth: '700px', gridTemplateColumns: colunas, gap: '12px', alignItems: 'center',
          padding: '10px 20px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span className="celula-check">
            <Checkbox label="Selecionar todas" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={filtradas.length === 0} />
          </span>
          <span>Quem</span><span>Venda</span>
          <span style={{ textAlign: 'right' }}>Base</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'right' }}>Comissão</span>
          {podeGerenciar && <span />}
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : erro ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#666', fontSize: '13px' }}>{erro}</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma comissão no período.</div>
        ) : filtradas.map((c, i) => (
          <motion.div
            key={c.id}
            className={`list-row${c.comanda_id ? ' clicavel' : ''}${selecao.tem(c.id) ? ' selecionada' : ''}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
            onClick={() => { if (c.comanda_id) setVendaAbertaId(c.comanda_id) }}
            title={c.comanda_id ? 'Ver a venda desta comissão' : undefined}
            style={{
              display: 'grid', minWidth: '700px', gridTemplateColumns: colunas, gap: '12px',
              padding: '12px 20px', alignItems: 'center',
              borderBottom: i < filtradas.length - 1 ? '1px solid #1A1A1A' : 'none',
            }}
          >
            <span className="celula-check">
              <Checkbox label={`Selecionar comissão de ${nomeExibicao(c)}`} checked={selecao.tem(c.id)} onChange={m => selecao.alternar(c.id, m)} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>
                {nomeExibicao(c)}
                {!c.profissional_id && c.usuario_id && <span style={{ fontSize: '11px', color: '#555', fontWeight: 400 }}> · venda</span>}
              </p>
              <p className="subtexto">{formatDateTime(c.created_at)}</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="texto-cortado" style={{ fontSize: '12px', color: '#A3A3A3' }}>{c.comanda?.cliente_nome ?? (c.comanda_id ? 'Balcão' : '—')}</p>
              {c.comanda && <p className="subtexto">Total {formatCurrency(Number(c.comanda.total))}</p>}
            </div>
            <span className="valor-num" style={{ fontSize: '12px', color: '#777', textAlign: 'right' }}><b className="mobile-only-label">Base: </b>{formatCurrency(Number(c.valor_base))}</span>
            <span className="valor-num" style={{ fontSize: '12px', color: '#777', textAlign: 'right' }}><b className="mobile-only-label">Percentual: </b>{Number(c.percentual)}%</span>
            <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', textAlign: 'right' }}><b className="mobile-only-label">Comissão: </b>{formatCurrency(Number(c.valor_comissao))}</span>
            {podeGerenciar && (
              <button
                className="btn btn-icon"
                title="Tirar esta comissão da venda"
                aria-label="Tirar esta comissão da venda"
                onClick={e => { e.stopPropagation(); tirar(c) }}
                style={{ width: '28px', height: '28px', justifySelf: 'end' }}
              >
                <X size={12} />
              </button>
            )}
          </motion.div>
        ))}
      </div>

      <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
        <ItemSelecao rotulo="Comissão" valor={formatCurrency(selecionadas.reduce((s, c) => s + Number(c.valor_comissao), 0))} />
        <ItemSelecao rotulo="Base" valor={formatCurrency(selecionadas.reduce((s, c) => s + Number(c.valor_base), 0))} />
      </BarraSelecao>

      <AnimatePresence>
        {vendaAbertaId && (
          <VendaDetalheModal comandaId={vendaAbertaId} onClose={() => setVendaAbertaId(null)} onAlterado={carregar} />
        )}
      </AnimatePresence>
    </div>
  )
}
