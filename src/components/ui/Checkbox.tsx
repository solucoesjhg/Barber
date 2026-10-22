import { useEffect, useRef } from 'react'

/**
 * Checkbox discreto (o visual vem do CSS global de input[type=checkbox]).
 * - indeterminate: "alguns marcados" no cabeçalho de uma lista;
 * - o clique não sobe pra linha da lista (que abre o card de detalhe).
 */
export default function Checkbox({ checked, indeterminate, onChange, label, disabled }: {
  checked: boolean
  indeterminate?: boolean
  onChange: (marcado: boolean) => void
  label: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked
  }, [indeterminate, checked])

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      onClick={e => e.stopPropagation()}
    />
  )
}
