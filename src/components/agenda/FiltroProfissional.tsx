import { Users } from 'lucide-react'
import { initials } from '../../lib/utils'
import type { Profissional } from '../../types'

/** Cor estável por profissional (mesmo nome, mesma cor em todas as telas). */
const CORES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']
export function corDoProfissional(id: string | null | undefined): string {
  if (!id) return 'var(--c-55)'
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CORES[h % CORES.length]
}

/**
 * Filtro da agenda: "Todos" + um cartãozinho por profissional, com a
 * cor dele (a mesma dos atendimentos) e quantos atendimentos tem no
 * período da tela. Dá para marcar um, dois, três... ("Todos" limpa).
 */
export default function FiltroProfissional({ profissionais, contagem, total, valor, onChange }: {
  profissionais: Profissional[]
  contagem: Record<string, number>
  total: number
  /** Escolhidos; vazio = todos. */
  valor: string[]
  onChange: (ids: string[]) => void
}) {
  if (profissionais.length < 2) return null
  const todos = valor.length === 0
  return (
    <div className="filtro-prof" role="group" aria-label="Filtrar por profissional">
      <button
        type="button" aria-pressed={todos}
        className={`filtro-prof-item${todos ? ' ativo' : ''}`}
        onClick={() => onChange([])}
      >
        <span className="filtro-prof-avatar filtro-prof-todos"><Users size={13} /></span>
        <span className="filtro-prof-nome">Todos</span>
        <span className="filtro-prof-contagem">{total}</span>
      </button>
      {profissionais.map(p => {
        const ativo = valor.includes(p.id)
        const cor = corDoProfissional(p.id)
        const n = contagem[p.id] ?? 0
        return (
          <button
            key={p.id} type="button" aria-pressed={ativo}
            className={`filtro-prof-item${ativo ? ' ativo' : ''}`}
            onClick={() => {
              const novo = ativo ? valor.filter(id => id !== p.id) : [...valor, p.id]
              // Todos marcados é o mesmo que "Todos".
              onChange(novo.length === profissionais.length ? [] : novo)
            }}
            title={p.especialidade ? `${p.nome} · ${p.especialidade}` : p.nome}
            style={ativo ? { borderColor: cor, boxShadow: `0 0 0 1px ${cor}` } : undefined}
          >
            <span className="filtro-prof-avatar" style={{ background: `${cor}26`, color: cor, borderColor: `${cor}66` }}>
              {initials(p.nome)}
            </span>
            <span className="filtro-prof-nome">{p.nome.split(' ')[0]}</span>
            <span className="filtro-prof-contagem" style={n > 0 ? { background: `${cor}26`, color: cor } : undefined}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}
