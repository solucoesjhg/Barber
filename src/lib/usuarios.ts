import { supabase } from './supabase'

/**
 * Nome de exibição de cada usuário da loja (id → nome). Usa o nome
 * cadastrado em Usuários e, sem ele, a parte do e-mail antes do @.
 */
export async function carregarNomesUsuarios(): Promise<Record<string, string>> {
  const { data } = await supabase.rpc('listar_usuarios_basico')
  const mapa: Record<string, string> = {}
  ;((data ?? []) as { usuario_id: string; email: string; nome?: string | null }[]).forEach(u => {
    mapa[u.usuario_id] = u.nome?.trim() || u.email.split('@')[0]
  })
  return mapa
}
