import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { PermissoesUsuario, TelaId } from '../types'

interface PermissoesCtx {
  permissoes: PermissoesUsuario | null
  loading: boolean
  erro: string
  podeVer: (tela: TelaId) => boolean
  podeEditar: (tela: TelaId) => boolean
  /** Administrador/gerente: telas Usuários e Permissões. */
  gerenciaEquipe: boolean
  verVendasOutros: boolean
  verCustoProdutos: boolean
  recarregar: () => void
}

const Ctx = createContext<PermissoesCtx | null>(null)

// As permissões vêm de minhas_permissoes() — a mesma regra que o banco
// aplica nas políticas de RLS. Aqui elas só decidem o que aparece
// (menu, rotas, botões); quem impede de fato é o banco.
export function PermissoesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const recarregar = useCallback(() => {
    if (!user) { setPermissoes(null); setLoading(false); return }
    setLoading(true)
    supabase.rpc('minhas_permissoes').then(({ data, error }) => {
      setErro(error ? error.message : '')
      setPermissoes(error ? null : (data as PermissoesUsuario | null))
      setLoading(false)
    })
  }, [user])

  useEffect(() => { recarregar() }, [recarregar])

  const podeVer = useCallback((tela: TelaId) => !!permissoes?.telas?.[tela]?.ver, [permissoes])
  const podeEditar = useCallback((tela: TelaId) => !!permissoes?.telas?.[tela]?.editar, [permissoes])

  return (
    <Ctx.Provider value={{
      permissoes, loading, erro, podeVer, podeEditar, recarregar,
      gerenciaEquipe: !!permissoes?.gerenciar_equipe,
      verVendasOutros: !!permissoes?.ver_vendas_outros,
      verCustoProdutos: !!permissoes?.ver_custo_produtos,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePermissoes() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePermissoes precisa estar dentro de <PermissoesProvider>')
  return ctx
}
