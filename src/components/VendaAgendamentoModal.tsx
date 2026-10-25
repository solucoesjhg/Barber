import { useEffect, useState } from 'react'
import { Plus, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import ModalFormulario, { Campo } from './ui/ModalFormulario'
import { Info, InfoGrade } from './ui/ModalDetalhe'
import PagamentosEditor, { novaLinhaPagamento, pagamentosPayload, totalCobrado, validarPagamentos, type LinhaPagamento } from './vendas/PagamentosEditor'
import ClienteBusca from './vendas/ClienteBusca'
import { useLoja } from '../hooks/useLoja'
import AbrirCaixaRapido, { ehErroSemCaixa } from './AbrirCaixaRapido'
import { carregarTaxas, TAXAS_VAZIAS, type TaxasLoja } from '../lib/taxas'
import type { Agendamento } from '../types'

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
  // Mesmo editor de pagamento da tela de Vendas: dividir em formas e fiado
  // (parcelado) na conta do cliente.
  const { permitirFiado } = useLoja()
  const [linhas, setLinhas] = useState<LinhaPagamento[]>(() => [novaLinhaPagamento()])
  const [clienteNome, setClienteNome] = useState(ag.cliente?.nome ?? '')
  const [clienteId, setClienteId] = useState<string | null>(ag.cliente_id ?? null)
  const [taxas, setTaxas] = useState<TaxasLoja>(TAXAS_VAZIAS)
  useEffect(() => { carregarTaxas().then(setTaxas) }, [])
  const [semComissao, setSemComissao] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // O valor pode ser ajustado aqui; serviço com valor decidido na venda
  // chega sem valor e precisa ser informado.
  const precoNaVenda = !!ag.servico?.preco_na_venda
  const [valorTexto, setValorTexto] = useState(() => {
    const inicial = ag.valor ?? (precoNaVenda ? null : ag.servico?.preco)
    return inicial != null ? String(Number(inicial)) : ''
  })
  const valor = Math.max(0, Number(valorTexto.replace(',', '.')) || 0)
  const cobrado = totalCobrado(linhas, valor, taxas)
  const temFiado = linhas.some(l => l.forma === 'fiado')
  const quando = new Date(ag.data_hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const semCaixa = ehErroSemCaixa(erro)

  async function registrar() {
    if (!ag.servico || !ag.servico_id) {
      setErro('Este agendamento não tem serviço. Use "Adicionar produtos ou serviços" para montar a venda.')
      return
    }
    if (precoNaVenda && !(valor > 0)) { setErro('Informe o valor do serviço.'); return }
    const erroPag = validarPagamentos(linhas, valor, taxas)
    if (erroPag) { setErro(erroPag); return }
    if (temFiado && !clienteId) { setErro('Venda parcelada precisa de cliente cadastrado: escolha o cliente.'); return }
    setSalvando(true); setErro('')
    const { data, error } = await supabase.rpc('finalizar_venda', {
      p_cliente_nome: clienteNome || null,
      p_cliente_id: clienteId,
      p_forma_pagamento: linhas[0].forma,
      p_itens: [{
        tipo: 'servico', referencia_id: ag.servico_id, nome: ag.servico.nome,
        quantidade: 1, preco_unitario: valor, profissional_id: ag.profissional_id,
      }],
      p_pagamentos: pagamentosPayload(linhas, valor),
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
      tamanho="medio"
      icone={<ShoppingCart size={18} />}
      titulo="Gerar venda"
      descricao="Confira o atendimento e escolha a forma de pagamento. O agendamento fica concluído e ligado à venda."
      onClose={onClose}
      onSalvar={registrar}
      salvando={salvando}
      rotuloSalvar="Registrar venda"
      erro={semCaixa ? '' : erro}
      autoFocus={false}
    >
      <InfoGrade>
        <Info rotulo="Cliente">{ag.cliente?.nome ?? 'Sem cliente (Balcão)'}</Info>
        <Info rotulo="Horário">{quando}</Info>
        <Info rotulo="Serviço">{ag.servico?.nome}</Info>
        <Info rotulo="Profissional">{ag.profissional?.nome}</Info>
      </InfoGrade>

      <div style={{ maxWidth: '260px', marginTop: '16px' }}>
        <Campo rotulo={precoNaVenda ? 'Valor do serviço *' : 'Valor do serviço'}>
          <input
            className="input" type="number" min={0} step={0.01} inputMode="decimal"
            placeholder={precoNaVenda ? 'Informe o valor' : '0,00'}
            value={valorTexto}
            onChange={e => { setValorTexto(e.target.value); setErro('') }}
            autoFocus={precoNaVenda && !valorTexto}
          />
        </Campo>
      </div>

      <div className="detalhe-total">
        <span>Total a cobrar</span>
        <strong>{formatCurrency(cobrado)}</strong>
      </div>

      <div style={{ marginTop: '20px' }}>
        <PagamentosEditor linhas={linhas} onChange={setLinhas} total={valor} taxas={taxas} permitirFiado={permitirFiado} />
        {temFiado && !ag.cliente_id && (
          <div className="field" style={{ marginTop: '12px' }}>
            <label className="label">Cliente do parcelado * (cadastrado)</label>
            <ClienteBusca nome={clienteNome} clienteId={clienteId} onChange={(n, id) => { setClienteNome(n); setClienteId(id); setErro('') }} placeholder="Digite para buscar o cliente" exigirCadastro />
          </div>
        )}
      </div>

      {semCaixa && (
        <div style={{ marginTop: '16px' }}>
          <AbrirCaixaRapido onAberto={() => { setErro(''); registrar() }} />
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
