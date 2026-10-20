import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { usePermissoes } from '../hooks/usePermissoes'
import { TELAS } from '../lib/permissoes'
import type { TelaId } from '../types'

export function SemPermissao({ titulo = 'Sem acesso a esta tela' }: { titulo?: string }) {
  return (
    <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
      <Lock size={22} style={{ color: '#555', marginBottom: '14px' }} />
      <h2 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '10px' }}>{titulo}</h2>
      <p style={{ fontSize: '13px', color: '#A3A3A3', lineHeight: 1.6 }}>
        Seu usuário não tem permissão para esta tela. Se precisar dela, peça ao gerente ou administrador da loja para liberar em Permissões.
      </p>
    </div>
  )
}

/** Primeira tela que o usuário pode ver, na ordem do menu. */
export function useRotaInicial(): string | null {
  const { permissoes, podeVer } = usePermissoes()
  if (permissoes?.papel === 'super_admin') return '/empresas'
  return TELAS.find(t => podeVer(t.id))?.rota ?? null
}

/**
 * Guarda de rota.
 * - tela: precisa de "ver" nessa tela;
 * - gestao: administrador/gerente da loja (Usuários, Permissões);
 * - superAdmin: super admin (Empresas; Pendências em Usuários).
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
  if (loading) return <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
  if (erro) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '18px', color: '#FFFFFF', marginBottom: '10px' }}>Não foi possível carregar suas permissões</h2>
        <p style={{ fontSize: '13px', color: '#A3A3A3', lineHeight: 1.6, marginBottom: '16px' }}>{erro}</p>
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
  // Dashboard é o destino padrão após o login: quem não pode vê-lo vai
  // pra primeira tela liberada, em vez de cair numa tela de bloqueio.
  if (tela === 'dashboard' && rotaInicial && rotaInicial !== '/dashboard') return <Navigate to={rotaInicial} replace />
  return <SemPermissao />
}
