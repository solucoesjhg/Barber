import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { CategoriaFinanceira } from '../../types'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Conta analítica do plano de contas (Água, Luz, Aluguel...) para um
 * lançamento: digita e escolhe nas sugestões, ou abre a lista completa
 * no "⋯". Saída mostra contas de despesa e entrada as de receita; as
 * sintéticas só agrupam (não recebem lançamento).
 */
export default function SeletorConta({ tipo, valor, onChange, vazio = 'Digite para buscar a conta...' }: {
  tipo: 'entrada' | 'saida'
  valor: string
  onChange: (id: string) => void
  vazio?: string
}) {
  const [categorias, setCategorias] = useState<CategoriaFinanceira[] | null>(null)
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  const [janela, setJanela] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const tipoConta = tipo === 'saida' ? 'despesa' : 'receita'

  useEffect(() => {
    let ativo = true
    supabase.from('categorias_financeiras').select('*').eq('tipo', tipoConta).eq('ativo', true)
      .then(({ data }) => { if (ativo) setCategorias(((data ?? []) as CategoriaFinanceira[]).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))) })
    return () => { ativo = false }
  }, [tipoConta])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (!caixaRef.current?.contains(alvo) && !listaRef.current?.contains(alvo)) setAberto(false)
    }
    // A lista flutua fora do modal (não é cortada pela rolagem dele).
    const posicionar = () => {
      const r = caixaRef.current?.getBoundingClientRect()
      if (r) setPos({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    posicionar()
    document.addEventListener('mousedown', fora)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [aberto])

  const lista = useMemo(() => categorias ?? [], [categorias])
  const nomePai = (id?: string) => (id ? lista.find(c => c.id === id)?.nome : undefined)
  const analiticas = useMemo(() => {
    const idsPai = new Set(lista.map(c => c.categoria_pai_id).filter(Boolean))
    return lista.filter(c => !idsPai.has(c.id))
  }, [lista])
  const escolhida = analiticas.find(c => c.id === valor)

  const sugestoes = useMemo(() => {
    const t = semAcento(texto.trim())
    const nomeGrupo = (c: CategoriaFinanceira) => semAcento(lista.find(p => p.id === c.categoria_pai_id)?.nome ?? '')
    return (t ? analiticas.filter(c => semAcento(c.nome).includes(t) || nomeGrupo(c).includes(t)) : analiticas).slice(0, 8)
  }, [texto, analiticas, lista])

  function escolher(id: string) {
    onChange(id)
    setTexto(''); setAberto(false); setJanela(false)
  }

  return (
    <div ref={caixaRef} className="seletor-conta">
      <div style={{ display: 'flex', gap: '6px' }}>
        {escolhida ? (
          <div className="input seletor-conta-escolhida">
            <span className="texto-cortado">
              {escolhida.categoria_pai_id && <span className="subtexto">{nomePai(escolhida.categoria_pai_id)} › </span>}
              {escolhida.nome}
            </span>
            <button type="button" aria-label="Limpar conta" onClick={() => onChange('')}><X size={12} /></button>
          </div>
        ) : (
          <input
            className="input" style={{ flex: 1, minWidth: 0 }}
            placeholder={categorias ? vazio : 'Carregando...'} disabled={!categorias}
            value={texto}
            onChange={e => { setTexto(e.target.value); setAberto(true); setMarcado(0) }}
            onFocus={() => setAberto(true)}
            onKeyDown={e => {
              if (!aberto || sugestoes.length === 0) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado(m => Math.min(m + 1, sugestoes.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado(m => Math.max(m - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); escolher(sugestoes[marcado].id) }
              else if (e.key === 'Escape') { e.stopPropagation(); setAberto(false) }
            }}
            aria-autocomplete="list"
          />
        )}
        <button type="button" className="btn btn-icon" title="Ver todas as contas" aria-label="Ver todas as contas" onClick={() => { setAberto(false); setJanela(true) }} disabled={!categorias} style={{ width: '38px', height: '38px', flexShrink: 0 }}>
          <MoreHorizontal size={15} />
        </button>
      </div>
      {aberto && !escolhida && pos && (sugestoes.length > 0 || texto.trim()) && createPortal(
        <div ref={listaRef} className="cliente-busca-lista seletor-conta-lista" role="listbox" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {sugestoes.length === 0 && <p className="subtexto" style={{ padding: '8px 10px' }}>Nenhuma conta com “{texto.trim()}”.</p>}
          {sugestoes.map((c, i) => (
            <button key={c.id} type="button" role="option" aria-selected={i === marcado} className={i === marcado ? 'marcado' : undefined}
              onMouseDown={e => { e.preventDefault(); escolher(c.id) }}>
              <span className="texto-cortado">{c.nome}</span>
              {c.categoria_pai_id && <span className="subtexto">{nomePai(c.categoria_pai_id)}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
      {janela && createPortal(
        <JanelaContas lista={lista} tipo={tipo} valor={valor} onEscolher={escolher} onClose={() => setJanela(false)} />,
        document.body,
      )}
    </div>
  )
}

/** Todas as contas, agrupadas pela sintética, com busca. */
function JanelaContas({ lista, tipo, valor, onEscolher, onClose }: {
  lista: CategoriaFinanceira[]
  tipo: 'entrada' | 'saida'
  valor: string
  onEscolher: (id: string) => void
  onClose: () => void
}) {
  const [busca, setBusca] = useState('')

  useEffect(() => {
    // Captura o Esc antes do modal de baixo, para fechar só esta janela.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])

  const t = semAcento(busca.trim())
  const idsPai = new Set(lista.map(c => c.categoria_pai_id).filter(Boolean))
  const bate = (c: CategoriaFinanceira) => !t || semAcento(c.nome).includes(t)
  const grupos = [
    ...lista.filter(c => idsPai.has(c.id)).map(s => ({
      nome: s.nome,
      contas: lista.filter(c => c.categoria_pai_id === s.id && (bate(c) || semAcento(s.nome).includes(t))),
    })),
    { nome: idsPai.size ? 'Outras' : '', contas: lista.filter(c => !c.categoria_pai_id && !idsPai.has(c.id) && bate(c)) },
  ].filter(g => g.contas.length > 0)

  return (
    <div className="seletor-conta-fundo" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="seletor-conta-janela" role="dialog" aria-label="Escolher conta">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)' }}>{tipo === 'saida' ? 'Conta de despesa' : 'Conta de receita'}</p>
          <button type="button" className="btn btn-icon" aria-label="Fechar" onClick={onClose} style={{ width: '30px', height: '30px' }}><X size={13} /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-55)' }} />
          <input className="input" autoFocus placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: '30px' }}
            onKeyDown={e => { if (e.key === 'Enter') { const p = grupos[0]?.contas[0]; if (p) { e.preventDefault(); onEscolher(p.id) } } }} />
        </div>
        <div className="seletor-conta-grupos">
          {grupos.length === 0 && <p className="subtexto" style={{ padding: '12px 0' }}>Nenhuma conta encontrada.</p>}
          {grupos.map(g => (
            <div key={g.nome || 'contas'}>
              {g.nome && <p className="seletor-conta-grupo">{g.nome}</p>}
              <div className="seletor-conta-chips">
                {g.contas.map(c => (
                  <button key={c.id} type="button" className={`pilula${c.id === valor ? ' ativa' : ''}`} onClick={() => onEscolher(c.id)}>{c.nome}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="subtexto">Para criar ou agrupar contas, use a tela de Categorias.</p>
      </div>
    </div>
  )
}
