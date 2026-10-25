import { useCallback, useEffect, useState } from 'react'
import { Package, Scissors, Trash2, Pencil, X, ShoppingCart, CalendarDays, Percent } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateTime } from '../lib/utils'
import { carregarNomesUsuarios } from '../lib/usuarios'
import { usePermissoes } from '../hooks/usePermissoes'
import { formatarPercentual, rotuloPagamento, rotuloPagamentos } from '../lib/taxas'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from './ui/ModalDetalhe'
import type { Comanda, ItemComanda, PagamentoComanda } from '../types'

export const PAGAMENTO_LABEL: Record<string, string> = {
  pix: 'Pix', credito: 'Cartão Crédito', debito: 'Cartão Débito', dinheiro: 'Dinheiro', fiado: 'Fiado',
}
const STATUS_LABEL: Record<string, string> = { fechada: 'Fechada', cancelada: 'Cancelada', aberta: 'Aberta' }

type ItemDetalhe = ItemComanda & { profissional?: { nome: string } | null }

interface ComissaoDetalhe {
  id: string
  valor_comissao: number
  percentual: number
  valor_base: number
  taxa_valor?: number | null
  status: string
  profissional_id: string | null
  item_comanda_id?: string | null
  usuario_id: string | null
  profissional?: { nome: string } | null
}

/** O que a tela de Vendas recebe para abrir a venda em modo edição. */
export interface VendaParaEditar {
  comanda: Comanda
  itens: ItemComanda[]
  /** A venda está sem comissão (foi tirada): a edição mantém assim. */
  semComissao: boolean
  /** Formas de pagamento da venda (vazio em vendas antigas). */
  pagamentos?: PagamentoComanda[]
}

/**
 * Card de uma venda: itens (com o profissional de cada um), pagamento,
 * quem registrou e as comissões geradas.
 * - onEditar: mostra "Editar venda" (só administrador/gerente);
 * - quem edita Comissões pode tirar a comissão da venda aqui;
 * - onDelete: "Excluir lançamento" (usado no Financeiro).
 */
export default function VendaDetalheModal({ comandaId, onClose, onDelete, destacarProfissionalId, onEditar, onAlterado }: {
  comandaId: string
  onClose: () => void
  onDelete?: () => Promise<void> | void
  /** Profissional do usuário logado: os itens dele aparecem destacados. */
  destacarProfissionalId?: string | null
  onEditar?: (venda: VendaParaEditar) => void
  /** Chamado depois de tirar comissão (a tela de origem recarrega). */
  onAlterado?: () => void
}) {
  const { podeEditar, podeEditarVendas } = usePermissoes()
  const podeTirarComissao = podeEditar('comissoes')
  const [comanda, setComanda] = useState<Comanda | null>(null)
  const [nomeMaquininha, setNomeMaquininha] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemDetalhe[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoComanda[]>([])
  const [comissoes, setComissoes] = useState<ComissaoDetalhe[]>([])
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [excluindo, setExcluindo] = useState(false)
  const [salvandoComissao, setSalvandoComissao] = useState(false)
  const [error, setError] = useState('')

  const carregarComissoes = useCallback(async () => {
    const { data } = await supabase
      .from('comissoes')
      .select('id, valor_comissao, percentual, valor_base, taxa_valor, status, profissional_id, item_comanda_id, usuario_id, profissional:profissionais(nome)')
      .eq('comanda_id', comandaId)
      .order('created_at')
    return (data ?? []) as unknown as ComissaoDetalhe[]
  }, [comandaId])

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    Promise.all([
      supabase.from('comandas').select('*').eq('id', comandaId).maybeSingle(),
      // custo_unitario não é legível pela API (privilégio de coluna)
      supabase.from('itens_comanda').select('id, comanda_id, tipo, referencia_id, nome, quantidade, preco_unitario, profissional_id, profissional:profissionais(nome)').eq('comanda_id', comandaId),
      carregarComissoes(),
      carregarNomesUsuarios(),
      // Sem a migração de pagamento dividido a tabela não existe: segue sem.
      supabase.from('comanda_pagamentos').select('forma, valor, parcelas, maquininha_id, taxa_percentual, taxa_valor, acrescimo, cobrado').eq('comanda_id', comandaId).order('created_at'),
    ]).then(async ([{ data: comandaData }, { data: itensData }, comissoesData, nomesData, { data: pagsData }]) => {
      if (cancelado) return
      const itensCarregados = (itensData ?? []) as unknown as ItemDetalhe[]
      const idsProdutos = [...new Set(itensCarregados.filter(i => i.tipo === 'produto').map(i => i.referencia_id))]
      let mapaFotos: Record<string, string> = {}
      if (idsProdutos.length > 0) {
        const { data: produtosData } = await supabase.from('produtos').select('id, foto_url').in('id', idsProdutos)
        mapaFotos = Object.fromEntries(
          ((produtosData ?? []) as { id: string; foto_url: string | null }[])
            .filter(p => p.foto_url)
            .map(p => [p.id, p.foto_url as string])
        )
      }
      if (cancelado) return
      setComanda((comandaData ?? null) as Comanda | null)
      const maqId = (comandaData as Comanda | null)?.maquininha_id
      if (maqId) {
        supabase.from('maquininhas').select('nome').eq('id', maqId).maybeSingle()
          .then(({ data }) => { if (!cancelado) setNomeMaquininha((data as { nome: string } | null)?.nome ?? null) })
      }
      setItens(itensCarregados)
      setPagamentos((pagsData ?? []) as PagamentoComanda[])
      setComissoes(comissoesData)
      setNomes(nomesData)
      setFotos(mapaFotos)
      setLoading(false)
    })
    return () => { cancelado = true }
  }, [comandaId, carregarComissoes])

  const total = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)
  const ativas = comissoes.filter(c => c.status !== 'cancelada')
  const retiradas = comissoes.length - ativas.length
  const totalComissoes = ativas.reduce((s, c) => s + Number(c.valor_comissao), 0)
  // Comissão aparece no próprio item; as que não são de um item (comissão
  // da venda para o usuário) ficam numa linha embaixo do total.
  const comissoesDoItem = (itemId: string) => ativas.filter(c => c.item_comanda_id === itemId)
  const idsItens = new Set(itens.map(i => i.id))
  const comissoesAvulsas = ativas.filter(c => !c.item_comanda_id || !idsItens.has(c.item_comanda_id))

  async function handleExcluir() {
    if (!onDelete) return
    if (!window.confirm('Excluir o lançamento financeiro dessa venda? Isso não desfaz a venda nem devolve o estoque, só remove o lançamento.')) return
    setExcluindo(true); setError('')
    try {
      await onDelete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir.')
      setExcluindo(false)
    }
  }

  async function tirarComissao(ids: string[]) {
    if (ids.length === 0 || salvandoComissao) return
    const msg = ids.length === ativas.length
      ? 'Tirar a comissão desta venda? Ela deixa de aparecer em Comissões e nos relatórios.'
      : 'Tirar esta comissão da venda?'
    if (!window.confirm(msg)) return
    setSalvandoComissao(true); setError('')
    const { error: err } = await supabase.from('comissoes').update({ status: 'cancelada' }).in('id', ids)
    if (err) { setError(err.message); setSalvandoComissao(false); return }
    setComissoes(await carregarComissoes())
    setSalvandoComissao(false)
    onAlterado?.()
  }

  function nomeComissao(c: ComissaoDetalhe): string {
    if (c.profissional?.nome) return c.profissional.nome
    if (c.usuario_id) return `${nomes[c.usuario_id] ?? 'Usuário'} · comissão da venda`
    return '—'
  }

  const podeAbrirEdicao = !!onEditar && podeEditarVendas && comanda?.status === 'fechada'

  return (
    <ModalDetalhe
      icone={<ShoppingCart size={18} />}
      titulo={comanda ? (comanda.cliente_nome || 'Balcão') : 'Venda'}
      subtitulo={comanda && (
        <>
          <span>{formatDateTime(comanda.created_at ?? comanda.data)}</span>
          {comanda.status !== 'fechada' && (
            <span className={comanda.status === 'cancelada' ? 'badge badge-canceled' : 'badge badge-pending'}>
              {STATUS_LABEL[comanda.status] ?? comanda.status}
            </span>
          )}
        </>
      )}
      onClose={onClose}
      acoes={!loading && (podeAbrirEdicao || onDelete) ? (
        <>
          {podeAbrirEdicao && comanda && (
            <button
              className="btn btn-primary"
              onClick={() => onEditar!({ comanda, itens, semComissao: ativas.length === 0 && retiradas > 0, pagamentos })}
            >
              <Pencil size={13} /> Editar venda
            </button>
          )}
          {onDelete && (
            <button className="btn btn-secondary" style={{ color: 'var(--c-a3)' }} onClick={handleExcluir} disabled={excluindo}>
              <Trash2 size={13} /> {excluindo ? 'Excluindo...' : 'Excluir lançamento'}
            </button>
          )}
        </>
      ) : undefined}
    >
      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '32px 0', textAlign: 'center' }}>Carregando...</p>
      ) : !comanda ? (
        <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '32px 0', textAlign: 'center' }}>Venda não encontrada ou sem permissão para ver.</p>
      ) : (
        <>
          <InfoGrade>
            <Info rotulo="Pagamento">{pagamentos.length > 1 ? rotuloPagamentos(pagamentos) : comanda.forma_pagamento ? rotuloPagamento(comanda.forma_pagamento, comanda.parcelas, nomeMaquininha) : undefined}</Info>
            <Info rotulo="Registrada por">{comanda.usuario_id ? nomes[comanda.usuario_id] : undefined}</Info>
            {comanda.agendamento_id && (
              <Info rotulo="Origem" largo>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CalendarDays size={12} style={{ color: 'var(--c-66)' }} /> Gerada por um atendimento da Agenda
                </span>
              </Info>
            )}
          </InfoGrade>

          <SecaoDetalhe
            titulo={`Itens (${itens.length})${ativas.length > 0 ? ` · comissões ${formatCurrency(totalComissoes)}` : retiradas > 0 ? ' · comissão retirada' : ''}`}
            acao={podeTirarComissao && ativas.length > 0 ? (
              <button className="btn btn-ghost btn-sm" onClick={() => tirarComissao(ativas.map(c => c.id))} disabled={salvandoComissao} style={{ textTransform: 'none', letterSpacing: 0 }}>
                Tirar comissão da venda
              </button>
            ) : undefined}
          >
            {itens.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhum item encontrado.</p>
            ) : (
              <div className="detalhe-lista">
                {itens.map(item => {
                  const foto = item.tipo === 'produto' ? fotos[item.referencia_id] : undefined
                  const meu = !!destacarProfissionalId && item.profissional_id === destacarProfissionalId
                  return (
                    <div key={item.id} className="detalhe-lista-item" style={{
                      background: meu ? 'rgba(var(--ink),0.08)' : undefined,
                      borderColor: meu ? 'rgba(var(--ink),0.35)' : undefined,
                      opacity: destacarProfissionalId && !meu ? 0.6 : 1,
                    }}>
                      {foto ? (
                        <img src={foto} alt="" style={{ width: '30px', height: '30px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--c-2a)' }} />
                      ) : (
                        <div style={{ width: '30px', height: '30px', borderRadius: '6px', background: 'var(--c-1f)', border: '1px solid var(--c-2a)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {item.tipo === 'servico' ? <Scissors size={13} style={{ color: 'var(--c-55)' }} /> : <Package size={13} style={{ color: 'var(--c-55)' }} />}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {item.nome}
                          {meu && <span className="badge badge-confirmed">Seu</span>}
                        </p>
                        <p className="subtexto">
                          {item.quantidade}x {formatCurrency(item.preco_unitario)}{item.profissional?.nome ? ` · ${item.profissional.nome}` : ''}
                        </p>
                        {comissoesDoItem(item.id).map(c => (
                          <LinhaComissao key={c.id} comissao={c} podeTirar={podeTirarComissao} salvando={salvandoComissao} onTirar={() => tirarComissao([c.id])} />
                        ))}
                      </div>
                      <span className="valor-num" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-a3)', flexShrink: 0 }}>
                        {formatCurrency(item.preco_unitario * item.quantidade)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {Number(comanda.desconto ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', marginTop: '10px', padding: '0 4px', color: 'var(--c-77)' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Itens</span><span className="valor-num">{formatCurrency(total)}</span></span>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>Desconto</span><span className="valor-num">− {formatCurrency(Number(comanda.desconto))}</span></span>
              </div>
            )}
            <div className="detalhe-total">
              <span>Total</span>
              <strong>{formatCurrency(comanda.total ?? total)}</strong>
            </div>
            {pagamentos.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', marginTop: '8px', padding: '0 4px' }}>
                {pagamentos.map((pg, i) => (
                  <span key={i} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-a3)' }}>
                    <span>{rotuloPagamento(pg.forma, pg.parcelas)}{Number(pg.acrescimo ?? 0) > 0 ? ` (+ ${formatCurrency(Number(pg.acrescimo))} de taxa repassada)` : ''}</span>
                    <span className="valor-num">{formatCurrency(Number(pg.cobrado ?? pg.valor))}</span>
                  </span>
                ))}
              </div>
            )}
            {Number(comanda.taxa_valor ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', marginTop: '8px', padding: '0 4px' }}>
                {Number(comanda.acrescimo ?? 0) > 0 && (
                  <>
                    <span style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-77)' }}>
                      <span>Taxa repassada ao cliente</span>
                      <span className="valor-num">+ {formatCurrency(Number(comanda.acrescimo))}</span>
                    </span>
                    <span style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-a3)' }}>
                      <span>Cliente pagou</span>
                      <span className="valor-num">{formatCurrency(Number(comanda.total) + Number(comanda.acrescimo))}</span>
                    </span>
                  </>
                )}
                <span style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-77)' }}>
                  <span>Taxa da maquininha ({formatarPercentual(Number(comanda.taxa_percentual ?? 0))})</span>
                  <span className="valor-num">− {formatCurrency(Number(comanda.taxa_valor))}</span>
                </span>
                <span style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--c-a3)', fontWeight: 600 }}>
                  <span>Líquido para a loja</span>
                  <span className="valor-num">{formatCurrency(Number(comanda.total) + Number(comanda.acrescimo ?? 0) - Number(comanda.taxa_valor))}</span>
                </span>
              </div>
            )}
            {comissoesAvulsas.length > 0 && (
              <div style={{ marginTop: '10px', padding: '0 4px' }}>
                {comissoesAvulsas.map(c => (
                  <LinhaComissao key={c.id} comissao={c} rotulo={nomeComissao(c)} podeTirar={podeTirarComissao} salvando={salvandoComissao} onTirar={() => tirarComissao([c.id])} />
                ))}
              </div>
            )}
          </SecaoDetalhe>

          {error && <p className="aviso-erro" style={{ marginTop: '14px' }}>{error}</p>}
        </>
      )}
    </ModalDetalhe>
  )
}

/** Linha compacta da comissão dentro do item: "Comissão R$ 30,00 · 100% de R$ 30,00  ×". */
function LinhaComissao({ comissao: c, rotulo, podeTirar, salvando, onTirar }: {
  comissao: ComissaoDetalhe
  rotulo?: string
  podeTirar: boolean
  salvando: boolean
  onTirar: () => void
}) {
  const taxa = Number(c.taxa_valor ?? 0)
  return (
    <p className="linha-comissao">
      <Percent size={10} />
      <span>
        {rotulo ? `${rotulo}: ` : 'Comissão '}
        <strong>{formatCurrency(Number(c.valor_comissao))}</strong>
        {' · '}{Number(c.percentual)}% de {formatCurrency(Number(c.valor_base))}
        {taxa > 0 && ` (sem a taxa de ${formatCurrency(taxa)})`}
      </span>
      {podeTirar && (
        <button type="button" title="Tirar esta comissão" aria-label="Tirar esta comissão" onClick={onTirar} disabled={salvando}>
          <X size={10} />
        </button>
      )}
    </p>
  )
}
