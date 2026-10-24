import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate } from '../../lib/utils'
import { intervaloMes } from '../../lib/periodo'
import ModalFormulario, { Campo, FormGrade } from '../ui/ModalFormulario'
import type { Comissao, ValeProfissional } from '../../types'

/**
 * Fechamento de comissão: escolhe o profissional e o período, mostra as
 * comissões em aberto e os vales a descontar e, ao confirmar, marca
 * tudo como pago e lança o pagamento no financeiro.
 */
export default function FecharComissaoModal({ profissionais, profissionalId, onClose, onFechado }: {
  profissionais: { id: string; nome: string }[]
  profissionalId?: string
  onClose: () => void
  onFechado: (fechamentoId: string) => void
}) {
  const mes = intervaloMes()
  const [form, setForm] = useState({ profissional: profissionalId ?? '', inicio: mes.inicio, fim: mes.fim, observacao: '', doCaixa: false })
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [vales, setVales] = useState<ValeProfissional[]>([])
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!form.profissional || !form.inicio || !form.fim) { setComissoes([]); setVales([]); return }
    let ativo = true
    setCarregando(true)
    // Mesma regra do banco: dia da comissão no fuso de Brasília.
    const inicioTS = new Date(`${form.inicio}T00:00:00-03:00`).toISOString()
    const fimTS = new Date(`${form.fim}T23:59:59.999-03:00`).toISOString()
    Promise.all([
      supabase.from('comissoes')
        .select('id, valor_comissao, valor_base, percentual, created_at, comanda:comandas(cliente_nome), item:itens_comanda(nome, quantidade)')
        .eq('profissional_id', form.profissional).in('status', ['pendente', 'aprovada']).is('fechamento_id', null)
        .gte('created_at', inicioTS).lte('created_at', fimTS).order('created_at'),
      supabase.from('vales_profissional').select('*')
        .eq('profissional_id', form.profissional).eq('status', 'aberto').lte('data', form.fim).order('data'),
    ]).then(([{ data: c }, { data: v }]) => {
      if (!ativo) return
      setComissoes((c ?? []) as unknown as Comissao[])
      setVales((v ?? []) as ValeProfissional[])
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [form.profissional, form.inicio, form.fim])

  const totalComissoes = comissoes.reduce((s, c) => s + Number(c.valor_comissao), 0)
  const totalVales = vales.reduce((s, v) => s + Number(v.valor), 0)
  const aPagar = Math.max(totalComissoes - totalVales, 0)
  const saldoVales = Math.max(totalVales - totalComissoes, 0)

  async function fechar() {
    if (salvando) return
    if (!form.profissional) { setErro('Escolha o profissional.'); return }
    if (comissoes.length === 0 && vales.length === 0) { setErro('Não há comissão nem vale em aberto nesse período.'); return }
    setSalvando(true); setErro('')
    const { data, error } = await supabase.rpc('fechar_comissoes', {
      p_profissional_id: form.profissional, p_inicio: form.inicio, p_fim: form.fim,
      p_observacao: form.observacao || null, p_do_caixa: form.doCaixa,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onFechado(data as string)
  }

  const linha = (rotulo: string, valor: string, forte = false, cor?: string) => (
    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: forte ? '14px' : '12px', fontWeight: forte ? 700 : 400, color: cor ?? (forte ? 'var(--c-fff)' : 'var(--c-a3)') }}>
      <span>{rotulo}</span><span className="valor-num">{valor}</span>
    </span>
  )

  return (
    <ModalFormulario
      tamanho="medio"
      icone={<ClipboardCheck size={18} />}
      titulo="Fechar comissão"
      descricao="Junta as comissões em aberto do período, desconta os vales e registra o pagamento."
      onClose={onClose}
      onSalvar={fechar}
      salvando={salvando}
      rotuloSalvar={aPagar > 0 ? `Fechar e pagar ${formatCurrency(aPagar)}` : 'Fechar'}
      erro={erro}
    >
      <FormGrade colunas={3}>
        <Campo rotulo="Profissional *">
          <select className="input" value={form.profissional} onChange={e => setForm(f => ({ ...f, profissional: e.target.value }))}>
            <option value="">Escolha o profissional</option>
            {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="De">
          <input className="input" type="date" value={form.inicio} onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} />
        </Campo>
        <Campo rotulo="Até">
          <input className="input" type="date" value={form.fim} onChange={e => setForm(f => ({ ...f, fim: e.target.value }))} />
        </Campo>
      </FormGrade>

      {form.profissional && (
        <div className="fechamento-previa">
          <div>
            <p className="label">Comissões em aberto ({comissoes.length})</p>
            {carregando ? <p className="subtexto">Carregando...</p> : comissoes.length === 0 ? (
              <p className="subtexto">Nenhuma comissão em aberto no período.</p>
            ) : (
              <div className="fechamento-lista">
                {comissoes.map(c => (
                  <span key={c.id}>
                    <span className="texto-cortado">{formatDate(c.created_at.slice(0, 10))} · {c.comanda?.cliente_nome ?? 'Balcão'}{c.item ? ` · ${c.item.nome}` : ''}</span>
                    <span className="valor-num">{formatCurrency(Number(c.valor_comissao))}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="label">Vales a descontar ({vales.length})</p>
            {carregando ? <p className="subtexto">Carregando...</p> : vales.length === 0 ? (
              <p className="subtexto">Nenhum vale em aberto.</p>
            ) : (
              <div className="fechamento-lista">
                {vales.map(v => (
                  <span key={v.id}>
                    <span className="texto-cortado">{formatDate(v.data)}{v.descricao ? ` · ${v.descricao}` : ''}</span>
                    <span className="valor-num">− {formatCurrency(Number(v.valor))}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '14px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(var(--ink),0.04)' }}>
              {linha('Comissões', formatCurrency(totalComissoes))}
              {linha('Vales', `− ${formatCurrency(Math.min(totalVales, totalComissoes))}`)}
              {linha('A pagar', formatCurrency(aPagar), true)}
              {saldoVales > 0 && linha('Vale que fica para o próximo', formatCurrency(saldoVales), false, '#f59e0b')}
            </div>
          </div>
        </div>
      )}

      <FormGrade colunas={2}>
        <Campo rotulo="Observação">
          <input className="input" placeholder="opcional" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
        </Campo>
        <div className="field" style={{ alignSelf: 'end' }}>
          <label className="check-rotulo">
            <input type="checkbox" checked={form.doCaixa} onChange={e => setForm(f => ({ ...f, doCaixa: e.target.checked }))} />
            Pagar com o dinheiro do caixa
          </label>
        </div>
      </FormGrade>
    </ModalFormulario>
  )
}
