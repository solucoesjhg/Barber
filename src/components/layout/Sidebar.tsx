import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Calendar, Users, UserCheck, Briefcase,
  DollarSign, Settings, LogOut, Building2,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { stagger, staggerItem } from '../../lib/motion'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agenda',    icon: Calendar,         label: 'Agenda'     },
  { to: '/clientes',  icon: Users,            label: 'Clientes'   },
  { to: '/funcionarios', icon: UserCheck,     label: 'Funcionários' },
  { to: '/servicos',  icon: Briefcase,        label: 'Serviços'   },
  { to: '/caixa',     icon: DollarSign,       label: 'Caixa'      },
]

const adminItems = [
  { to: '/usuarios', icon: Settings,   label: 'Usuários' },
  { to: '/empresa',  icon: Building2,  label: 'Empresa'  },
]

const SIDEBAR_BG   = '#0c0c0e'
const BORDER_COLOR = 'rgba(255,255,255,0.07)'

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink to={to} style={{ display: 'block' }}>
      {({ isActive }) => (
        <motion.div
          className="flex items-center gap-2.5 px-2.5 rounded-lg text-[13px] font-medium cursor-pointer"
          style={{
            height: '34px',
            color: isActive ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.4)',
            background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
            marginBottom: '1px',
          }}
          whileHover={
            !isActive
              ? { backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.72)' }
              : {}
          }
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.13 }}
        >
          <Icon
            size={15}
            strokeWidth={isActive ? 2.1 : 1.75}
            style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}
          />
          <span style={{ flex: 1 }}>{label}</span>
          {isActive && (
            <motion.div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: 'var(--accent)' }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            />
          )}
        </motion.div>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { usuario, signOut } = useAuth()
  const navigate = useNavigate()
  const isAdmin = usuario?.papel_us === 'admin' || usuario?.papel_us === 'gerente'
  const nome = usuario?.perfis?.nome_pe ?? 'Usuário'
  const inicial = nome.charAt(0).toUpperCase()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <motion.aside
      className="flex flex-col select-none flex-shrink-0"
      style={{
        width: '240px',
        minHeight: '100vh',
        background: SIDEBAR_BG,
        borderRight: `1px solid ${BORDER_COLOR}`,
      }}
      initial={{ x: -240, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.42, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 flex-shrink-0"
        style={{ height: '60px', borderBottom: `1px solid ${BORDER_COLOR}` }}
      >
        <motion.div
          className="flex items-center justify-center flex-shrink-0 rounded-xl"
          style={{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(145deg, #ffffff 0%, #d4d4d8 100%)',
          }}
          whileHover={{ scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <line x1="20" y1="4" x2="8.12" y2="15.88"/>
            <line x1="14.47" y1="14.48" x2="20" y2="20"/>
            <line x1="8.12" y1="8.12" x2="12" y2="12"/>
          </svg>
        </motion.div>

        <span
          className="font-semibold tracking-tight flex-1 min-w-0"
          style={{ fontSize: '13px', color: 'rgba(255,255,255,0.92)' }}
        >
          BarberOS
        </span>

        <div
          className="flex-shrink-0 font-bold uppercase tracking-widest rounded-md"
          style={{
            fontSize: '9px',
            padding: '2px 6px',
            background: 'rgba(200,169,81,0.2)',
            color: 'rgba(200,169,81,0.9)',
          }}
        >
          Pro
        </div>
      </div>

      {/* Nav */}
      <motion.nav
        className="flex-1 overflow-y-auto px-3"
        style={{ paddingTop: '20px', paddingBottom: '12px' }}
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        <p
          className="uppercase font-semibold tracking-widest px-2.5 mb-2"
          style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.16em' }}
        >
          Principal
        </p>

        {navItems.map(item => (
          <motion.div key={item.to} variants={staggerItem}>
            <NavItem {...item} />
          </motion.div>
        ))}

        {isAdmin && (
          <div style={{ marginTop: '20px' }}>
            <p
              className="uppercase font-semibold tracking-widest px-2.5 mb-2"
              style={{ fontSize: '9.5px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.16em' }}
            >
              Admin
            </p>
            {adminItems.map(item => (
              <motion.div key={item.to} variants={staggerItem}>
                <NavItem {...item} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.nav>

      {/* User */}
      <motion.div
        className="px-3 flex-shrink-0"
        style={{ paddingBottom: '16px', paddingTop: '12px', borderTop: `1px solid ${BORDER_COLOR}` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.div
          className="flex items-center gap-2.5 rounded-xl cursor-pointer group"
          style={{ padding: '8px 10px' }}
          whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
          transition={{ duration: 0.13 }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0 rounded-full font-bold"
            style={{
              width: '30px',
              height: '30px',
              fontSize: '11px',
              color: '#0f0f0f',
              background: 'linear-gradient(135deg, #C8A951 0%, #D4AF37 100%)',
              boxShadow: '0 2px 8px rgba(200,169,81,0.35)',
            }}
          >
            {inicial}
          </div>

          <div className="flex-1 min-w-0">
            <p
              className="font-semibold truncate leading-tight"
              style={{ fontSize: '12px', color: 'rgba(255,255,255,0.82)' }}
            >
              {nome}
            </p>
            <p
              className="capitalize mt-0.5"
              style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)' }}
            >
              {usuario?.papel_us}
            </p>
          </div>

          <motion.button
            onClick={handleSignOut}
            title="Sair"
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center"
            style={{
              width: '26px',
              height: '26px',
              color: 'rgba(255,255,255,0.35)',
              transition: 'opacity 0.15s ease',
            }}
            whileHover={{ backgroundColor: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.75)' }}
            whileTap={{ scale: 0.9 }}
          >
            <LogOut size={13} />
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.aside>
  )
}
