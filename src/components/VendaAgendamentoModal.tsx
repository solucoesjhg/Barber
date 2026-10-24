import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Plus, ShoppingCart, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import ModalFormulario from './ui/ModalFormulario'
import { Info, InfoGrade } from './ui/ModalDetalhe'
import { PAGAMENTO_LABEL } from './VendaDetalheModal'
import PagamentoTaxa from './PagamentoTaxa'
import { carregarTaxas, TAXAS_VAZIAS, type TaxasLoja } from '../lib/taxas'
import type { Agendamento, PagamentoMetodo } from '../types'

const FORMAS: PagamentoMetodo[] = ['pix', 'credito', 'debito', 'dinheiro']

/**
 * "Gerar venda" do atendimento: registra a venda ali mesmo, com o serviço,
 * o profissional e o cliente do agendamento; só falta escolher a forma de
 * pagamento. A venda fica ligada ao agendamento, que vira concluído.
 * Para vender outros itens junto, "Adicionar produtos" abre a tela de
 * Vendas com a comanda já montada.
 */
export default function VendaAgendamentoModal({ agendamento: ag, podeTirarComissao, onClose, onVendido, onAdicionarItens }: {
  agendamento: Agendamento
  podeTirarComissao: boolean
  onClose: () => void
  /** vinculada: o agendamento ficou ligado à venda e concluído. */
  onVendido: (comandaId: string, total: number, vinculada: boolean) => void
  onAdicionarItens: () => void
}) {
  const navigate = useNavigate()
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')
  const [parcelas, setParcelas] = useState(1)
  const [taxas, setTaxas] = useState<TaxasLoja>(TAXAS_VAZIAS)
  useEffect(() => { carregarTaxas().then(setTaxas) }, [])
  const [semComissao, setSemComissao] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const valor = Number(ag.valor ?? ag.servico?.preco ?? 0)
  const quando = new Date(ag.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const semCaixa = /caixa aberto/i.test(erro)

  async function registrar() {
    if (!ag.servico || !ag.servico_id) {
      setErro('Este agendamento não tem serviço. Use "Adicionar produtos ou serviços" para montar a venda.')
      return
    }
    setSalvando(true); setErro('')
    const { data, error } = await supabase.rpc('finalizar_venda', {
      p_cliente_nome: ag.cliente?.nome ?? null,
      p_cliente_id: ag.cliente_id ?? null,
      p_forma_pagamento: pagamento,
      p_itens: [{
        tipo: 'servico', referencia_id: ag.servico_id, nome: ag.servico.nome,
        quantidade: 1, preco_unitario: valor, profissional_id: ag.profissional_id,
      }],
      ...(pagamento === 'credito' && parcelas > 1 ? { p_parcelas: parcelas } : {}),
    })
    if (error || !data) {
      setSalvando(false)
      setErro(error?.message ?? 'Não foi possível registrar a venda.')
      return
    }

    // A venda já está gravada; o que vem abaixo é complemento. Se falhar,
    // avisa sem desfazer a venda.
    const comandaId = data as string
    const avisos: string[] = []
    if (semComissao) {
      const { error: errComissao } = await supabase.from('comissoes').update({ status: 'cancelada' }).eq('comanda_id', comandaId)
      if (errComissao) avisos.push(`não deu para tirar a comissão (${errComissao.message}). Tire pelo card da venda.`)
    }
    const { error: errVinculo } = await supabase.rpc('vincular_venda_agendamento', { p_comanda_id: comandaId, p_agendamento_id: ag.id })
    if (errVinculo) avisos.push(`o agendamento não foi marcado como concluído (${errVinculo.message}). Conclua pela Agenda.`)
    setSalvando(false)
    if (avisos.length > 0) window.alert(`A venda foi registrada, mas ${avisos.join(' Além disso, ')}`)
    onVendido(comandaId, valor, !errVinculo)
  }

  return (
    <ModalFormulario
      tamanho="pequeno"
      icone={<ShoppingCart size={18} />}
      titulo="Gerar venda"
      descricao="Confira o atendimento e escolha a forma de pagamento. O agendamento fica concluído e ligado à venda."
      onClose={onClose}
      onSalvar={registrar}
      salvando={salvando}
      rotuloSalvar="Registrar venda"
      erro={erro}
      autoFocus={false}
    >
      <InfoGrade>
        <Info rotulo="Cliente">{ag.cliente?.nome ?? 'Sem cliente (Balcão)'}</Info>
        <Info rotulo="Horário">{quando}</Info>
        <Info rotulo="Serviço">{ag.servico?.nome}</Info>
        <Info rotulo="Profissional">{ag.profissional?.nome}</Info>
      </InfoGrade>

      <div className="detalhe-total">
        <span>Total a cobrar</span>
        <strong>{formatCurrency(valor)}</strong>
      </div>

      <p className="label" style={{ margin: '20px 0 8px' }}>Forma de pagamento</p>
      <div className="opcoes-grade duas">
        {FORMAS.map(f => (
          <button key={f} type="button" className={`opcao${pagamento === f ? ' marcada' : ''}`} onClick={() => setPagamento(f)} aria-pressed={pagamento === f}>
            <span className="opcao-caixa">{pagamento === f && <Check size={10} strokeWidth={3} />}</span>
            <span style={{ fontSize: '13px', color: 'var(--c-fff)' }}>{PAGAMENTO_LABEL[f]}</span>
          </button>
        ))}
      </div>
      <PagamentoTaxa forma={pagamento} parcelas={parcelas} onParcelas={setParcelas} total={valor} taxas={taxas} />

      {semCaixa && (
        <div className="aviso-info" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 220px' }}>A venda entra no seu caixa. Abra o caixa e depois volte aqui para registrar.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/caixa')}>
            <Wallet size={13} /> Ir para o Caixa
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 16px', flexWrap: 'wrap', marginTop: '16px' }}>
        {podeTirarComissao ? (
          <label className="check-rotulo" title="A venda não gera comissão para ninguém">
            <input type="checkbox" checked={semComissao} onChange={e => setSemComissao(e.target.checked)} />
            Sem comissão nesta venda
          </label>
        ) : <span />}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAdicionarItens} title="Abre a tela de Vendas com esta comanda já montada">
          <Plus size={13} /> Adicionar produtos ou serviços
        </button>
      </div>
    </ModalFormulario>
  )
}
