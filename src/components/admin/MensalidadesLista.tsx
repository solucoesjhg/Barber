import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Check, RotateCcw, Trash2, X, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import { dataLocalISO } from '../../lib/periodo'
import { FORMAS_RECEBIMENTO, SITUACAO_CLASSE, SITUACAO_LABEL, rotuloCompetencia, situacaoMensalidade } from '../../lib/mensalidades'
import ModalFormulario, { Campo, FormGrade } from '../ui/ModalFormulario'
import type { Mensalidade } from '../../types'

/**
 * Mensalidades das lojas (painel ADM): receber (marca paga com data,
 * valor e forma), cancelar, reabrir e excluir. mostrarEmpresa: coluna
 * com o nome da loja (tela Cobranças).
 */
export default function MensalidadesLista({ mensalidades, mostrarEmpresa = false, onAlterado, vazio = 'Nenhuma cobrança.' }: {
  mensalidades: Mensalidade[]
  mostrarEmpresa?: boolean
  onAlterado: () => void
  vazio?: string
}) {
  const [recebendo, setRecebendo] = useState<Mensalidade | null>(null)
  const [form, setForm] = useState({ pago_em: dataLocalISO(), valor_pago: '', forma: 'Pix', observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function abrirRecebimento(m: Mensalidade) {
    setForm({ pago_em: dataLocalISO(), valor_pago: String(Number(m.valor)), forma: 'Pix', observacao: m.observacao ?? '' })
    setErro('')
    setRecebendo(m)
  }

  async function atualizar(id: string, dados: Partial<Mensalidade>) {
    const { error } = await supabase.from('mensalidades').update(dados).eq('id', id)
    if (error) { window.alert(error.message); return false }
    onAlterado()
    return true
  }

  async function confirmarRecebimento() {
    if (!recebendo || salvando) return
    const valor = Number(String(form.valor_pago).replace(',', '.'))
    if (!(valor >= 0)) { setErro('Informe o valor recebido.'); return }
    if (!form.pago_em) { setErro('Informe a data do pagamento.'); return }
    setSalvando(true)
    const ok = await atualizar(recebendo.id, {
      status: 'paga', pago_em: form.pago_em, valor_pago: valor, forma_pagamento: form.forma, observacao: form.observacao || null,
    })
    setSalvando(false)
    if (ok) setRecebendo(null)
  }

  async function excluir(m: Mensalidade) {
    if (!window.confirm(`Excluir a cobrança de ${formatCurrency(Number(m.valor))} (${m.descricao || rotuloCompetencia(m.competencia)})?`)) return
    const { error } = await supabase.from('mensalidades').delete().eq('id', m.id)
    if (error) { window.alert(error.message); return }
    onAlterado()
  }

  const grade = mostrarEmpresa ? 'minmax(160px, 1.2fr) minmax(150px, 1fr) 100px 110px 100px 170px' : 'minmax(160px, 1fr) 100px 110px 100px 170px'

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', minWidth: mostrarEmpresa ? '820px' : '660px', gridTemplateColumns: grade, gap: '12px',
          padding: '10px 20px', borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'var(--header-bg)',
        }}>
          {mostrarEmpresa && <span>Loja</span>}
          <span>Referência</span><span>Vencimento</span><span style={{ textAlign: 'right' }}>Valor</span><span>Situação</span><span />
        </div>
        {mensalidades.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>{vazio}</div>
        ) : mensalidades.map((m, i) => {
          const sit = situacaoMensalidade(m)
          return (
            <div key={m.id} className="list-row" style={{
              display: 'grid', minWidth: mostrarEmpresa ? '820px' : '660px', gridTemplateColumns: grade, gap: '12px',
              padding: '11px 20px', alignItems: 'center',
              borderBottom: i < mensalidades.length - 1 ? '1px solid var(--c-1a)' : 'none',
              opacity: sit === 'cancelada' ? 0.6 : 1,
            }}>
              {mostrarEmpresa && <span className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{m.empresa?.nome ?? '—'}</span>}
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', color: 'var(--c-fff)' }}>
                  {m.tipo === 'avulsa' ? (m.descricao || 'Cobrança avulsa') : `Mensalidade de ${rotuloCompetencia(m.competencia)}`}
                </p>
                {m.status === 'paga' && (
                  <p className="subtexto">Pago em {formatDate(m.pago_em ?? '')}{m.forma_pagamento ? ` · ${m.forma_pagamento}` : ''}{m.valor_pago != null && Number(m.valor_pago) !== Number(m.valor) ? ` · ${formatCurrency(Number(m.valor_pago))}` : ''}</p>
                )}
                {m.status !== 'paga' && m.observacao && <p className="subtexto texto-cortado">{m.observacao}</p>}
              </div>
              <span style={{ fontSize: '12px', color: sit === 'atrasada' ? '#ef4444' : 'var(--c-a3)' }}>{formatDate(m.vencimento)}</span>
              <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', textAlign: 'right' }}>{formatCurrency(Number(m.valor))}</span>
              <span><span className={SITUACAO_CLASSE[sit]}>{SITUACAO_LABEL[sit]}</span></span>
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                {m.status === 'pendente' && (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => abrirRecebimento(m)} title="Registrar o pagamento" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={12} /> Receber
                    </button>
                    <button className="btn btn-icon" title="Cancelar cobrança" aria-label="Cancelar cobrança" onClick={() => window.confirm('Cancelar esta cobrança?') && atualizar(m.id, { status: 'cancelada' })} style={{ width: '28px', height: '28px' }}>
                      <X size={12} />
                    </button>
                  </>
                )}
                {m.status !== 'pendente' && (
                  <button className="btn btn-icon" title={m.status === 'paga' ? 'Desfazer pagamento' : 'Reabrir cobrança'} aria-label="Reabrir" onClick={() => atualizar(m.id, { status: 'pendente', pago_em: null, valor_pago: null, forma_pagamento: null })} style={{ width: '28px', height: '28px' }}>
                    <RotateCcw size={12} />
                  </button>
                )}
                <button className="btn btn-icon" title="Excluir cobrança" aria-label="Excluir cobrança" onClick={() => excluir(m)} style={{ width: '28px', height: '28px' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {recebendo && (
          <ModalFormulario
            tamanho="pequeno"
            icone={<Receipt size={18} />}
            titulo="Registrar pagamento"
            descricao={`${recebendo.empresa?.nome ? `${recebendo.empresa.nome} · ` : ''}${recebendo.tipo === 'avulsa' ? (recebendo.descricao || 'Cobrança avulsa') : `Mensalidade de ${rotuloCompetencia(recebendo.competencia)}`} · ${formatCurrency(Number(recebendo.valor))}`}
            onClose={() => setRecebendo(null)}
            onSalvar={confirmarRecebimento}
            salvando={salvando}
            rotuloSalvar="Confirmar pagamento"
            erro={erro}
          >
            <FormGrade colunas={2}>
              <Campo rotulo="Pago em *">
                <input className="input" type="date" value={form.pago_em} onChange={e => setForm(f => ({ ...f, pago_em: e.target.value }))} />
              </Campo>
              <Campo rotulo="Valor recebido (R$) *">
                <input className="input" type="number" min={0} step={0.01} value={form.valor_pago} onChange={e => setForm(f => ({ ...f, valor_pago: e.target.value }))} />
              </Campo>
              <Campo rotulo="Forma">
                <select className="input" value={form.forma} onChange={e => setForm(f => ({ ...f, forma: e.target.value }))}>
                  {FORMAS_RECEBIMENTO.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Observação">
                <input className="input" placeholder="opcional" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </>
  )
}
