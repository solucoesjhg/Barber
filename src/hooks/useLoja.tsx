import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { usePerfil } from './usePerfil'

interface Loja {
  /** Nome da loja (Configurações). null enquanto carrega ou sem loja. */
  nome: string | null
  /** Logo cadastrado em Configurações (imagem em data URL). null = logo padrão. */
  logoUrl: string | null
  /** A loja trabalha com estoque mínimo e máximo (Configurações). */
  controlaEstoqueMinimo: boolean
  /** Venda de produto sem estoque: permitir, avisar ou bloquear. */
  estoqueZerado: 'permitir' | 'avisar' | 'bloquear'
  /** Cor da loja (#rrggbb) ou null (padrão do tema). */
  corDestaque: string | null
  permitirFiado: boolean
  fiadoPrazoDias: number
  /** Modelo do lembrete de WhatsApp (null = padrão). */
  mensagemWhatsapp: string | null
  /** Mostra os botões de lembrete no WhatsApp. */
  usarWhatsapp: boolean
}

interface LojaCtx extends Loja {
  recarregar: () => void
}

const Ctx = createContext<LojaCtx | null>(null)
const LOJA_VAZIA: Loja = {
  nome: null, logoUrl: null, controlaEstoqueMinimo: true, estoqueZerado: 'avisar',
  corDestaque: null, permitirFiado: true, fiadoPrazoDias: 30, mensagemWhatsapp: null, usarWhatsapp: true,
}
const chaveCache = (empresaId: string) => `barberos-loja-${empresaId}`

function lerCache(empresaId: string | null): Loja {
  if (!empresaId) return { ...LOJA_VAZIA }
  try {
    const salvo = localStorage.getItem(chaveCache(empresaId))
    if (salvo) return { ...LOJA_VAZIA, ...(JSON.parse(salvo) as Partial<Loja>) }
  } catch { /* sem cache */ }
  return { ...LOJA_VAZIA }
}

// Nome e logo da loja para o menu e o cabeçalho. Fica em cache no
// navegador para o nome aparecer na hora ao recarregar a página.
export function LojaProvider({ children }: { children: ReactNode }) {
  const { empresaId } = usePerfil()
  const [loja, setLoja] = useState<Loja>(() => lerCache(empresaId))

  const recarregar = useCallback(() => {
    if (!empresaId) { setLoja({ ...LOJA_VAZIA }); return }
    setLoja(lerCache(empresaId))
    // select('*'): funciona antes e depois da coluna controla_estoque_minimo existir.
    supabase.from('configuracoes').select('*').eq('empresa_id', empresaId).maybeSingle()
      .then(({ data, error }) => {
        if (error) return
        const nova: Loja = {
          nome: data?.nome_empresa?.trim() || null,
          logoUrl: data?.logo_url || null,
          controlaEstoqueMinimo: data?.controla_estoque_minimo ?? true,
          estoqueZerado: data?.estoque_zerado ?? 'avisar',
          corDestaque: data?.cor_destaque || null,
          permitirFiado: data?.permitir_fiado ?? true,
          fiadoPrazoDias: Number(data?.fiado_prazo_dias ?? 30),
          mensagemWhatsapp: data?.mensagem_whatsapp || null,
          usarWhatsapp: data?.usar_whatsapp ?? true,
        }
        setLoja(nova)
        try { localStorage.setItem(chaveCache(empresaId), JSON.stringify(nova)) } catch { /* cheio ou bloqueado */ }
      })
  }, [empresaId])

  useEffect(() => { recarregar() }, [recarregar])

  // Cor da loja: botões principais e item ativo do menu (ver index.css).
  useEffect(() => {
    const raiz = document.documentElement
    const cor = loja.corDestaque && /^#[0-9a-f]{6}$/i.test(loja.corDestaque) ? loja.corDestaque : null
    if (!cor) { raiz.removeAttribute('data-cor-loja'); raiz.style.removeProperty('--cor-loja'); raiz.style.removeProperty('--cor-loja-texto'); return }
    const [r, g, b] = [1, 3, 5].map(i => parseInt(cor.slice(i, i + 2), 16))
    const claro = (0.299 * r + 0.587 * g + 0.114 * b) > 160
    raiz.setAttribute('data-cor-loja', '')
    raiz.style.setProperty('--cor-loja', cor)
    raiz.style.setProperty('--cor-loja-texto', claro ? '#111111' : '#ffffff')
  }, [loja.corDestaque])

  return <Ctx.Provider value={{ ...loja, recarregar }}>{children}</Ctx.Provider>
}

export function useLoja(): LojaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLoja precisa estar dentro de <LojaProvider>')
  return ctx
}
