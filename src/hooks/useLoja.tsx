import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { usePerfil } from './usePerfil'

interface Loja {
  /** Nome da loja (Configurações). null enquanto carrega ou sem loja. */
  nome: string | null
  /** Logo cadastrado em Configurações (imagem em data URL). null = logo padrão. */
  logoUrl: string | null
}

interface LojaCtx extends Loja {
  recarregar: () => void
}

const Ctx = createContext<LojaCtx | null>(null)
const chaveCache = (empresaId: string) => `barberos-loja-${empresaId}`

function lerCache(empresaId: string | null): Loja {
  if (!empresaId) return { nome: null, logoUrl: null }
  try {
    const salvo = localStorage.getItem(chaveCache(empresaId))
    if (salvo) return JSON.parse(salvo) as Loja
  } catch { /* sem cache */ }
  return { nome: null, logoUrl: null }
}

// Nome e logo da loja para o menu e o cabeçalho. Fica em cache no
// navegador para o nome aparecer na hora ao recarregar a página.
export function LojaProvider({ children }: { children: ReactNode }) {
  const { empresaId } = usePerfil()
  const [loja, setLoja] = useState<Loja>(() => lerCache(empresaId))

  const recarregar = useCallback(() => {
    if (!empresaId) { setLoja({ nome: null, logoUrl: null }); return }
    setLoja(lerCache(empresaId))
    supabase.from('configuracoes').select('nome_empresa, logo_url').eq('empresa_id', empresaId).maybeSingle()
      .then(({ data, error }) => {
        if (error) return
        const nova: Loja = { nome: data?.nome_empresa?.trim() || null, logoUrl: data?.logo_url || null }
        setLoja(nova)
        try { localStorage.setItem(chaveCache(empresaId), JSON.stringify(nova)) } catch { /* cheio ou bloqueado */ }
      })
  }, [empresaId])

  useEffect(() => { recarregar() }, [recarregar])

  return <Ctx.Provider value={{ ...loja, recarregar }}>{children}</Ctx.Provider>
}

export function useLoja(): LojaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLoja precisa estar dentro de <LojaProvider>')
  return ctx
}
