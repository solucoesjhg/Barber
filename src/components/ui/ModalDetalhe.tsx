import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useModalKeyboard } from '../../hooks/useModalKeyboard'

/**
 * Card de visualização (abre ao clicar numa linha/card de lista):
 * cabeçalho com ícone/foto, título e subtítulo, conteúdo livre e as
 * ações no rodapé. Esc ou clique fora fecha.
 */
export default function ModalDetalhe({ titulo, subtitulo, icone, onClose, children, acoes, largura = 480, onSalvar }: {
  titulo: ReactNode
  subtitulo?: ReactNode
  icone?: ReactNode
  onClose: () => void
  children?: ReactNode
  acoes?: ReactNode
  largura?: number
  /** F10 dentro do card (quando ele tem algo editável). */
  onSalvar?: () => void
}) {
  const ref = useModalKeyboard(true, onClose, onSalvar, false)
  return (
    <motion.div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        ref={ref}
        className="card"
        role="dialog"
        aria-modal="true"
        style={{ width: '100%', maxWidth: `${largura}px`, padding: '24px', maxHeight: '88vh', overflowY: 'auto' }}
        initial={{ scale: 0.96, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 14 }}
        transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="detalhe-topo">
          {icone && <div className="detalhe-icone">{icone}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="detalhe-titulo">{titulo}</h2>
            {subtitulo && <div className="detalhe-sub">{subtitulo}</div>}
          </div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Fechar" style={{ flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
        {children}
        {acoes && <div className="detalhe-acoes">{acoes}</div>}
      </motion.div>
    </motion.div>
  )
}

/** Grade de informações (rótulo em cima, valor embaixo), 2 colunas. */
export function InfoGrade({ children }: { children: ReactNode }) {
  return <div className="detalhe-grid">{children}</div>
}

/** Um campo da grade. Valor vazio vira "—". largo: ocupa a linha inteira. */
export function Info({ rotulo, children, largo }: { rotulo: string; children?: ReactNode; largo?: boolean }) {
  const vazio = children === undefined || children === null || children === ''
  return (
    <div className={`detalhe-item${largo ? ' largo' : ''}`}>
      <p className="detalhe-rotulo">{rotulo}</p>
      <div className={`detalhe-valor${vazio ? ' fraco' : ''}`}>{vazio ? '—' : children}</div>
    </div>
  )
}

/** Bloco separado por uma linha, com título (e uma ação opcional à direita). */
export function SecaoDetalhe({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className="detalhe-secao">
      <div className="detalhe-secao-titulo">
        <span>{titulo}</span>
        {acao}
      </div>
      {children}
    </div>
  )
}
