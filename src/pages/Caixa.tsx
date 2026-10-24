import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, ArrowUpRight, ArrowDownRight, X, ArrowDownToLine, ArrowUpFromLine, Wallet, TrendingUp, TrendingDown, Scale } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { carregarNomesUsuarios } from '../lib/usuarios'
import { formatCurrency, formatDateTime, formatTime } from '../lib/utils'
import { useModalKeyboard } from '../hooks/useModalKeyboard'
import { confirmarSaldoSuficiente } from '../lib/contasFinanceiras'
import { usePermissoes } from '../hooks/usePermissoes'
import { useSelecao } from '../hooks/useSelecao'
import Checkbox from '../components/ui/Checkbox'
import StatCard from '../components/ui/StatCard'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import VendaDetalheModal from '../components/VendaDetalheModal'
import LancamentoDetalheModal from '../components/LancamentoDetalheModal'
import type { SessaoCaixa, MovimentoCaixa } from '../types'

const CATEGORIA_LABEL: Record<string, string> = {
  venda: 'Venda', sangria: 'Sangria', suprimento: 'Suprimento',
  conta_a_pagar: 'Conta paga', conta_a_receber: 'Conta recebida',
  vale: 'Vale', comissao: 'Comissão paga',
}

type ModalTipo = null | 'abrir' | 'sangria' | 'suprimento' | 'fechar'

export default function Caixa() {
  const { user } = useAuth()
  const { podeEditar: podeEditarTela } = usePermissoes()
  const podeEditar = podeEditarTela('caixa')
  const [sessao, setSessao] = useState<SessaoCaixa | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalTipo>(null)
  const [valorInput, setValorInput] = useState('')
  const [descricaoInput, setDescricaoInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [resultadoFechamento, setResultadoFechamento] = useState<SessaoCaixa | null>(null)
  const [movimentoAberto, setMovimentoAberto] = useState<MovimentoCaixa | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  // Último caixa da loja, quando foi fechado sozinho no horário.
  const [fechadoAuto, setFechadoAuto] = useState<SessaoCaixa | null>(null)
  const selecao = useSelecao(movimentos.map(m => m.id))
  const marcados = movimentos.filter(m => selecao.tem(m.id))
  const entradasMarcadas = marcados.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.valor), 0)
  const saidasMarcadas = marcados.filter(m => m.tipo === 'saida').reduce((s, m) => s + Number(m.valor), 0)

  const carregar = useCallback(async () => {
    if (!user) return
    setLoading(true)
    // Fecha o caixa que passou do horário de fechamento da loja (se a
    // função ainda não existe no banco, segue sem ela).
    await supabase.rpc('fechar_caixas_no_horario')
    // O caixa é da loja: um só aberto, onde entram as vendas de todos.
    const { data: sess } = await supabase
      .from('sessoes_caixa')
      .select('*')
      .eq('status', 'aberto')
      .order('aberto_em')
      .limit(1)
      .maybeSingle()

    setSessao((sess as SessaoCaixa) ?? null)

    if (!sess) {
      const { data: ultima } = await supabase.from('sessoes_caixa').select('*')
        .eq('status', 'fechado')
        .order('fechado_em', { ascending: false }).limit(1).maybeSingle()
      const u = ultima as SessaoCaixa | null
      const recente = !!u?.fechado_em && Date.now() - new Date(u.fechado_em).getTime() < 24 * 3600 * 1000
      setFechadoAuto(u && recente && /automaticamente/i.test(u.observacao_fechamento ?? '') ? u : null)
    } else {
      setFechadoAuto(null)
    }

    if (sess) {
      const { data: movs } = await supabase
        .from('movimentos_caixa')
        .select('*')
        .eq('sessao_caixa_id', sess.id)
        .order('created_at', { ascending: false })
      setMovimentos((movs ?? []) as MovimentoCaixa[])
    } else {
      setMovimentos([])
    }
    setLoading(false)
  }, [user])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarNomesUsuarios().then(setNomes) }, [])

  const entradas = movimentos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const saidas   = movimentos.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0)
  const saldoAtual = (sessao?.valor_inicial ?? 0) + entradas - saidas
  // O que entrou por forma de pagamento. Na gaveta só fica o dinheiro:
  // vendas em dinheiro, entradas sem forma (suprimento, recebimentos) e
  // todas as saídas (sangria, pagamentos).
  const entradaPorForma = (forma: string) => movimentos
    .filter(m => m.tipo === 'entrada' && m.forma_pagamento === forma).reduce((s, m) => s + Number(m.valor), 0)
  const dinheiroGaveta = (sessao?.valor_inicial ?? 0)
    + movimentos.filter(m => m.tipo === 'entrada' && (!m.forma_pagamento || m.forma_pagamento === 'dinheiro')).reduce((s, m) => s + Number(m.valor), 0)
    - saidas
  const foraDaGaveta = [
    { rotulo: 'Pix', valor: entradaPorForma('pix') },
    { rotulo: 'Cartão débito', valor: entradaPorForma('debito') },
    { rotulo: 'Cartão crédito', valor: entradaPorForma('credito') },
  ]

  function abrirModal(tipo: ModalTipo) {
    setError(''); setValorInput(''); setDescricaoInput(''); setModal(tipo)
  }

  async function confirmarAbrirCaixa() {
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('abrir_caixa', { p_valor_inicial: Number(valorInput) || 0 })
    setSaving(false)
    if (err) { setError(err.message); return }
    setModal(null)
    carregar()
  }

  async function confirmarMovimento(tipo: 'sangria' | 'suprimento') {
    if (!valorInput || Number(valorInput) <= 0) { setError('Informe um valor válido.'); return }
    if (saving) return
    setSaving(true); setError('')
    if (tipo === 'sangria' && !(await confirmarSaldoSuficiente(null, Number(valorInput)))) {
      setSaving(false); return
    }
    const { error: err } = await supabase.rpc('registrar_movimento_caixa', {
      p_tipo: tipo === 'sangria' ? 'saida' : 'entrada',
      p_categoria: tipo,
      p_descricao: descricaoInput || (tipo === 'sangria' ? 'Sangria' : 'Suprimento'),
      p_valor: Number(valorInput),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setModal(null)
    carregar()
  }

  async function confirmarFecharCaixa() {
    if (!sessao) return
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('fechar_caixa', {
      p_sessao_id: sessao.id,
      p_valor_informado: Number(valorInput) || 0,
      p_observacao: descricaoInput || null,
    })
    setSaving(false)
    if (err) { setError(err.message); return }

    const { data: fechada } = await supabase.from('sessoes_caixa').select('*').eq('id', sessao.id).single()
    setResultadoFechamento(fechada as SessaoCaixa)
    setModal(null)
    carregar()
  }

  function confirmarModal() {
    if (modal === 'abrir') confirmarAbrirCaixa()
    else if (modal === 'fechar') confirmarFecharCaixa()
    else if (modal) confirmarMovimento(modal)
  }

  const modalRef = useModalKeyboard(!!modal, () => setModal(null), confirmarModal)
  const resultadoRef = useModalKeyboard(!!resultadoFechamento, () => setResultadoFechamento(null))

  if (loading) {
    return <div className="page"><p style={{ color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</p></div>
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Caixa</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {sessao
              ? `Caixa da loja · aberto desde ${formatDateTime(sessao.aberto_em)}${nomes[sessao.usuario_id] ? ` por ${nomes[sessao.usuario_id]}` : ''}`
              : 'Nenhum caixa aberto'}
          </p>
        </div>
        {!podeEditar ? null : sessao ? (
          <button className="btn btn-secondary" onClick={() => abrirModal('fechar')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={14} /> Fechar Caixa
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => abrirModal('abrir')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Unlock size={14} /> Abrir Caixa
          </button>
        )}
      </div>

      {!sessao ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: 'var(--c-55)' }}>O caixa está fechado.</p>
          {fechadoAuto && (
            <p className="aviso-info" style={{ margin: '12px auto 0', maxWidth: '440px', textAlign: 'left' }}>
              O último caixa foi fechado automaticamente em {formatDateTime(fechadoAuto.fechado_em!)}, no horário de fechamento da loja.
              Saldo esperado: {formatCurrency(Number(fechadoAuto.saldo_esperado ?? 0))}. Confira a gaveta e avise o gerente se houver diferença.
            </p>
          )}
          <p style={{ fontSize: '12px', color: 'var(--c-44)', marginTop: '6px' }}>
            {podeEditar ? 'Abra o caixa da loja uma vez: todas as vendas e movimentos da equipe entram nele até ele ser fechado.' : 'Peça a quem cuida do caixa para abrir o caixa da loja.'}
          </p>
        </div>
      ) : (
        <>
          <div className="stat-grid-auto">
            <StatCard rotulo="Valor inicial" icone={Wallet} valor={formatCurrency(sessao.valor_inicial)} />
            <StatCard rotulo="Entradas" icone={TrendingUp} valor={formatCurrency(entradas)} />
            <StatCard rotulo="Saídas" icone={TrendingDown} valor={formatCurrency(saidas)} />
            <StatCard rotulo="Saldo atual" icone={Scale} valor={formatCurrency(saldoAtual)} sub="Todas as formas" />
          </div>

          {/* Por forma: a gaveta só tem o dinheiro; Pix e cartão vão para a conta. */}
          <div className="caixa-formas">
            <div className="caixa-forma destaque">
              <span>Dinheiro na gaveta</span>
              <strong className="valor-num">{formatCurrency(dinheiroGaveta)}</strong>
            </div>
            {foraDaGaveta.map(f => (
              <div key={f.rotulo} className="caixa-forma">
                <span>{f.rotulo}</span>
                <strong className="valor-num">{formatCurrency(f.valor)}</strong>
              </div>
            ))}
          </div>

          {podeEditar && <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => abrirModal('sangria')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowUpFromLine size={13} /> Sangria
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => abrirModal('suprimento')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ArrowDownToLine size={13} /> Suprimento
            </button>
          </div>}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="list-header" style={{
              display: 'grid', minWidth: '560px', gridTemplateColumns: '22px minmax(200px, 1fr) 120px 70px 120px', gap: '12px', alignItems: 'center',
              padding: '10px 20px', borderBottom: '1px solid var(--c-22)',
              fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
              background: 'var(--header-bg)',
            }}>
              <span className="celula-check">
                <Checkbox label="Selecionar todos os movimentos" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={movimentos.length === 0} />
              </span>
              <span>Movimentos da sessão</span><span>Tipo</span><span>Hora</span><span style={{ textAlign: 'right' }}>Valor</span>
            </div>
            {movimentos.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                Nenhum movimento ainda.
              </div>
            ) : movimentos.map((m, i) => (
              <div
                key={m.id}
                className={`list-row clicavel${selecao.tem(m.id) ? ' selecionada' : ''}`}
                onClick={() => setMovimentoAberto(m)}
                style={{
                  display: 'grid', minWidth: '560px', gridTemplateColumns: '22px minmax(200px, 1fr) 120px 70px 120px', gap: '12px',
                  padding: '12px 20px', alignItems: 'center',
                  borderBottom: i < movimentos.length - 1 ? '1px solid var(--c-1a)' : 'none',
                }}
              >
                <span className="celula-check">
                  <Checkbox label={`Selecionar ${m.descricao}`} checked={selecao.tem(m.id)} onChange={v => selecao.alternar(m.id, v)} />
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  {m.tipo === 'entrada'
                    ? <ArrowUpRight size={13} style={{ color: 'var(--c-fff)', flexShrink: 0 }} />
                    : <ArrowDownRight size={13} style={{ color: 'var(--c-55)', flexShrink: 0 }} />}
                  <span className="texto-cortado" style={{ fontSize: '13px', color: m.tipo === 'entrada' ? 'var(--c-fff)' : 'var(--c-a3)' }}>{m.descricao}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--c-55)' }}>{CATEGORIA_LABEL[m.categoria] ?? m.categoria}</span>
                <span style={{ fontSize: '12px', color: 'var(--c-44)' }}>{formatTime(m.created_at)}</span>
                <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: m.tipo === 'entrada' ? 'var(--c-fff)' : 'var(--c-77)', textAlign: 'right' }}>
                  {m.tipo === 'saida' ? '−' : '+'}{formatCurrency(m.valor)}
                </span>
              </div>
            ))}
          </div>

          <BarraSelecao quantidade={selecao.quantidade} onLimpar={selecao.limpar}>
            <ItemSelecao rotulo="Entradas" valor={formatCurrency(entradasMarcadas)} />
            <ItemSelecao rotulo="Saídas" valor={formatCurrency(saidasMarcadas)} />
            <ItemSelecao rotulo="Saldo" valor={formatCurrency(entradasMarcadas - saidasMarcadas)} />
          </BarraSelecao>
        </>
      )}

      {/* Modais */}
      <AnimatePresence>
        {modal && (
          <motion.div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div
              ref={modalRef}
              className="card"
              style={{ width: '100%', maxWidth: '400px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: 'var(--c-fff)' }}>
                  {modal === 'abrir' && 'Abrir Caixa'}
                  {modal === 'sangria' && 'Sangria (retirada)'}
                  {modal === 'suprimento' && 'Suprimento (aporte)'}
                  {modal === 'fechar' && 'Fechar Caixa'}
                </h2>
                <button className="btn btn-icon" onClick={() => setModal(null)}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {modal === 'fechar' && (
                  <div style={{ padding: '14px 16px', background: 'rgba(var(--ink),0.04)', borderRadius: '8px', fontSize: '13px', color: 'var(--c-a3)' }}>
                    Dinheiro esperado na gaveta: <strong style={{ color: 'var(--c-fff)' }}>{formatCurrency(dinheiroGaveta)}</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--c-66)', marginTop: '4px' }}>
                      Conte só o dinheiro. {foraDaGaveta.filter(f => f.valor > 0).map(f => `${f.rotulo}: ${formatCurrency(f.valor)}`).join(' · ') || 'Nada entrou em Pix ou cartão.'}
                    </span>
                  </div>
                )}
                <div className="field">
                  <label className="label">
                    {modal === 'abrir' ? 'Valor inicial (R$)' : modal === 'fechar' ? 'Dinheiro contado na gaveta (R$)' : 'Valor (R$)'}
                  </label>
                  <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={valorInput} onChange={e => setValorInput(e.target.value)} />
                </div>
                {(modal === 'sangria' || modal === 'suprimento' || modal === 'fechar') && (
                  <div className="field">
                    <label className="label">{modal === 'fechar' ? 'Observação' : 'Descrição'}</label>
                    <input className="input" placeholder="opcional" value={descricaoInput} onChange={e => setDescricaoInput(e.target.value)} />
                  </div>
                )}
                {error && <p style={{ fontSize: '12px', color: 'var(--c-66)' }}>{error}</p>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModal(null)}>Cancelar (Esc)</button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={saving}
                    onClick={confirmarModal}
                  >
                    {saving ? 'Salvando...' : 'Confirmar (F10)'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resultado do fechamento */}
      <AnimatePresence>
        {resultadoFechamento && (
          <motion.div
            className="modal-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div ref={resultadoRef} className="card" style={{ width: '100%', maxWidth: '400px', padding: '28px' }} initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}>
              <h2 style={{ fontSize: '18px', color: 'var(--c-fff)', marginBottom: '20px' }}>Caixa fechado</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--c-a3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Saldo esperado</span>
                  <strong style={{ color: 'var(--c-fff)' }}>{formatCurrency(resultadoFechamento.saldo_esperado ?? 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Valor contado</span>
                  <strong style={{ color: 'var(--c-fff)' }}>{formatCurrency(resultadoFechamento.valor_informado ?? 0)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--c-22)' }}>
                  <span>Diferença</span>
                  <strong style={{ color: (resultadoFechamento.diferenca ?? 0) === 0 ? 'var(--c-fff)' : 'var(--c-a3)' }}>
                    {formatCurrency(resultadoFechamento.diferenca ?? 0)}
                  </strong>
                </div>
              </div>
              <button className="btn btn-primary btn-full" style={{ marginTop: '24px' }} onClick={() => setResultadoFechamento(null)}>
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card do movimento (venda abre a venda completa) */}
      <AnimatePresence>
        {movimentoAberto && (
          movimentoAberto.comanda_id ? (
            <VendaDetalheModal comandaId={movimentoAberto.comanda_id} onClose={() => setMovimentoAberto(null)} />
          ) : (
            <LancamentoDetalheModal movimento={movimentoAberto} onClose={() => setMovimentoAberto(null)} />
          )
        )}
      </AnimatePresence>
    </div>
  )
}
