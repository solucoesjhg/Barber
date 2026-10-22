import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

/**
 * Barra que aparece embaixo da lista quando há linhas marcadas: mostra
 * quantas e os totais delas (cada tela passa os seus em `children`).
 */
export default function BarraSelecao({ quantidade, onLimpar, children, acoes }: {
  quantidade: number
  onLimpar: () => void
  children?: ReactNode
  acoes?: ReactNode
}) {
  return (
    <AnimatePresence>
      {quantidade > 0 && (
        <motion.div
          className="selecao-barra"
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <span className="selecao-contagem">
            {quantidade} {quantidade === 1 ? 'selecionado' : 'selecionados'}
          </span>
          {children}
          <span style={{ flex: 1 }} />
          {acoes}
          <button className="btn btn-ghost btn-sm" onClick={onLimpar} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <X size={12} /> Limpar
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Um valor dentro da barra: "Total R$ 120,00". */
export function ItemSelecao({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <span className="selecao-item">
      {rotulo} <strong>{valor}</strong>
    </span>
  )
}
