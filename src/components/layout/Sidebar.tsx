import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Calendar, Users, UserCheck, Briefcase, DollarSign, Settings, LogOut, Building2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

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
    <aside className="w-[220px] min-h-screen bg-white border-r border-gray-100 flex flex-col select-none">
      {/* Logo */}
      <div className="px-5 h-14 flex items-center gap-3 border-b border-gray-100">
        <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
          <ScissorsIcon />
        </div>
        <span className="font-semibold text-gray-900 text-sm tracking-tight">BarberOS</span>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-black text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'} />
                {label}
              </>
            )}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="px-3 pt-5 pb-2">
              <span className="text-[10px] font-semibold text-gray-300 uppercase tracking-widest">Administração</span>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-black text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={15} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'} />
                    {label}
                  </>
                )}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Usuário */}
      <div className="px-3 py-4 border-t border-gray-100">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition group">
          <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-white">{inicial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-900 truncate leading-tight">{nome}</p>
            <p className="text-[11px] text-gray-400 capitalize">{usuario?.papel_us}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sair"
            className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-gray-600"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function ScissorsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  )
}
