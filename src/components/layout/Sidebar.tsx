import { NavLink } from 'react-router-dom'
import { Scissors, LayoutDashboard, Calendar, Users, UserCheck, Briefcase, DollarSign, Settings } from 'lucide-react'
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
  { to: '/usuarios', label: 'Usuários' },
  { to: '/empresa', label: 'Empresa' },
]

export default function Sidebar() {
  const { usuario, signOut } = useAuth()
  const isAdmin = usuario?.papel_us === 'admin' || usuario?.papel_us === 'gerente'

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-100 flex flex-col">
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-gray-100">
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
          <Scissors size={16} className="text-white" />
        </div>
        <span className="font-semibold text-gray-900 text-sm">BarberOS</span>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin</span>
            </div>
            {adminItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                    isActive
                      ? 'bg-gray-100 text-gray-900 font-medium'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`
                }
              >
                <Settings size={16} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
            {usuario?.perfis?.nome_pe?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{usuario?.perfis?.nome_pe ?? 'Usuário'}</p>
            <p className="text-xs text-gray-400 capitalize">{usuario?.papel_us}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full text-xs text-gray-400 hover:text-gray-700 text-left transition"
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
