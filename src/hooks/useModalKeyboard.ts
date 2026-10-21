import { useEffect, useRef } from 'react'

/**
 * Comportamento padrão de modal de cadastro: foco automático no primeiro
 * campo ao abrir, Esc fecha, F10 confirma/salva. Tab entre campos já é
 * comportamento nativo do navegador (basta os campos estarem no DOM na
 * ordem certa).
 */
export function useModalKeyboard(active: boolean, onClose: () => void, onSave?: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  // Guarda sempre a versão mais recente das funções: sem isso o F10
  // salvava com os valores de quando o modal abriu (formulário vazio).
  const onCloseRef = useRef(onClose)
  const onSaveRef = useRef(onSave)
  onCloseRef.current = onClose
  onSaveRef.current = onSave

  useEffect(() => {
    if (!active) return

    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('input, select, textarea')
      el?.focus()
    }, 20)

    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      } else if (e.key === 'F10') {
        e.preventDefault()
        onSaveRef.current?.()
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', handler)
    }
  }, [active])

  return ref
}
