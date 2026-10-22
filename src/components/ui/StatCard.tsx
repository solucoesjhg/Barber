import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Card de indicador: rótulo em caixa alta, valor em destaque e uma linha de apoio opcional. */
export default function StatCard({ rotulo, valor, sub, icone: Icone }: {
  rotulo: string
  valor: ReactNode
  sub?: ReactNode
  icone?: LucideIcon
}) {
  return (
    <div className="stat-card">
      <span className="stat-card-rotulo">
        {Icone && <Icone size={12} />}
        {rotulo}
      </span>
      <p className="stat-card-valor">{valor}</p>
      {sub && <p className="stat-card-sub">{sub}</p>}
    </div>
  )
}
