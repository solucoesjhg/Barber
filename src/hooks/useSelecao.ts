import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Seleção de linhas de uma lista (checkbox em cada linha + "todas" no
 * cabeçalho). Só ids que ainda estão em `visiveis` contam: ao filtrar a
 * lista, o que sumiu deixa de estar selecionado.
 */
export function useSelecao(visiveis: string[]) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const chave = visiveis.join(',')

  // Tira da seleção o que não está mais na lista (filtro, recarga...).
  useEffect(() => {
    setMarcados(prev => {
      const ids = new Set(visiveis)
      const next = new Set([...prev].filter(id => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const alternar = useCallback((id: string, marcar?: boolean) => {
    setMarcados(prev => {
      const next = new Set(prev)
      const vai = marcar ?? !next.has(id)
      if (vai) next.add(id); else next.delete(id)
      return next
    })
  }, [])

  const todos = visiveis.length > 0 && visiveis.every(id => marcados.has(id))
  const alguns = !todos && visiveis.some(id => marcados.has(id))

  const alternarTodos = useCallback((marcar: boolean) => {
    setMarcados(marcar ? new Set(visiveis) : new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const limpar = useCallback(() => setMarcados(new Set()), [])

  return useMemo(() => ({
    marcados, quantidade: marcados.size, todos, alguns,
    tem: (id: string) => marcados.has(id),
    alternar, alternarTodos, limpar,
  }), [marcados, todos, alguns, alternar, alternarTodos, limpar])
}
