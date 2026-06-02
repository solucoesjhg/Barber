import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Calendar, Users, UserCheck, Briefcase, DollarSign, Settings, LogOut, Building2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { stagger, staggerItem } from '../../lib/motion'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/funcionarios', icon: UserCheck, label: 'Funcionários' },
  { to: '/servicos', icon: Briefcase, label: 'Serviços' },
  { to: '/caixa', icon: DollarSign, label: 'Caixa' },
]

const adminItems = [
  { to: '/usuarios', icon: Settings, label: 'Usuários' },
  { to: '/empresa', icon: Building2, label: 'Empresa' },
]

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
      className="w-[218px] min-h-screen bg-white border-r border-gray-100/80 flex flex-col select-none"
      initial={{ x: -218, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Logo */}
      <div className="px-5 h-14 flex items-center gap-3 border-b border-gray-100/80">
        <motion.div
          className="w-7 h-7 bg-black rounded-lg flex items-center justify-center flex-shrink-0"
          whileHover={{ scale: 1.08 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
            <line x1="20" y1="4" x2="8.12" y2="15.88"/>
            <line x1="14.47" y1="14.48" x2="20" y2="20"/>
            <line x1="8.12" y1="8.12" x2="12" y2="12"/>
          </svg>
        </motion.div>
        <span className="font-semibold text-gray-900 text-[13px] tracking-tight">BarberOS</span>
      </div>

      {/* Nav */}
      <motion.nav
        className="flex-1 px-3 pt-4 pb-2 space-y-0.5 overflow-y-auto"
        variants={stagger}
        initial="initial"
        animate="animate"
      >
        {navItems.map(({ to, icon: Icon, label }) => (
          <motion.div key={to} variants={staggerItem}>
            <NavLink to={to}>
              {({ isActive }) => (
                <motion.div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-colors duration-150 ${
                    isActive
                      ? 'bg-black text-white'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  whileHover={!isActive ? { x: 2 } : {}}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <Icon size={15} className={isActive ? 'text-white' : 'text-gray-400'} />
                  {label}
                </motion.div>
              )}
            </NavLink>
          </motion.div>
        ))}

        {isAdmin && (
          <>
            <div className="px-3 pt-5 pb-2">
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-[0.15em]">Administração</span>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <motion.div key={to} variants={staggerItem}>
                <NavLink to={to}>
                  {({ isActive }) => (
                    <motion.div
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium cursor-pointer transition-colors duration-150 ${
                        isActive
                          ? 'bg-black text-white'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                      whileHover={!isActive ? { x: 2 } : {}}
                      whileTap={{ scale: 0.97 }}
                    >
                      <Icon size={15} className={isActive ? 'text-white' : 'text-gray-400'} />
                      {label}
                    </motion.div>
                  )}
                </NavLink>
              </motion.div>
            ))}
          </>
        )}
      </motion.nav>

      {/* Usuário */}
      <motion.div
        className="px-3 py-4 border-t border-gray-100/80"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.div
          className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50 transition-colors duration-150 group cursor-pointer"
          whileHover={{ x: 1 }}
        >
          <motion.div
            className="w-7 h-7 bg-black rounded-full flex items-center justify-center flex-shrink-0"
            whileHover={{ scale: 1.05 }}
          >
            <span className="text-[11px] font-semibold text-white">{inicial}</span>
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-900 truncate leading-tight">{nome}</p>
            <p className="text-[11px] text-gray-400 capitalize">{usuario?.papel_us}</p>
          </div>
          <motion.button
            onClick={handleSignOut}
            title="Sair"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
            whileTap={{ scale: 0.9 }}
          >
            <LogOut size={13} />
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.aside>
  )
}
