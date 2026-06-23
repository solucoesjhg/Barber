import { Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Bell, Search } from 'lucide-react'
import Sidebar from './Sidebar'

const PAGE_NAMES: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/agenda':        'Agenda',
  '/pdv':           'PDV',
  '/clientes':      'Clientes',
  '/profissionais': 'Profissionais',
  '/produtos':      'Produtos',
  '/financeiro':    'Financeiro',
}

export default function AppLayout() {
  const location = useLocation()
  const pageName = PAGE_NAMES[location.pathname] ?? ''

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0D0D0D' }}>
      <Sidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <div style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          background: '#0D0D0D',
          borderBottom: '1px solid #1F1F1F',
          flexShrink: 0,
        }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#3D3D3D' }}>BarberOS</span>
            {pageName && (
              <>
                <ChevronRight size={12} style={{ color: '#2A2A2A' }} />
                <span style={{ fontSize: '12px', color: '#A3A3A3', fontWeight: 500 }}>{pageName}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Search */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              background: '#1A1A1A',
              border: '1px solid #252525',
              borderRadius: '8px',
              cursor: 'text',
            }}>
              <Search size={12} style={{ color: '#444' }} />
              <input
                type="text"
                placeholder="Buscar..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  color: '#A3A3A3',
                  width: '110px',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Notifications */}
            <button style={{
              width: '34px', height: '34px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#1A1A1A',
              border: '1px solid #252525',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#555',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}>
              <Bell size={13} />
              <span style={{
                position: 'absolute',
                top: '8px', right: '8px',
                width: '5px', height: '5px',
                background: '#FFFFFF',
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
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
