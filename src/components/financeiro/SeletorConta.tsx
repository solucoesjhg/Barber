import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import CampoBusca, { type OpcaoBusca } from '../ui/CampoBusca'
import type { CategoriaFinanceira } from '../../types'

/**
 * Conta analítica do plano de contas (Água, Luz, Aluguel...) para um
 * lançamento: digita e escolhe nas sugestões, ou abre a lista completa
 * no "⋯". Saída mostra contas de despesa e entrada as de receita; as
 * sintéticas só agrupam (não recebem lançamento).
 */
export default function SeletorConta({ tipo, valor, onChange, vazio = 'Digite para buscar a conta...' }: {
  tipo: 'entrada' | 'saida'
  valor: string
  onChange: (id: string) => void
  vazio?: string
}) {
  const [categorias, setCategorias] = useState<CategoriaFinanceira[] | null>(null)
  const tipoConta = tipo === 'saida' ? 'despesa' : 'receita'

  useEffect(() => {
    let ativo = true
    supabase.from('categorias_financeiras').select('*').eq('tipo', tipoConta).eq('ativo', true)
      .then(({ data }) => { if (ativo) setCategorias(((data ?? []) as CategoriaFinanceira[]).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))) })
    return () => { ativo = false }
  }, [tipoConta])

  const opcoes = useMemo<OpcaoBusca[]>(() => {
    const lista = categorias ?? []
    const idsPai = new Set(lista.map(c => c.categoria_pai_id).filter(Boolean))
    const nomePai = (id?: string) => (id ? lista.find(c => c.id === id)?.nome : undefined)
    return lista.filter(c => !idsPai.has(c.id)).map(c => ({ id: c.id, nome: c.nome, grupo: nomePai(c.categoria_pai_id) ?? (idsPai.size ? 'Outras' : null) }))
  }, [categorias])

  return (
    <CampoBusca
      opcoes={opcoes} valor={valor} onChange={onChange} placeholder={vazio} carregando={!categorias}
      titulo={tipo === 'saida' ? 'Conta de despesa' : 'Conta de receita'}
    />
  )
}
