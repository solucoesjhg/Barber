import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Calendar, ShoppingCart, Users,
  Scissors, Package, BarChart2, LogOut,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { initials } from '../../lib/utils'

const NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/agenda',       icon: Calendar,        label: 'Agenda'        },
  { to: '/pdv',          icon: ShoppingCart,    label: 'PDV'           },
  { to: '/clientes',     icon: Users,           label: 'Clientes'      },
  { to: '/profissionais',icon: Scissors,        label: 'Profissionais' },
  { to: '/produtos',     icon: Package,         label: 'Produtos'      },
  { to: '/financeiro',   icon: BarChart2,       label: 'Financeiro'    },
]

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink to={to} style={{ display: 'block', marginBottom: '2px' }}>
      {({ isActive }) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            color: isActive ? '#FFFFFF' : '#666666',
            background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
            fontSize: '13px',
            fontWeight: isActive ? 500 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.color = '#A3A3A3'
              ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.color = '#666666'
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }
          }}
        >
          <Icon size={15} strokeWidth={isActive ? 2.2 : 1.75} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{label}</span>
          {isActive && (
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#FFFFFF', flexShrink: 0 }} />
          )}
        </div>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const name = user?.email?.split('@')[0] ?? 'Usuário'
  const ini = initials(name)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <motion.aside
      style={{
        width: '220px',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#111111',
        borderRight: '1px solid #1F1F1F',
        flexShrink: 0,
      }}
      initial={{ x: -220, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Logo */}
      <div style={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 20px',
        borderBottom: '1px solid #1F1F1F',
        flexShrink: 0,
      }}>
        <div style={{
          width: '28px', height: '28px',
          background: '#FFFFFF',
          borderRadius: '7px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <line x1="20" y1="4" x2="8.12" y2="15.88"/>
            <line x1="14.47" y1="14.48" x2="20" y2="20"/>
            <line x1="8.12" y1="8.12" x2="12" y2="12"/>
          </svg>
        </div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
          BarberOS
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '9px',
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.08)',
          color: '#A3A3A3',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          ERP
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '20px 8px 16px', overflowY: 'auto' }}>
        <p style={{
          fontSize: '9px',
          fontWeight: 600,
          color: '#3D3D3D',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          padding: '0 12px',
          marginBottom: '10px',
        }}>
          Menu
        </p>
        {NAV.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* User */}
      <div style={{ padding: '12px 8px 16px', borderTop: '1px solid #1F1F1F', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          borderRadius: '8px',
          cursor: 'pointer',
        }}>
          <div style={{
            width: '30px', height: '30px',
            borderRadius: '50%',
            background: '#262626',
            border: '1px solid #333',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: '#A3A3A3',
            flexShrink: 0,
          }}>
            {ini}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            <p style={{ fontSize: '10px', color: '#444' }}>Administrador</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sair"
            style={{
              width: '26px', height: '26px',
              border: 'none',
              background: 'transparent',
              color: '#444',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget).style.background = 'rgba(255,255,255,0.06)'
              ;(e.currentTarget).style.color = '#A3A3A3'
            }}
            onMouseLeave={e => {
              (e.currentTarget).style.background = 'transparent'
              ;(e.currentTarget).style.color = '#444'
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </motion.aside>
  )
}
