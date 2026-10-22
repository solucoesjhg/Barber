import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { CardDashboardId, PermissoesUsuario, RelatorioId, TelaId } from '../types'

interface PermissoesCtx {
  permissoes: PermissoesUsuario | null
  loading: boolean
  erro: string
  podeVer: (tela: TelaId) => boolean
  podeEditar: (tela: TelaId) => boolean
  /** O card aparece no Dashboard desse usuário? */
  podeVerCard: (card: CardDashboardId) => boolean
  /** A aba de Relatórios está liberada pra esse usuário? */
  podeVerRelatorio: (relatorio: RelatorioId) => boolean
  /** Administrador/gerente: telas Usuários e Permissões. */
  gerenciaEquipe: boolean
  /** Administrador/gerente com Vendas (editar): pode editar uma venda já feita. */
  podeEditarVendas: boolean
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
  const podeVerCard = useCallback((card: CardDashboardId) => !!permissoes?.dashboard_cards?.includes(card), [permissoes])
  // Sem a lista (banco antes da migração de relatórios): todos liberados.
  const podeVerRelatorio = useCallback((r: RelatorioId) => !permissoes?.relatorios || permissoes.relatorios.includes(r), [permissoes])

  return (
    <Ctx.Provider value={{
      permissoes, loading, erro, podeVer, podeEditar, podeVerCard, podeVerRelatorio, recarregar,
      gerenciaEquipe: !!permissoes?.gerenciar_equipe,
      podeEditarVendas: !!permissoes?.gerenciar_equipe && !!permissoes?.telas?.pdv?.editar,
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
