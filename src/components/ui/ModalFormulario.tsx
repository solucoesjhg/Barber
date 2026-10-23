import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useModalKeyboard } from '../../hooks/useModalKeyboard'

export type TamanhoModal = 'pequeno' | 'medio' | 'grande'

const LARGURA: Record<TamanhoModal, number> = { pequeno: 600, medio: 800, grande: 960 }

/**
 * Modal de cadastro e edição. Ocupa boa parte da tela: os campos vão em
 * colunas (FormGrade), o título e os botões ficam fixos e só o meio rola
 * quando o formulário é alto. No celular vira uma folha na largura toda.
 * Esc fecha, F10 salva. Clicar fora não fecha, para não perder o que já
 * foi digitado.
 */
export default function ModalFormulario({
  titulo, descricao, icone, tamanho = 'medio', onClose, onSalvar, salvando = false,
  rotuloSalvar = 'Salvar', erro, children,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  icone?: ReactNode
  tamanho?: TamanhoModal
  onClose: () => void
  onSalvar: () => void
  salvando?: boolean
  rotuloSalvar?: string
  erro?: string
  children: ReactNode
}) {
  // F10 repetido enquanto salva não grava duas vezes.
  function salvar() { if (!salvando) onSalvar() }
  const ref = useModalKeyboard(true, onClose, salvar)

  return (
    <motion.div
      className="modal-form-fundo"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        ref={ref}
        className="card modal-form"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: `${LARGURA[tamanho]}px` }}
        initial={{ scale: 0.97, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 14 }}
        transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="modal-form-topo">
          {icone && <div className="detalhe-icone">{icone}</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="modal-form-titulo">{titulo}</h2>
            {descricao && <p className="modal-form-descricao">{descricao}</p>}
          </div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Fechar" style={{ flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-form-corpo">{children}</div>

        <div className="modal-form-rodape">
          {erro && <p className="aviso-erro modal-form-erro">{erro}</p>}
          <div className="modal-form-botoes">
            <button className="btn btn-secondary" onClick={onClose}>Cancelar (Esc)</button>
            <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : `${rotuloSalvar} (F10)`}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Grade de campos: 3 colunas por padrão. Vira 2 e depois 1 quando o modal estreita. */
export function FormGrade({ colunas = 3, children }: { colunas?: 2 | 3 | 4; children: ReactNode }) {
  return <div className={`form-grade c${colunas}`}>{children}</div>
}

/** Campo com rótulo. span: ocupa 2 colunas ou a linha inteira ('total'). */
export function Campo({ rotulo, span, ajuda, children }: {
  rotulo: string
  span?: 2 | 'total'
  ajuda?: ReactNode
  children: ReactNode
}) {
  const classe = span === 2 ? ' span-2' : span === 'total' ? ' span-total' : ''
  return (
    <div className={`field${classe}`}>
      <label className="label">{rotulo}</label>
      {children}
      {ajuda && <p className="campo-ajuda">{ajuda}</p>}
    </div>
  )
}

/** Título de um grupo de campos dentro da grade (Preço, Estoque...), com uma explicação opcional. */
export function SecaoForm({ titulo, ajuda }: { titulo: string; ajuda?: ReactNode }) {
  return (
    <div className="form-secao">
      <p className="form-secao-titulo">{titulo}</p>
      {ajuda && <p className="campo-ajuda">{ajuda}</p>}
    </div>
  )
}
