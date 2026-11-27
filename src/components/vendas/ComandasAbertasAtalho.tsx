import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ChevronRight, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency } from '../../lib/utils'
import ModalDetalhe from '../ui/ModalDetalhe'

interface ComandaResumo {
  id: string
  cliente_nome: string | null
  created_at: string
  itens: { nome: string; quantidade: number; preco_unitario: number }[]
}

function haQuanto(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h${min % 60 ? ` ${min % 60}min` : ''}`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/**
 * Atalho "Comandas abertas": mostra quantas estão abertas e, ao clicar,
 * a lista só delas (cliente, itens, total). Escolher uma abre a comanda
 * na tela de Vendas, pronta para continuar ou fechar.
 */
export default function ComandasAbertasAtalho() {
  const navigate = useNavigate()
  const [lista, setLista] = useState<ComandaResumo[] | null>(null)
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(() => {
    supabase.from('comandas')
      .select('id, cliente_nome, created_at, itens:itens_comanda(nome, quantidade, preco_unitario)')
      .eq('status', 'aberta').order('created_at')
      .then(({ data, error }) => { if (!error) setLista((data ?? []) as unknown as ComandaResumo[]) })
  }, [])

  useEffect(() => {
    carregar()
    const id = window.setInterval(carregar, 60 * 1000)
    return () => window.clearInterval(id)
  }, [carregar])

  const qtd = lista?.length ?? 0
  const totalDe = (c: ComandaResumo) => c.itens.reduce((s, i) => s + Number(i.preco_unitario) * i.quantidade, 0)

  return (
    <>
      <button
        type="button" className="btn btn-secondary agenda-topo-btn"
        onClick={() => { carregar(); setAberto(true) }}
        title="Comandas que ainda não foram fechadas"
      >
        <Receipt size={13} /> Comandas abertas
        <span className={`comandas-qtd${qtd > 0 ? ' tem' : ''}`}>{qtd}</span>
      </button>

      <AnimatePresence>
        {aberto && (
          <ModalDetalhe
            icone={<Receipt size={18} />}
            titulo="Comandas abertas"
            subtitulo={<span>{qtd === 0 ? 'Nenhuma aberta agora' : `${qtd} ${qtd === 1 ? 'comanda' : 'comandas'} · toque para abrir`}</span>}
            onClose={() => setAberto(false)}
            largura={560}
          >
            {lista === null ? (
              <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '24px 0', textAlign: 'center' }}>Carregando...</p>
            ) : qtd === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '24px 0', textAlign: 'center' }}>
                Nenhuma comanda aberta. Para deixar uma aberta, use "Deixar aberta" na venda.
              </p>
            ) : (
              <div className="comandas-lista">
                {lista.map(c => (
                  <button key={c.id} type="button" className="comanda-linha" onClick={() => { setAberto(false); navigate(`/vendas?comanda=${c.id}`) }}>
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <span className="texto-cortado" style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)' }}>
                        {c.cliente_nome && c.cliente_nome !== 'Balcão' ? c.cliente_nome : 'Balcão'}
                      </span>
                      <span className="subtexto texto-cortado" style={{ display: 'block' }}>
                        {c.itens.length ? c.itens.map(i => `${i.quantidade > 1 ? `${i.quantidade}× ` : ''}${i.nome}`).join(', ') : 'Sem itens'} · {haQuanto(c.created_at)}
                      </span>
                    </span>
                    <strong className="valor-num" style={{ fontSize: '14px', color: 'var(--c-fff)', flexShrink: 0 }}>{formatCurrency(totalDe(c))}</strong>
                    <ChevronRight size={14} style={{ color: 'var(--c-55)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
          </ModalDetalhe>
        )}
      </AnimatePresence>
    </>
  )
}
