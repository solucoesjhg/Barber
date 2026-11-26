import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { usePermissoes } from '../hooks/usePermissoes'
import { TELAS } from '../lib/permissoes'
import type { TelaId } from '../types'

export function SemPermissao({ titulo = 'Sem acesso a esta tela' }: { titulo?: string }) {
  return (
    <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
      <Lock size={22} style={{ color: 'var(--c-55)', marginBottom: '14px' }} />
      <h2 style={{ fontSize: '18px', color: 'var(--c-fff)', marginBottom: '10px' }}>{titulo}</h2>
      <p style={{ fontSize: '13px', color: 'var(--c-a3)', lineHeight: 1.6 }}>
        Seu usuário não tem permissão para esta tela. Se precisar dela, peça ao gerente ou administrador da loja para liberar em Permissões.
      </p>
    </div>
  )
}

/**
 * Tela que abre ao entrar no sistema: a escolhida no cadastro do usuário
 * (padrão: Agenda). Sem permissão nela, a primeira liberada, na ordem do menu.
 */
export function useRotaInicial(): string | null {
  const { permissoes, podeVer } = usePermissoes()
  if (permissoes?.papel === 'super_admin') return '/empresas'
  const escolhida = TELAS.find(t => t.id === (permissoes?.tela_inicial ?? 'agenda'))
  if (escolhida && podeVer(escolhida.id)) return escolhida.rota
  return TELAS.find(t => podeVer(t.id))?.rota ?? null
}

/** Rota "/inicio": manda para a tela inicial do usuário. */
export function IrParaInicio() {
  const { loading } = usePermissoes()
  const rota = useRotaInicial()
  if (loading) return <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
  return rota ? <Navigate to={rota} replace /> : <SemPermissao titulo="Nenhuma tela liberada" />
}

/**
 * Guarda de rota.
 * - tela: precisa de "ver" nessa tela;
 * - gestao: administrador/gerente da loja (Usuários, Permissões);
 * - superAdmin: super admin (Empresas).
 * Com mais de uma opção, basta atender uma.
 */
export default function RotaPermitida({ tela, gestao, superAdmin, children }: {
  tela?: TelaId
  gestao?: boolean
  superAdmin?: boolean
  children: ReactNode
}) {
  const { permissoes, loading, erro, recarregar, podeVer, gerenciaEquipe } = usePermissoes()
  const rotaInicial = useRotaInicial()
  if (loading) return <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
  if (erro) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '18px', color: 'var(--c-fff)', marginBottom: '10px' }}>Não foi possível carregar suas permissões</h2>
        <p style={{ fontSize: '13px', color: 'var(--c-a3)', lineHeight: 1.6, marginBottom: '16px' }}>{erro}</p>
        <button className="btn btn-secondary btn-sm" onClick={recarregar}>Tentar de novo</button>
      </div>
    )
  }

  const souSuperAdmin = permissoes?.papel === 'super_admin'
  const permitido =
    (!!superAdmin && souSuperAdmin) ||
    (!!gestao && gerenciaEquipe) ||
    (!!tela && podeVer(tela))

  if (permitido) return <>{children}</>
  // Link antigo para o Dashboard: quem não pode vê-lo vai para a tela
  // inicial, em vez de cair numa tela de bloqueio.
  if (tela === 'dashboard' && rotaInicial && rotaInicial !== '/dashboard') return <Navigate to={rotaInicial} replace />
  return <SemPermissao />
}
