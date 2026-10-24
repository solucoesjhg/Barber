import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Bell, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Sidebar from './Sidebar'
import { usePerfil } from '../../hooks/usePerfil'
import { useLoja } from '../../hooks/useLoja'

const SIDEBAR_KEY = 'barberos-sidebar-hidden'

const PAGE_NAMES: Record<string, string> = {
  '/empresas':      'Empresas',
  '/dashboard':     'Dashboard',
  '/agenda':        'Agenda',
  '/vendas':        'Vendas',
  '/caixa':         'Caixa',
  '/clientes':      'Clientes',
  '/profissionais': 'Profissionais',
  '/produtos':      'Produtos',
  '/fornecedores':  'Fornecedores',
  '/financeiro':    'Financeiro',
  '/categorias':    'Categorias',
  '/contas-pagar':   'Contas a Pagar',
  '/contas-receber': 'Contas a Receber',
  '/comissoes':     'Comissões',
  '/dre':           'DRE',
  '/relatorios':    'Relatórios',
  '/auditoria':     'Auditoria',
  '/usuarios':      'Usuários',
  '/configuracoes': 'Configurações',
}

/**
 * A página da rota, guardada como estava quando a tela abriu. Durante a
 * animação de saída a página antiga continua na tela; com um <Outlet />
 * comum ela já passava a mostrar a página nova, que montava duas vezes
 * (a primeira dentro da que estava saindo) e perdia o que vem na URL só
 * uma vez, como o /vendas?agendamento= do "Gerar venda".
 */
function PaginaDaRota() {
  const outlet = useOutlet()
  const [pagina] = useState(outlet)
  return pagina
}

export default function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  // /empresas/:id e outras rotas filhas herdam o nome da rota pai.
  const pageName = PAGE_NAMES[location.pathname]
    ?? Object.entries(PAGE_NAMES).find(([rota]) => location.pathname.startsWith(rota + '/'))?.[1]
    ?? ''
  const { papel, empresaId, ativo, loading: perfilLoading } = usePerfil()
  const { nome: nomeLoja } = useLoja()
  const raizCaminho = papel === 'super_admin' ? 'Barber' : (nomeLoja ?? '')
  const [sidebarHidden, setSidebarHidden] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return true
    try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
  })

  const semLoja = !perfilLoading && papel !== null && papel !== 'super_admin' && !empresaId && location.pathname !== '/empresas'
  const desativado = !perfilLoading && papel !== null && papel !== 'super_admin' && !!empresaId && !ativo

  useEffect(() => {
    if (window.innerWidth <= 768) setSidebarHidden(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  function toggleSidebar() {
    setSidebarHidden(prev => {
      const next = !prev
      try { localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-0d)' }}>
      <Sidebar hidden={sidebarHidden} />
      {!sidebarHidden && <div className="mobile-sidebar-backdrop" onClick={toggleSidebar} />}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <div className="app-header" style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          background: 'var(--c-0d)',
          borderBottom: '1px solid var(--c-1f)',
          flexShrink: 0,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className={`sidebar-toggle-btn${sidebarHidden ? '' : ' sidebar-open'}`}
              onClick={toggleSidebar}
              title={sidebarHidden ? 'Mostrar menu' : 'Esconder menu'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                background: 'transparent', border: '1px solid var(--c-25)', borderRadius: '6px',
                color: 'var(--c-66)', cursor: 'pointer', marginRight: '4px',
              }}
            >
              {sidebarHidden ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
            <span
              onClick={() => navigate('/dashboard')}
              className="texto-cortado"
              style={{ fontSize: '12px', color: 'var(--c-55)', cursor: 'pointer', maxWidth: '180px' }}
            >
              {raizCaminho}
            </span>
            {pageName && (
              <>
                {raizCaminho && <ChevronRight size={12} style={{ color: 'var(--c-2a)', flexShrink: 0 }} />}
                <span style={{ fontSize: '12px', color: 'var(--c-a3)', fontWeight: 500, whiteSpace: 'nowrap' }}>{pageName}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Search */}
            <div className="app-header-search" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              background: 'var(--c-1a)',
              border: '1px solid var(--c-25)',
              borderRadius: '8px',
              cursor: 'text',
            }}>
              <Search size={12} style={{ color: 'var(--c-44)' }} />
              <input
                type="text"
                placeholder="Buscar..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  color: 'var(--c-a3)',
                  width: '110px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Notifications */}
            <button style={{
              width: '34px', height: '34px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--c-1a)',
              border: '1px solid var(--c-25)',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--c-55)',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}>
              <Bell size={13} />
              <span style={{
                position: 'absolute',
                top: '8px', right: '8px',
                width: '5px', height: '5px',
                background: 'var(--c-fff)',
                borderRadius: '50%',
              }} />
            </button>
          </div>
        </div>

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            style={{ flex: 1, overflowY: 'auto' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {perfilLoading ? (
              <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
            ) : desativado ? (
              <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '18px', color: 'var(--c-fff)', marginBottom: '10px' }}>Usuário desativado</h2>
                <p style={{ fontSize: '13px', color: 'var(--c-a3)', lineHeight: 1.6 }}>
                  Seu acesso a esta loja foi desativado. Fale com o gerente ou administrador da loja.
                </p>
              </div>
            ) : semLoja ? (
              <div style={{ padding: '80px 40px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '18px', color: 'var(--c-fff)', marginBottom: '10px' }}>Usuário sem loja</h2>
                <p style={{ fontSize: '13px', color: 'var(--c-a3)', lineHeight: 1.6 }}>
                  Seu usuário não está ligado a nenhuma loja. Fale com o gerente da sua loja.
                </p>
              </div>
            ) : (
              <PaginaDaRota />
            )}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
