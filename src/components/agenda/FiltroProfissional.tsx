import { Users } from 'lucide-react'
import { initials } from '../../lib/utils'
import type { Profissional } from '../../types'

/** Cor estável por profissional (mesmo nome, mesma cor em todas as telas). */
const CORES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']
export function corDoProfissional(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return CORES[h % CORES.length]
}

/**
 * Filtro da agenda: "Todos" + um cartãozinho por profissional, com a
 * inicial colorida e quantos atendimentos ele tem no período da tela.
 * Clicar de novo no selecionado volta para "Todos".
 */
export default function FiltroProfissional({ profissionais, contagem, total, valor, onChange }: {
  profissionais: Profissional[]
  contagem: Record<string, number>
  total: number
  valor: string
  onChange: (id: string) => void
}) {
  if (profissionais.length < 2) return null
  return (
    <div className="filtro-prof" role="radiogroup" aria-label="Filtrar por profissional">
      <button
        type="button" role="radio" aria-checked={valor === ''}
        className={`filtro-prof-item${valor === '' ? ' ativo' : ''}`}
        onClick={() => onChange('')}
      >
        <span className="filtro-prof-avatar filtro-prof-todos"><Users size={13} /></span>
        <span className="filtro-prof-nome">Todos</span>
        <span className="filtro-prof-contagem">{total}</span>
      </button>
      {profissionais.map(p => {
        const ativo = valor === p.id
        const cor = corDoProfissional(p.id)
        const n = contagem[p.id] ?? 0
        return (
          <button
            key={p.id} type="button" role="radio" aria-checked={ativo}
            className={`filtro-prof-item${ativo ? ' ativo' : ''}`}
            onClick={() => onChange(ativo ? '' : p.id)}
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
