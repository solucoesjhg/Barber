import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Alerta {
  tipo: string
  nivel: 'aviso' | 'urgente'
  titulo: string
  detalhe?: string | null
  link?: string | null
}

/**
 * Sininho do topo: estoque baixo, contas vencidas ou vencendo hoje, a
 * receber atrasado (inclui fiado), caixa aberto há muito tempo,
 * agendamentos de hoje sem confirmar e a mensalidade do sistema. O banco
 * só devolve o que o usuário pode ver (alertas_loja).
 */
export default function Sininho({ ativo }: { ativo: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(() => {
    if (!ativo) { setAlertas([]); return }
    supabase.rpc('alertas_loja').then(({ data, error }) => { if (!error) setAlertas((data ?? []) as Alerta[]) })
  }, [ativo])

  useEffect(() => { carregar() }, [carregar, location.pathname])
  useEffect(() => {
    const id = window.setInterval(carregar, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [carregar])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixaRef.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const urgente = alertas.some(a => a.nivel === 'urgente')

  return (
    <div ref={caixaRef} style={{ position: 'relative' }}>
      <button
        type="button" className="sininho-botao" onClick={() => setAberto(v => !v)}
        aria-label={alertas.length ? `${alertas.length} alertas` : 'Sem alertas'} aria-expanded={aberto}
        title={alertas.length ? `${alertas.length} ${alertas.length === 1 ? 'alerta' : 'alertas'}` : 'Sem alertas'}
      >
        <Bell size={13} />
        {alertas.length > 0 && <span className={`sininho-contagem${urgente ? ' urgente' : ''}`}>{alertas.length}</span>}
      </button>
      {aberto && (
        <div className="sininho-painel" role="dialog" aria-label="Alertas">
          <p className="sininho-titulo">Alertas</p>
          {alertas.length === 0 ? (
            <p className="sininho-vazio">Tudo em dia por aqui.</p>
          ) : alertas.map((a, i) => (
            <button
              key={`${a.tipo}-${i}`} type="button" className={`sininho-item ${a.nivel}`} disabled={!a.link}
              onClick={() => { if (a.link) { setAberto(false); navigate(a.link) } }}
            >
              <span className="sininho-ponto" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="sininho-item-titulo">{a.titulo}</span>
                {a.detalhe && <span className="sininho-item-detalhe">{a.detalhe}</span>}
              </span>
              {a.link && <ChevronRight size={13} style={{ color: 'var(--c-44)', flexShrink: 0 }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
