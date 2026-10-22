import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle, Search, ArrowUpCircle, ArrowDownCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import { dataLocalISO, type Intervalo } from '../../lib/periodo'
import { useModalKeyboard } from '../../hooks/useModalKeyboard'
import { usePermissoes } from '../../hooks/usePermissoes'
import { useSelecao } from '../../hooks/useSelecao'
import { carregarSaldosContas, confirmarSaldoSuficiente, type SaldoConta } from '../../lib/contasFinanceiras'
import FiltroPeriodo from '../ui/FiltroPeriodo'
import Checkbox from '../ui/Checkbox'
import BarraSelecao, { ItemSelecao } from '../ui/BarraSelecao'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../ui/ModalDetalhe'
import type { CategoriaFinanceira, ContaPagar, ContaReceber, FormaPagamentoCadastro } from '../../types'

export type TipoConta = 'pagar' | 'receber'

type Conta = (ContaPagar | ContaReceber) & { fornecedor?: { nome: string } | null; cliente?: { nome: string } | null }
type Pessoa = { id: string; nome: string }
type Filtro = 'todas' | 'aberta' | 'vencida' | 'paga'

// Tudo que muda entre Contas a Pagar e Contas a Receber.
const CFG = {
  pagar: {
    tabela: 'contas_pagar', tela: 'contas_pagar' as const, titulo: 'Contas a Pagar', novoTitulo: 'Nova Conta a Pagar',
    pessoaTabela: 'fornecedores', pessoaJoin: 'fornecedor:fornecedores(id, nome)', pessoaRotulo: 'Fornecedor', pCriarPessoa: 'p_fornecedor_id',
    categoriaTipo: 'despesa', rpcCriar: 'criar_conta_pagar', rpcBaixar: 'baixar_conta_pagar',
    acao: 'Pagar', acaoTitulo: 'Pagar Conta', valorLabel: 'Valor a pagar', contaLabel: 'Sai da conta',
    contaErro: 'Escolha de qual conta sai o pagamento.', placeholder: 'Ex: Aluguel de setembro',
    pagoRotulo: 'Pago', dataBaixaRotulo: 'Pago em', pagas: 'Pagas', paga: 'Paga', icone: ArrowUpCircle,
  },
  receber: {
    tabela: 'contas_receber', tela: 'contas_receber' as const, titulo: 'Contas a Receber', novoTitulo: 'Nova Conta a Receber',
    pessoaTabela: 'clientes', pessoaJoin: 'cliente:clientes(id, nome)', pessoaRotulo: 'Cliente', pCriarPessoa: 'p_cliente_id',
    categoriaTipo: 'receita', rpcCriar: 'criar_conta_receber', rpcBaixar: 'baixar_conta_receber',
    acao: 'Receber', acaoTitulo: 'Receber Conta', valorLabel: 'Valor recebido', contaLabel: 'Entra na conta',
    contaErro: 'Escolha em qual conta o dinheiro entra.', placeholder: 'Ex: Pacote de serviços',
    pagoRotulo: 'Recebido', dataBaixaRotulo: 'Recebido em', pagas: 'Recebidas', paga: 'Recebida', icone: ArrowDownCircle,
  },
} as const

const FORM_INICIAL = () => ({
  pessoa_id: '', categoria_id: '', descricao: '', valor: '',
  data_vencimento: dataLocalISO(), total_parcelas: '1', observacao: '',
})

function isVencida(c: Conta) {
  return (c.status === 'aberta' || c.status === 'parcial') && c.data_vencimento < dataLocalISO()
}
const emAberto = (c: Conta) => c.status === 'aberta' || c.status === 'parcial'
const saldoDe = (c: Conta) => Number(c.valor) - Number(c.valor_pago)

/**
 * Tela de Contas a Pagar / Contas a Receber (mesmo funcionamento, muda
 * só o lado: fornecedor x cliente, sai x entra dinheiro).
 */
export default function ContasPagina({ tipo }: { tipo: TipoConta }) {
  const cfg = CFG[tipo]
  const Icone = cfg.icone
  const { podeEditar: podeEditarTela } = usePermissoes()
  const podeEditar = podeEditarTela(cfg.tela)
  const [contas, setContas] = useState<Conta[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoCadastro[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [vencimento, setVencimento] = useState<Intervalo | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [contaAbertaId, setContaAbertaId] = useState<string | null>(null)
  const [contaBaixa, setContaBaixa] = useState<Conta | null>(null)
  const [valorBaixa, setValorBaixa] = useState('')
  const [formaBaixa, setFormaBaixa] = useState('')
  const [contasFin, setContasFin] = useState<SaldoConta[]>([])
  const [contaFinBaixa, setContaFinBaixa] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    supabase.from(cfg.tabela).select(`*, ${cfg.pessoaJoin}, categoria:categorias_financeiras(*)`).order('data_vencimento')
      .then(({ data }) => { setContas((data ?? []) as Conta[]); setLoading(false) })
  }, [cfg])

  useEffect(() => {
    carregar()
    supabase.from(cfg.pessoaTabela).select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setPessoas(data as Pessoa[]) })
    supabase.from('categorias_financeiras').select('*').eq('tipo', cfg.categoriaTipo).eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setCategorias(data as CategoriaFinanceira[]) })
    supabase.from('formas_pagamento').select('*').order('nome')
      .then(({ data }) => { if (data) setFormasPagamento(data as FormaPagamentoCadastro[]) })
  }, [carregar, cfg])

  // Ao abrir a baixa: contas com saldo atual, já na padrão.
  useEffect(() => {
    if (!contaBaixa) return
    carregarSaldosContas().then(lista => {
      setContasFin(lista)
      setContaFinBaixa((lista.find(c => c.padrao) ?? lista[0])?.conta_id ?? '')
    })
  }, [contaBaixa])

  // Contas sintéticas (que agrupam outras) não recebem lançamento direto — só as analíticas (de detalhe).
  const idsSinteticas = new Set(categorias.map(c => c.categoria_pai_id).filter(Boolean))
  const categoriasSelecionaveis = categorias.filter(c => !idsSinteticas.has(c.id))
  const nomeCategoriaPai = (id: string) => categorias.find(c => c.id === id)?.nome
  const nomePessoa = (c: Conta) => (tipo === 'pagar' ? c.fornecedor?.nome : c.cliente?.nome) ?? null

  const porPeriodo = useMemo(() => contas.filter(c =>
    !vencimento || (c.data_vencimento >= vencimento.inicio && c.data_vencimento <= vencimento.fim)
  ), [contas, vencimento])

  const porBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return porPeriodo
    return porPeriodo.filter(c =>
      c.descricao.toLowerCase().includes(termo) || (nomePessoa(c) ?? '').toLowerCase().includes(termo)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [porPeriodo, busca])

  const contagem: Record<Filtro, number> = {
    todas: porBusca.length,
    aberta: porBusca.filter(emAberto).length,
    vencida: porBusca.filter(isVencida).length,
    paga: porBusca.filter(c => c.status === 'paga').length,
  }

  const filtradas = porBusca.filter(c => {
    if (filtro === 'todas') return true
    if (filtro === 'vencida') return isVencida(c)
    if (filtro === 'aberta') return emAberto(c)
    return c.status === filtro
  })

  const totalAberto = contas.filter(emAberto).reduce((s, c) => s + saldoDe(c), 0)
  const totalVencido = contas.filter(isVencida).reduce((s, c) => s + saldoDe(c), 0)

  const selecao = useSelecao(filtradas.map(c => c.id))
  const marcadas = filtradas.filter(c => selecao.tem(c.id))

  const contaAberta = contaAbertaId ? contas.find(c => c.id === contaAbertaId) ?? null : null

  async function handleSave() {
    if (!form.descricao.trim() || !form.valor) { setError('Descrição e valor são obrigatórios.'); return }
    if (saving) return
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc(cfg.rpcCriar, {
      [cfg.pCriarPessoa]: form.pessoa_id || null,
      p_categoria_id: form.categoria_id || null,
      p_descricao: form.descricao,
      p_valor_total: Number(form.valor),
      p_data_vencimento: form.data_vencimento,
      p_total_parcelas: Number(form.total_parcelas) || 1,
      p_observacao: form.observacao || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setForm(FORM_INICIAL())
    setShowModal(false)
    carregar()
  }

  function abrirBaixa(c: Conta) {
    setContaAbertaId(null)
    setContaBaixa(c)
    setValorBaixa(String(saldoDe(c)))
    setFormaBaixa('')
    setError('')
  }

  async function confirmarBaixa() {
    if (!contaBaixa || saving) return
    const valor = Number(valorBaixa)
    if (!valor || valor <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!contaFinBaixa) { setError(cfg.contaErro); return }
    setSaving(true); setError('')
    if (tipo === 'pagar' && !(await confirmarSaldoSuficiente(contaFinBaixa, valor))) { setSaving(false); return }
    const { error: err } = await supabase.rpc(cfg.rpcBaixar, {
      p_conta_id: contaBaixa.id,
      p_valor_pago: valor,
      p_forma_pagamento_id: formaBaixa || null,
      p_conta_financeira_id: contaFinBaixa,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setContaBaixa(null)
    carregar()
  }

  const modalRef = useModalKeyboard(showModal, () => setShowModal(false), handleSave)
  const modalBaixaRef = useModalKeyboard(!!contaBaixa, () => setContaBaixa(null), confirmarBaixa)

  const colunas = '22px minmax(200px, 1fr) minmax(110px, 170px) 100px 110px 84px 76px'
  const statusDe = (c: Conta) => isVencida(c)
    ? { cls: 'badge badge-canceled', label: 'Vencida' }
    : c.status === 'paga' ? { cls: 'badge badge-done', label: cfg.paga }
      : c.status === 'cancelada' ? { cls: 'badge badge-canceled', label: 'Cancelada' }
        : c.status === 'parcial' ? { cls: 'badge badge-pending', label: 'Parcial' }
          : { cls: 'badge badge-pending', label: 'Aberta' }

  const FILTROS: { id: Filtro; label: string }[] = [
    { id: 'todas', label: 'Todas' }, { id: 'aberta', label: 'Abertas' },
    { id: 'vencida', label: 'Vencidas' }, { id: 'paga', label: cfg.pagas },
  ]

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>{cfg.titulo}</h1>
          <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
            {formatCurrency(totalAberto)} em aberto · {formatCurrency(totalVencido)} vencido
          </p>
        </div>
        {podeEditar && (
          <button className="btn btn-primary" onClick={() => { setError(''); setForm(FORM_INICIAL()); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Conta
          </button>
        )}
      </div>

      <div className="barra-filtros">
        <div className="pilulas" role="tablist">
          {FILTROS.map(f => (
            <button key={f.id} role="tab" aria-selected={filtro === f.id} className={`pilula${filtro === f.id ? ' ativa' : ''}`} onClick={() => setFiltro(f.id)}>
              {f.label}<span className="pilula-contagem">{contagem[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="filtro-busca">
          <Search size={13} />
          <input placeholder={`Buscar descrição ou ${cfg.pessoaRotulo.toLowerCase()}...`} value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && (
            <button onClick={() => setBusca('')} aria-label="Limpar busca" style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
        <FiltroPeriodo valor={vencimento} onChange={setVencimento} permitirTudo />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', minWidth: '780px', gridTemplateColumns: colunas, gap: '12px', alignItems: 'center',
          padding: '10px 20px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span className="celula-check">
            <Checkbox label="Selecionar todas" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={filtradas.length === 0} />
          </span>
          <span>Descrição</span><span>{cfg.pessoaRotulo}</span><span>Vencimento</span>
          <span style={{ textAlign: 'right' }}>Saldo</span><span>Status</span><span />
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Nenhuma conta encontrada.</div>
        ) : filtradas.map((c, i) => {
          const vencida = isVencida(c)
          const st = statusDe(c)
          return (
            <motion.div
              key={c.id}
              className={`list-row clicavel${selecao.tem(c.id) ? ' selecionada' : ''}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
              onClick={() => setContaAbertaId(c.id)}
              style={{
                display: 'grid', minWidth: '780px', gridTemplateColumns: colunas, gap: '12px',
                padding: '12px 20px', alignItems: 'center',
                borderBottom: i < filtradas.length - 1 ? '1px solid #1F1F1F' : 'none',
              }}
            >
              <span className="celula-check">
                <Checkbox label={`Selecionar ${c.descricao}`} checked={selecao.tem(c.id)} onChange={m => selecao.alternar(c.id, m)} />
              </span>
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{c.descricao}</p>
                {(c.categoria || c.total_parcelas > 1) && (
                  <p className="subtexto texto-cortado">
                    {[c.categoria?.nome, c.total_parcelas > 1 ? `parcela ${c.numero_parcela}/${c.total_parcelas}` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <span className="texto-cortado" style={{ fontSize: '12px', color: '#A3A3A3' }}>{nomePessoa(c) ?? '—'}</span>
              <span style={{ fontSize: '12px', color: vencida ? '#FFFFFF' : '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <b className="mobile-only-label">Vence: </b>{vencida && <AlertTriangle size={11} />} {formatDate(c.data_vencimento)}
              </span>
              <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', textAlign: 'right' }}><b className="mobile-only-label">Saldo: </b>{formatCurrency(saldoDe(c))}</span>
              <span className={st.cls}>{st.label}</span>
              {podeEditar && emAberto(c) ? (
                <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); abrirBaixa(c) }} style={{ justifySelf: 'end' }}>
                  {cfg.acao}
                </button>
              ) : <span />}
            </motion.div>
          )
        })}
      </div>

      <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
        <ItemSelecao rotulo="Saldo" valor={formatCurrency(marcadas.reduce((s, c) => s + saldoDe(c), 0))} />
        <ItemSelecao rotulo="Valor total" valor={formatCurrency(marcadas.reduce((s, c) => s + Number(c.valor), 0))} />
      </BarraSelecao>

      {/* Card da conta */}
      <AnimatePresence>
        {contaAberta && (() => {
          const st = statusDe(contaAberta)
          const parcelas = contaAberta.grupo_parcelamento && contaAberta.total_parcelas > 1
            ? contas.filter(x => x.grupo_parcelamento === contaAberta.grupo_parcelamento).sort((a, b) => a.numero_parcela - b.numero_parcela)
            : []
          const forma = formasPagamento.find(f => f.id === contaAberta.forma_pagamento_id)?.nome
          return (
            <ModalDetalhe
              key={contaAberta.id}
              largura={500}
              icone={<Icone size={18} />}
              titulo={contaAberta.descricao}
              subtitulo={<>
                <span className={st.cls}>{st.label}</span>
                {contaAberta.total_parcelas > 1 && <span>Parcela {contaAberta.numero_parcela} de {contaAberta.total_parcelas}</span>}
              </>}
              onClose={() => setContaAbertaId(null)}
              acoes={podeEditar && emAberto(contaAberta) ? (
                <button className="btn btn-primary" onClick={() => abrirBaixa(contaAberta)}>
                  {cfg.acao} {formatCurrency(saldoDe(contaAberta))}
                </button>
              ) : undefined}
            >
              <InfoGrade>
                <Info rotulo={cfg.pessoaRotulo}>{nomePessoa(contaAberta)}</Info>
                <Info rotulo="Categoria">{contaAberta.categoria?.nome}</Info>
                <Info rotulo="Valor">{formatCurrency(Number(contaAberta.valor))}</Info>
                <Info rotulo={cfg.pagoRotulo}>{formatCurrency(Number(contaAberta.valor_pago))}</Info>
                <Info rotulo="Emissão">{formatDate(contaAberta.data_emissao)}</Info>
                <Info rotulo="Vencimento">{formatDate(contaAberta.data_vencimento)}</Info>
                <Info rotulo={cfg.dataBaixaRotulo}>{contaAberta.data_pagamento ? formatDate(contaAberta.data_pagamento) : undefined}</Info>
                <Info rotulo="Forma de pagamento">{forma}</Info>
                {'centro_custo' in contaAberta && contaAberta.centro_custo && <Info rotulo="Centro de custo">{contaAberta.centro_custo}</Info>}
                <Info rotulo="Observação" largo>{contaAberta.observacao}</Info>
              </InfoGrade>

              <div className="detalhe-total">
                <span>Saldo {tipo === 'pagar' ? 'a pagar' : 'a receber'}</span>
                <strong>{formatCurrency(saldoDe(contaAberta))}</strong>
              </div>

              {parcelas.length > 1 && (
                <SecaoDetalhe titulo={`Parcelas (${parcelas.length})`}>
                  <div className="detalhe-lista">
                    {parcelas.map(p => {
                      const sp = statusDe(p)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="detalhe-lista-item"
                          onClick={() => setContaAbertaId(p.id)}
                          style={{ cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', borderColor: p.id === contaAberta.id ? '#555' : undefined }}
                        >
                          <span style={{ width: '42px', color: '#FFFFFF', fontWeight: 600 }}>{p.numero_parcela}/{p.total_parcelas}</span>
                          <span style={{ flex: 1 }}>{formatDate(p.data_vencimento)}</span>
                          <span className={sp.cls}>{sp.label}</span>
                          <span className="valor-num" style={{ width: '96px', textAlign: 'right', color: '#FFFFFF' }}>{formatCurrency(Number(p.valor))}</span>
                        </button>
                      )
                    })}
                  </div>
                </SecaoDetalhe>
              )}
            </ModalDetalhe>
          )
        })()}
      </AnimatePresence>

      {/* Modal: Nova Conta */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalRef} className="card" style={{ width: '100%', maxWidth: '460px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{cfg.novoTitulo}</h2>
                <button className="btn btn-icon" onClick={() => setShowModal(false)}><X size={14} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">Descrição *</label>
                  <input className="input" placeholder={cfg.placeholder} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">{cfg.pessoaRotulo}</label>
                    <select className="input" value={form.pessoa_id} onChange={e => setForm(f => ({ ...f, pessoa_id: e.target.value }))}>
                      <option value="">Nenhum</option>
                      {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label className="label">Categoria</label>
                    <select className="input" value={form.categoria_id} onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}>
                      <option value="">Nenhuma</option>
                      {categoriasSelecionaveis.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.categoria_pai_id ? `${nomeCategoriaPai(c.categoria_pai_id)} › ${c.nome}` : c.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label className="label">Valor total *</label>
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">1º Vencimento</label>
                    <input className="input" type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label className="label">Parcelas</label>
                    <input className="input" type="number" min={1} max={36} value={form.total_parcelas} onChange={e => setForm(f => ({ ...f, total_parcelas: e.target.value }))} />
                  </div>
                </div>
                <div className="field">
                  <label className="label">Observação</label>
                  <input className="input" placeholder="opcional" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Salvando...' : 'Cadastrar (F10)'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal: Baixa */}
      <AnimatePresence>
        {contaBaixa && (
          <motion.div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={modalBaixaRef} className="card" style={{ width: '100%', maxWidth: '380px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>{cfg.acaoTitulo}</h2>
                <button className="btn btn-icon" onClick={() => setContaBaixa(null)}><X size={14} /></button>
              </div>
              <p style={{ fontSize: '13px', color: '#A3A3A3', marginBottom: '16px' }}>{contaBaixa.descricao}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="field">
                  <label className="label">{cfg.valorLabel}</label>
                  <input className="input" type="number" min={0} step={0.01} value={valorBaixa} onChange={e => setValorBaixa(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label">Forma de pagamento</label>
                  <select className="input" value={formaBaixa} onChange={e => setFormaBaixa(e.target.value)}>
                    <option value="">Selecionar...</option>
                    {formasPagamento.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label">{cfg.contaLabel}</label>
                  <select className="input" value={contaFinBaixa} onChange={e => setContaFinBaixa(e.target.value)}>
                    {contasFin.length === 0 && <option value="">Carregando...</option>}
                    {contasFin.map(c => <option key={c.conta_id} value={c.conta_id}>{c.nome} · saldo {formatCurrency(c.saldo)}</option>)}
                  </select>
                </div>
                {error && <p style={{ fontSize: '12px', color: '#666' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setContaBaixa(null)}>Cancelar (Esc)</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmarBaixa} disabled={saving}>
                    {saving ? 'Salvando...' : 'Confirmar (F10)'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
