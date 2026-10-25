import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { CategoriaFinanceira } from '../../types'

/**
 * Conta analítica do plano de contas (Água, Luz, Aluguel...) para um
 * lançamento. Saída lista as contas de despesa e entrada as de receita;
 * as sintéticas aparecem só como grupo (não recebem lançamento).
 */
export default function SeletorConta({ tipo, valor, onChange, vazio = 'Selecionar...', autoFocus }: {
  tipo: 'entrada' | 'saida'
  valor: string
  onChange: (id: string) => void
  vazio?: string
  autoFocus?: boolean
}) {
  const [categorias, setCategorias] = useState<CategoriaFinanceira[] | null>(null)
  const tipoConta = tipo === 'saida' ? 'despesa' : 'receita'

  useEffect(() => {
    let ativo = true
    supabase.from('categorias_financeiras').select('*').eq('tipo', tipoConta).eq('ativo', true).order('nome')
      .then(({ data }) => { if (ativo) setCategorias(((data ?? []) as CategoriaFinanceira[]).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))) })
    return () => { ativo = false }
  }, [tipoConta])

  const lista = categorias ?? []
  const idsPai = new Set(lista.map(c => c.categoria_pai_id).filter(Boolean))
  const sinteticas = lista.filter(c => idsPai.has(c.id))
  const soltas = lista.filter(c => !c.categoria_pai_id && !idsPai.has(c.id))

  return (
    <select className="input" value={valor} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} disabled={!categorias}>
      <option value="">{categorias ? vazio : 'Carregando...'}</option>
      {sinteticas.map(s => (
        <optgroup key={s.id} label={s.nome}>
          {lista.filter(c => c.categoria_pai_id === s.id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </optgroup>
      ))}
      {soltas.length > 0 && (sinteticas.length > 0
        ? <optgroup label="Outras">{soltas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
        : soltas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>))}
    </select>
  )
}
