import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  ATALHOS_PERIODO, atalhoDoIntervalo, deslocarIntervalo, intervaloDoAtalho, rotuloIntervalo,
  type Intervalo,
} from '../../lib/periodo'

/**
 * Filtro de período compacto: na tela fica só um botão com o calendário
 * e o período escolhido ("Outubro de 2026"). Clicando, abre um painel
 * com atalhos (Hoje, Este mês, Mês passado...), datas livres e setas
 * para andar para o período anterior/seguinte.
 *
 * permitirTudo: mostra o atalho "Todo o período" (valor null).
 */
export default function FiltroPeriodo({ valor, onChange, alinhar = 'direita', permitirTudo }: {
  valor: Intervalo | null
  onChange: (v: Intervalo | null) => void
  alinhar?: 'direita' | 'esquerda'
  permitirTudo?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [rascunho, setRascunho] = useState<Intervalo>(valor ?? intervaloDoAtalho('mes'))
  const wrapRef = useRef<HTMLDivElement>(null)
  const atalhoAtivo = atalhoDoIntervalo(valor)

  useEffect(() => { if (valor) setRascunho(valor) }, [valor])

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false)
    }
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla) }
  }, [aberto])

  function escolher(v: Intervalo | null) {
    onChange(v)
    setAberto(false)
  }

  function mudarData(campo: keyof Intervalo, data: string) {
    const novo = { ...rascunho, [campo]: data }
    setRascunho(novo)
    // Só aplica com as duas datas válidas e na ordem certa.
    if (novo.inicio && novo.fim && novo.inicio <= novo.fim) onChange(novo)
  }

  return (
    <div className="periodo-wrap no-print" ref={wrapRef}>
      <button
        type="button"
        className={`periodo-botao${aberto ? ' aberto' : ''}`}
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Escolher período"
      >
        <CalendarDays size={14} />
        <span>{rotuloIntervalo(valor)}</span>
        <ChevronDown size={12} style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            className={`periodo-pop ${alinhar}`}
            role="dialog"
            aria-label="Período"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            <p className="periodo-titulo">Atalhos</p>
            <div className="periodo-atalhos">
              {ATALHOS_PERIODO.map(a => (
                <button
                  key={a.id}
                  type="button"
                  className={`periodo-atalho${atalhoAtivo === a.id ? ' ativo' : ''}`}
                  onClick={() => escolher(intervaloDoAtalho(a.id))}
                >
                  {a.label}
                </button>
              ))}
              {permitirTudo && (
                <button
                  type="button"
                  className={`periodo-atalho${valor === null ? ' ativo' : ''}`}
                  onClick={() => escolher(null)}
                  style={{ gridColumn: '1 / -1' }}
                >
                  Todo o período
                </button>
              )}
            </div>

            <p className="periodo-titulo">Datas</p>
            <div className="periodo-datas">
              <input className="input" type="date" aria-label="De" value={rascunho.inicio} max={rascunho.fim || undefined} onChange={e => mudarData('inicio', e.target.value)} />
              <input className="input" type="date" aria-label="Até" value={rascunho.fim} min={rascunho.inicio || undefined} onChange={e => mudarData('fim', e.target.value)} />
            </div>

            {valor && (
              <div className="periodo-navegar">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(deslocarIntervalo(valor, -1))}>
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(deslocarIntervalo(valor, 1))}>
                  Seguinte <ChevronRight size={13} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
