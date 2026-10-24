import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Percent, Receipt, Wallet, X, HandCoins, ClipboardCheck, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { rotuloPagamento } from '../lib/taxas'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import { intervaloMes, rotuloIntervalo, type Intervalo } from '../lib/periodo'
import { carregarNomesUsuarios } from '../lib/usuarios'
import { usePermissoes } from '../hooks/usePermissoes'
import { useSelecao } from '../hooks/useSelecao'
import VendaDetalheModal from '../components/VendaDetalheModal'
import FiltroPeriodo from '../components/ui/FiltroPeriodo'
import Checkbox from '../components/ui/Checkbox'
import StatCard from '../components/ui/StatCard'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import ValeModal from '../components/comissoes/ValeModal'
import FecharComissaoModal from '../components/comissoes/FecharComissaoModal'
import HoleriteModal from '../components/comissoes/HoleriteModal'
import type { Comissao, FechamentoComissao, ValeProfissional } from '../types'

type Aba = 'comissoes' | 'fechamentos' | 'vales'

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
  const [aba, setAba] = useState<Aba>('comissoes')
  const [profissionais, setProfissionais] = useState<{ id: string; nome: string }[]>([])
  const [fechamentos, setFechamentos] = useState<FechamentoComissao[]>([])
  const [vales, setVales] = useState<ValeProfissional[]>([])
  const [modal, setModal] = useState<null | 'vale' | 'fechar'>(null)
  const [holeriteId, setHoleriteId] = useState<string | null>(null)

  // Fechamentos e vales (sem a migração 20261102000001 as tabelas não
  // existem: as abas ficam vazias).
  const carregarFechamentos = useCallback(() => {
    supabase.from('fechamentos_comissao').select('*, profissional:profissionais(nome)').order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setFechamentos((data ?? []) as FechamentoComissao[]))
    supabase.from('vales_profissional').select('*, profissional:profissionais(nome)').order('data', { ascending: false }).limit(300)
      .then(({ data }) => setVales((data ?? []) as ValeProfissional[]))
  }, [])
  useEffect(() => { carregarFechamentos() }, [carregarFechamentos])
  useEffect(() => {
    supabase.from('profissionais').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setProfissionais((data ?? []) as { id: string; nome: string }[]))
  }, [])

  const valesAbertos = vales.filter(v => v.status === 'aberto')

  async function excluirVale(v: ValeProfissional) {
    if (!window.confirm(`Excluir o vale de ${formatCurrency(Number(v.valor))} de ${v.profissional?.nome ?? 'profissional'}? O lançamento sai do financeiro.`)) return
    const { error } = await supabase.rpc('excluir_vale', { p_vale_id: v.id })
    if (error) { window.alert(error.message); return }
    carregarFechamentos()
  }

  // As comissões tiradas de uma venda ficam com status "cancelada" e
  // não aparecem aqui (nem nos totais, nem na DRE).
  const carregar = useCallback(() => {
    setLoading(true); setErro('')
    supabase
      .from('comissoes')
      .select('*, profissional:profissionais(nome), comanda:comandas(id, data, cliente_nome, total, forma_pagamento, parcelas)')
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
    if (c.fechamento_id) { window.alert('Esta comissão já foi paga num fechamento. Estorne o fechamento antes.'); return }
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
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Comissões</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            Geradas pelas vendas{podeGerenciar ? '' : ' · somente as suas'}
          </p>
        </div>
        {podeGerenciar && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setModal('vale')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HandCoins size={14} /> Lançar vale
            </button>
            <button className="btn btn-primary" onClick={() => setModal('fechar')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClipboardCheck size={14} /> Fechar comissão
            </button>
          </div>
        )}
      </div>

      <div className="perm-abas" role="tablist" style={{ marginBottom: '16px' }}>
        {([['comissoes', 'Comissões', undefined], ['fechamentos', 'Fechamentos', fechamentos.length], ['vales', 'Vales em aberto', valesAbertos.length]] as [Aba, string, number | undefined][]).map(([id, rotulo, n]) => (
          <button key={id} role="tab" aria-selected={aba === id} className={`perm-aba${aba === id ? ' ativa' : ''}`} onClick={() => setAba(id)}>
            <span>{rotulo}</span>{n !== undefined && <span className="perm-aba-contagem">{n}</span>}
          </button>
        ))}
      </div>

      {aba === 'fechamentos' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {fechamentos.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Nenhum fechamento ainda. Use “Fechar comissão”.</div>
          ) : fechamentos.map((f, i) => (
            <div key={f.id} className="list-row clicavel" onClick={() => setHoleriteId(f.id)} style={{
              display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) 120px 120px 130px', gap: '12px', minWidth: '560px',
              padding: '12px 20px', alignItems: 'center', borderBottom: i < fechamentos.length - 1 ? '1px solid var(--c-1a)' : 'none',
            }}>
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{f.profissional?.nome ?? '—'}</p>
                <p className="subtexto">{formatDate(f.inicio)} a {formatDate(f.fim)} · fechado em {formatDate(f.created_at.slice(0, 10))}</p>
              </div>
              <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-a3)', textAlign: 'right' }}>comissões {formatCurrency(Number(f.total_comissoes))}</span>
              <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-77)', textAlign: 'right' }}>{Number(f.total_vales) > 0 ? `vales − ${formatCurrency(Number(f.total_vales))}` : 'sem vales'}</span>
              <span className="valor-num" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--c-fff)', textAlign: 'right' }}>{formatCurrency(Number(f.valor_pago))}</span>
            </div>
          ))}
        </div>
      )}

      {aba === 'vales' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {valesAbertos.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Nenhum vale em aberto.</div>
          ) : valesAbertos.map((v, i) => (
            <div key={v.id} className="list-row" style={{
              display: 'grid', gridTemplateColumns: podeGerenciar ? 'minmax(160px, 1fr) 110px 32px' : 'minmax(160px, 1fr) 110px', gap: '12px',
              padding: '12px 20px', alignItems: 'center', borderBottom: i < valesAbertos.length - 1 ? '1px solid var(--c-1a)' : 'none',
            }}>
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{v.profissional?.nome ?? '—'}</p>
                <p className="subtexto texto-cortado">{formatDate(v.data)}{v.descricao ? ` · ${v.descricao}` : ''}</p>
              </div>
              <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', textAlign: 'right' }}>{formatCurrency(Number(v.valor))}</span>
              {podeGerenciar && (
                v.gerado_por_fechamento ? <span title="Saldo de um fechamento" /> : (
                  <button className="btn btn-icon" title="Excluir vale" aria-label="Excluir vale" onClick={() => excluirVale(v)} style={{ width: '28px', height: '28px', justifySelf: 'end' }}>
                    <Trash2 size={12} />
                  </button>
                )
              )}
            </div>
          ))}
          {valesAbertos.length > 0 && (
            <div className="detalhe-total" style={{ margin: 0, borderRadius: 0 }}>
              <span>Total em aberto</span><strong>{formatCurrency(valesAbertos.reduce((s, v) => s + Number(v.valor), 0))}</strong>
            </div>
          )}
        </div>
      )}

      {aba === 'comissoes' && (<>

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
          padding: '10px 20px', borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'var(--header-bg)',
        }}>
          <span className="celula-check">
            <Checkbox label="Selecionar todas" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={filtradas.length === 0} />
          </span>
          <span>Quem</span><span>Venda</span>
          <span style={{ textAlign: 'right' }}>Base</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'right' }}>Comissão</span>
          {podeGerenciar && <span />}
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
        ) : erro ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-66)', fontSize: '13px' }}>{erro}</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Nenhuma comissão no período.</div>
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
              borderBottom: i < filtradas.length - 1 ? '1px solid var(--c-1a)' : 'none',
            }}
          >
            <span className="celula-check">
              <Checkbox label={`Selecionar comissão de ${nomeExibicao(c)}`} checked={selecao.tem(c.id)} onChange={m => selecao.alternar(c.id, m)} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>
                {nomeExibicao(c)}
                {!c.profissional_id && c.usuario_id && <span style={{ fontSize: '11px', color: 'var(--c-55)', fontWeight: 400 }}> · venda</span>}
              </p>
              <p className="subtexto">{formatDateTime(c.created_at)}{c.fechamento_id && <span className="badge badge-done" style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 6px' }}>Paga</span>}</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-a3)' }}>{c.comanda?.cliente_nome ?? (c.comanda_id ? 'Balcão' : '—')}</p>
              {c.comanda && <p className="subtexto">Total {formatCurrency(Number(c.comanda.total))} · {rotuloPagamento(c.comanda.forma_pagamento, c.comanda.parcelas)}</p>}
            </div>
            <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-77)', textAlign: 'right' }}>
              <b className="mobile-only-label">Base: </b>{formatCurrency(Number(c.valor_base))}
              {Number(c.taxa_valor ?? 0) > 0 && <span className="subtexto" style={{ display: 'block' }}>taxa −{formatCurrency(Number(c.taxa_valor))}</span>}
            </span>
            <span className="valor-num" style={{ fontSize: '12px', color: 'var(--c-77)', textAlign: 'right' }}><b className="mobile-only-label">Percentual: </b>{Number(c.percentual)}%</span>
            <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', textAlign: 'right' }}><b className="mobile-only-label">Comissão: </b>{formatCurrency(Number(c.valor_comissao))}</span>
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

      </>)}

      <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
        <ItemSelecao rotulo="Comissão" valor={formatCurrency(selecionadas.reduce((s, c) => s + Number(c.valor_comissao), 0))} />
        <ItemSelecao rotulo="Base" valor={formatCurrency(selecionadas.reduce((s, c) => s + Number(c.valor_base), 0))} />
      </BarraSelecao>

      <AnimatePresence>
        {vendaAbertaId && (
          <VendaDetalheModal comandaId={vendaAbertaId} onClose={() => setVendaAbertaId(null)} onAlterado={carregar} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal === 'vale' && (
          <ValeModal profissionais={profissionais} onClose={() => setModal(null)} onSalvo={() => { setModal(null); carregarFechamentos(); setAba('vales') }} />
        )}
        {modal === 'fechar' && (
          <FecharComissaoModal
            profissionais={profissionais}
            onClose={() => setModal(null)}
            onFechado={id => { setModal(null); carregar(); carregarFechamentos(); setAba('fechamentos'); setHoleriteId(id) }}
          />
        )}
        {holeriteId && (
          <HoleriteModal
            fechamentoId={holeriteId}
            podeEstornar={podeGerenciar}
            onClose={() => setHoleriteId(null)}
            onEstornado={() => { setHoleriteId(null); carregar(); carregarFechamentos() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
