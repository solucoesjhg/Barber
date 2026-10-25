import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Search, X } from 'lucide-react'

export interface OpcaoBusca {
  id: string
  nome: string
  /** Linha de baixo (telefone, preço...): também entra na busca. */
  detalhe?: string | null
  /** Agrupa na janela do "⋯" (ex.: conta sintética). */
  grupo?: string | null
}

export const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const bate = (o: OpcaoBusca, termo: string) =>
  !termo || semAcento(`${o.nome} ${o.detalhe ?? ''} ${o.grupo ?? ''}`).includes(termo)
  || (/\d/.test(termo) && (o.detalhe ?? '').replace(/\D/g, '').includes(termo.replace(/\D/g, '')))

/**
 * Campo de escolher cliente, profissional, produto, conta...: digita e
 * ele sugere; o "⋯" abre a lista completa com busca. O escolhido fica
 * no campo com um "×" para trocar.
 */
export default function CampoBusca({ opcoes, valor, onChange, placeholder = 'Digite para buscar...', titulo = 'Escolher', permitirLimpar = true, compacto = false, disabled = false, destacarVazio = false, carregando = false }: {
  opcoes: OpcaoBusca[]
  valor: string
  onChange: (id: string) => void
  placeholder?: string
  /** Título da janela do "⋯". */
  titulo?: string
  permitirLimpar?: boolean
  /** Versão menor (dentro do item da comanda). */
  compacto?: boolean
  disabled?: boolean
  /** Borda tracejada quando está vazio (campo que precisa ser preenchido). */
  destacarVazio?: boolean
  carregando?: boolean
}) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  const [janela, setJanela] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const escolhida = opcoes.find(o => o.id === valor)
  const sugestoes = useMemo(() => {
    const t = semAcento(texto.trim())
    return opcoes.filter(o => bate(o, t)).slice(0, 8)
  }, [texto, opcoes])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (!caixaRef.current?.contains(alvo) && !listaRef.current?.contains(alvo)) setAberto(false)
    }
    // A lista flutua por cima de tudo (não é cortada pela rolagem do modal).
    const posicionar = () => {
      const r = caixaRef.current?.getBoundingClientRect()
      if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) })
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

  function escolher(id: string) {
    onChange(id)
    setTexto(''); setAberto(false); setJanela(false)
  }

  const altura = compacto ? '30px' : '38px'
  const classe = `input${compacto ? ' campo-busca-compacto' : ''}${destacarVazio && !escolhida ? ' campo-busca-vazio' : ''}`

  return (
    <div ref={caixaRef} className="campo-busca">
      <div style={{ display: 'flex', gap: compacto ? '4px' : '6px' }}>
        {escolhida ? (
          <div className={`${classe} campo-busca-escolhida`} style={{ minHeight: altura }} aria-disabled={disabled}>
            <span className="texto-cortado">
              {escolhida.grupo && <span className="subtexto">{escolhida.grupo} › </span>}
              {escolhida.nome}
            </span>
            {permitirLimpar && !disabled && (
              <button type="button" aria-label="Limpar" onClick={() => { onChange(''); setTimeout(() => inputRef.current?.focus(), 0) }}><X size={compacto ? 10 : 12} /></button>
            )}
          </div>
        ) : (
          <input
            ref={inputRef} className={classe} style={{ flex: 1, minWidth: 0, minHeight: altura }}
            placeholder={carregando ? 'Carregando...' : placeholder} disabled={disabled || carregando}
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
        {!disabled && (
          <button type="button" className="btn btn-icon" title={`Ver todos: ${titulo.toLowerCase()}`} aria-label={`Ver todos: ${titulo.toLowerCase()}`}
            onClick={() => { setAberto(false); setJanela(true) }} disabled={carregando}
            style={{ width: altura, height: altura, flexShrink: 0 }}>
            <MoreHorizontal size={compacto ? 12 : 15} />
          </button>
        )}
      </div>
      {aberto && !escolhida && pos && (sugestoes.length > 0 || texto.trim()) && createPortal(
        <div ref={listaRef} className="cliente-busca-lista campo-busca-lista" role="listbox" style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {sugestoes.length === 0 && <p className="subtexto" style={{ padding: '8px 10px' }}>Nada encontrado com “{texto.trim()}”.</p>}
          {sugestoes.map((o, i) => (
            <button key={o.id} type="button" role="option" aria-selected={i === marcado} className={i === marcado ? 'marcado' : undefined}
              onMouseDown={e => { e.preventDefault(); escolher(o.id) }}>
              <span className="texto-cortado">{o.nome}</span>
              {(o.detalhe || o.grupo) && <span className="subtexto">{[o.grupo, o.detalhe].filter(Boolean).join(' · ')}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
      {janela && createPortal(
        <JanelaBusca titulo={titulo} opcoes={opcoes} valor={valor} onEscolher={escolher} onClose={() => setJanela(false)} />,
        document.body,
      )}
    </div>
  )
}

/** Janela do "⋯": todas as opções com busca, agrupadas quando têm grupo. */
export function JanelaBusca({ titulo, opcoes, valor, onEscolher, onClose, rodape }: {
  titulo: string
  opcoes: OpcaoBusca[]
  valor?: string
  onEscolher: (id: string) => void
  onClose: () => void
  rodape?: string
}) {
  const [busca, setBusca] = useState('')

  useEffect(() => {
    // Captura o Esc antes do modal de baixo, para fechar só esta janela.
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose() } }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])

  const t = semAcento(busca.trim())
  const filtradas = opcoes.filter(o => bate(o, t))
  const grupos: { nome: string; itens: OpcaoBusca[] }[] = []
  for (const o of filtradas) {
    const g = o.grupo ?? ''
    let alvo = grupos.find(x => x.nome === g)
    if (!alvo) { alvo = { nome: g, itens: [] }; grupos.push(alvo) }
    alvo.itens.push(o)
  }
  const temGrupo = grupos.some(g => g.nome)

  return (
    <div className="seletor-conta-fundo" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="seletor-conta-janela" role="dialog" aria-label={titulo}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)' }}>{titulo} <span className="subtexto">({opcoes.length})</span></p>
          <button type="button" className="btn btn-icon" aria-label="Fechar" onClick={onClose} style={{ width: '30px', height: '30px' }}><X size={13} /></button>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--c-55)' }} />
          <input className="input" autoFocus placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: '30px' }}
            onKeyDown={e => { if (e.key === 'Enter' && filtradas[0]) { e.preventDefault(); onEscolher(filtradas[0].id) } }} />
        </div>
        <div className="seletor-conta-grupos">
          {filtradas.length === 0 && <p className="subtexto" style={{ padding: '12px 0' }}>Nada encontrado.</p>}
          {grupos.map(g => (
            <div key={g.nome || '_'}>
              {temGrupo && <p className="seletor-conta-grupo">{g.nome || 'Outros'}</p>}
              <div className="janela-busca-lista">
                {g.itens.map(o => (
                  <button key={o.id} type="button" className={o.id === valor ? 'ativa' : undefined} onClick={() => onEscolher(o.id)}>
                    <span className="texto-cortado">{o.nome}</span>
                    {o.detalhe && <span className="subtexto texto-cortado">{o.detalhe}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {rodape && <p className="subtexto">{rodape}</p>}
      </div>
    </div>
  )
}
