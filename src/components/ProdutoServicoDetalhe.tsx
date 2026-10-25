import { useEffect, useState } from 'react'
import { useLoja } from '../hooks/useLoja'
import { Package, Scissors, Pencil, Tag, Image as ImageIcon, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDateTime } from '../lib/utils'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from './ui/ModalDetalhe'
import type { MovimentacaoEstoque, Produto, Servico } from '../types'

export const CATEGORIA_PRODUTO_LABEL: Record<string, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

const MOVIMENTO_LABEL: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', perda: 'Perda',
  devolucao: 'Devolução', venda: 'Venda', inventario: 'Inventário',
}

/** Card de um produto: foto, preços, estoque, comissão e as últimas movimentações. */
export function ProdutoDetalheModal({ produto: p, verCusto, podeEditar, onClose, onEditar, onFotos, onEtiqueta }: {
  produto: Produto
  verCusto: boolean
  podeEditar: boolean
  onClose: () => void
  onEditar: () => void
  onFotos: () => void
  onEtiqueta: () => void
}) {
  const [movimentos, setMovimentos] = useState<MovimentacaoEstoque[] | null>(null)

  useEffect(() => {
    supabase.from('movimentacoes_estoque').select('id, produto_id, tipo, quantidade, motivo, created_at')
      .eq('produto_id', p.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setMovimentos((data ?? []) as MovimentacaoEstoque[]))
  }, [p.id])

  const { controlaEstoqueMinimo } = useLoja()
  const baixo = controlaEstoqueMinimo && p.estoque_atual <= p.estoque_minimo
  const margem = verCusto && p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo) * 100 : null

  return (
    <ModalDetalhe
      icone={p.foto_url ? <img src={p.foto_url} alt="" /> : <Package size={18} />}
      titulo={p.nome}
      subtitulo={<>
        <span>{CATEGORIA_PRODUTO_LABEL[p.categoria] ?? p.categoria}</span>
        {p.sku && <span>#{p.sku}</span>}
        <span className={`status-pill${p.ativo ? '' : ' inativo'}`}>{p.ativo ? 'Ativo' : 'Inativo'}</span>
      </>}
      onClose={onClose}
      acoes={
        <>
          <button className="btn btn-secondary" onClick={onFotos}><ImageIcon size={13} /> Fotos</button>
          {podeEditar && <button className="btn btn-secondary" onClick={onEtiqueta}><Tag size={13} /> Etiqueta</button>}
          {podeEditar && <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar</button>}
        </>
      }
    >
      <InfoGrade>
        <Info rotulo="Preço de venda">{formatCurrency(p.preco_venda)}</Info>
        {verCusto && <Info rotulo="Custo">{formatCurrency(p.preco_custo)}</Info>}
        {verCusto && <Info rotulo="Margem">{margem != null ? `${margem.toFixed(0)}%` : undefined}</Info>}
        <Info rotulo="Comissão">{p.comissao_percentual != null ? `${p.comissao_percentual}%` : 'Usa a do profissional'}</Info>
        <Info rotulo="Estoque atual">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: baixo ? 700 : 400 }}>
            {p.estoque_atual} {p.unidade}
            {baixo && <><AlertTriangle size={12} style={{ color: 'var(--c-88)' }} /><span style={{ fontSize: '11px', color: 'var(--c-88)', fontWeight: 400 }}>abaixo do mínimo</span></>}
          </span>
        </Info>
        {controlaEstoqueMinimo && <Info rotulo="Mínimo / Máximo">{`${p.estoque_minimo} / ${p.estoque_maximo ?? '—'}`}</Info>}
      </InfoGrade>

      <SecaoDetalhe titulo="Últimas movimentações">
        {movimentos === null ? (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Carregando...</p>
        ) : movimentos.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhuma movimentação registrada.</p>
        ) : (
          <div className="detalhe-lista">
            {movimentos.map(m => (
              <div key={m.id} className="detalhe-lista-item">
                <span style={{ width: '84px', color: 'var(--c-fff)', flexShrink: 0 }}>{MOVIMENTO_LABEL[m.tipo] ?? m.tipo}</span>
                <span className="texto-cortado" style={{ flex: 1 }}>{m.motivo ?? '—'}</span>
                <span style={{ color: 'var(--c-66)', flexShrink: 0 }}>{formatDateTime(m.created_at)}</span>
                <span className="valor-num" style={{ width: '44px', textAlign: 'right', color: m.quantidade < 0 ? 'var(--c-a3)' : 'var(--c-fff)', flexShrink: 0 }}>
                  {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                </span>
              </div>
            ))}
          </div>
        )}
      </SecaoDetalhe>
    </ModalDetalhe>
  )
}

/** Card de um serviço: preço, duração, comissão, descrição e quem faz. */
export function ServicoDetalheModal({ servico: s, podeEditar, onClose, onEditar }: {
  servico: Servico
  podeEditar: boolean
  onClose: () => void
  onEditar: () => void
}) {
  return (
    <ModalDetalhe
      icone={<Scissors size={18} />}
      titulo={s.nome}
      subtitulo={<>
        {s.categoria && <span>{s.categoria}</span>}
        <span className={`status-pill${s.ativo ? '' : ' inativo'}`}>{s.ativo ? 'Ativo' : 'Inativo'}</span>
      </>}
      onClose={onClose}
      acoes={podeEditar ? <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar</button> : undefined}
    >
      <InfoGrade>
        <Info rotulo="Preço">{s.preco_na_venda ? `Definido na venda${s.preco > 0 ? ` (referência ${formatCurrency(s.preco)})` : ''}` : formatCurrency(s.preco)}</Info>
        <Info rotulo="Duração">{`${s.duracao_minutos} min`}</Info>
        <Info rotulo="Comissão">{s.comissao_percentual != null ? `${s.comissao_percentual}%` : 'Usa a do profissional'}</Info>
        <Info rotulo="Categoria">{s.categoria}</Info>
        <Info rotulo="Descrição" largo>{s.descricao}</Info>
      </InfoGrade>

      <SecaoDetalhe titulo={`Profissionais (${s.profissionais?.length ?? 0})`}>
        {s.profissionais && s.profissionais.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {s.profissionais.map(p => (
              <span key={p.id} style={{ fontSize: '12px', color: 'var(--c-a3)', background: 'rgba(var(--ink),0.05)', border: '1px solid var(--c-2a)', borderRadius: '99px', padding: '3px 10px' }}>
                {p.nome}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhum profissional vinculado.</p>
        )}
      </SecaoDetalhe>
    </ModalDetalhe>
  )
}
