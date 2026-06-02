import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Bell, ChevronRight } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../../hooks/useAuth'

const PAGE_NAMES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/agenda':       'Agenda',
  '/clientes':     'Clientes',
  '/funcionarios': 'Funcionários',
  '/servicos':     'Serviços',
  '/caixa':        'Caixa',
  '/usuarios':     'Usuários',
  '/empresa':      'Empresa',
}

export default function AppLayout() {
  const location = useLocation()
  const { usuario } = useAuth()
  const nome    = usuario?.perfis?.nome_pe ?? 'Usuário'
  const inicial = nome.charAt(0).toUpperCase()
  const pageName = PAGE_NAMES[location.pathname]

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f4f4f5' }}>
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between"
          style={{
            height: '56px',
            paddingLeft: '32px',
            paddingRight: '32px',
            background: '#ffffff',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <span
              className="font-medium"
              style={{ fontSize: '13px', color: '#a1a1aa' }}
            >
              BarberOS
            </span>
            {pageName && (
              <>
                <ChevronRight size={13} style={{ color: '#d4d4d8', flexShrink: 0 }} />
                <span
                  className="font-semibold"
                  style={{ fontSize: '13px', color: '#18181b' }}
                >
                  {pageName}
                </span>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <motion.div
              className="hidden md:flex items-center gap-2 rounded-xl cursor-text"
              style={{
                padding: '6px 12px',
                background: '#f4f4f5',
                border: '1px solid rgba(0,0,0,0.09)',
              }}
              whileHover={{ borderColor: 'rgba(0,0,0,0.18)' }}
              transition={{ duration: 0.15 }}
            >
              <Search size={13} style={{ color: '#a1a1aa', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Buscar..."
                className="bg-transparent outline-none"
                style={{
                  fontSize: '12px',
                  color: '#52525b',
                  width: '120px',
                  fontFamily: 'inherit',
                }}
              />
              <kbd
                style={{
                  fontSize: '10px',
                  fontFamily: 'ui-monospace, monospace',
                  padding: '1px 5px',
                  borderRadius: '5px',
                  background: 'rgba(0,0,0,0.05)',
                  color: '#a1a1aa',
                  border: '1px solid rgba(0,0,0,0.09)',
                  flexShrink: 0,
                }}
              >
                ⌘K
              </kbd>
            </motion.div>

            {/* Notifications */}
            <motion.button
              className="flex items-center justify-center rounded-xl relative"
              style={{
                width: '34px',
                height: '34px',
                background: '#f4f4f5',
                border: '1px solid rgba(0,0,0,0.09)',
              }}
              whileHover={{ backgroundColor: '#ebebec', borderColor: 'rgba(0,0,0,0.16)' }}
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.13 }}
            >
              <Bell size={14} style={{ color: '#71717a' }} />
              <motion.span
                className="absolute rounded-full"
                style={{
                  top: '8px',
                  right: '8px',
                  width: '6px',
                  height: '6px',
                  background: '#6366f1',
                }}
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
              />
            </motion.button>

            {/* Avatar */}
            <motion.div
              className="flex items-center justify-center rounded-full font-bold text-white cursor-pointer"
              style={{
                width: '34px',
                height: '34px',
                fontSize: '12px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                boxShadow: '0 2px 8px rgba(99,102,241,0.28)',
              }}
              whileHover={{ scale: 1.07, boxShadow: '0 4px 14px rgba(99,102,241,0.38)' }}
              whileTap={{ scale: 0.94 }}
              transition={{ duration: 0.15 }}
            >
              {inicial}
            </motion.div>
          </div>
        </div>

        {/* Page content */}
        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname}
            className="flex-1 overflow-y-auto"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
