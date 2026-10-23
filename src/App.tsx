import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Empresas from './pages/Empresas'
import EmpresaDetalhe from './pages/EmpresaDetalhe'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import Vendas from './pages/Vendas'
import Caixa from './pages/Caixa'
import Clientes from './pages/Clientes'
import Profissionais from './pages/Profissionais'
import Produtos from './pages/Produtos'
import Fornecedores from './pages/Fornecedores'
import ContasPagar from './pages/ContasPagar'
import ContasReceber from './pages/ContasReceber'
import Comissoes from './pages/Comissoes'
import DRE from './pages/DRE'
import Relatorios from './pages/Relatorios'
import Auditoria from './pages/Auditoria'
import Configuracoes from './pages/Configuracoes'
import Usuarios from './pages/Usuarios'
import Financeiro from './pages/Financeiro'
import Categorias from './pages/Categorias'
import RotaPermitida from './components/RotaPermitida'
import { PermissoesProvider } from './hooks/usePermissoes'
import { LojaProvider } from './hooks/useLoja'

// Permissões agora ficam no cartão de cada usuário, em Usuários.
function IrParaUsuarios() {
  const { search } = useLocation()
  return <Navigate to={'/usuarios' + search} replace />
}

// A tela PDV passou a se chamar Vendas; links antigos continuam valendo.
function IrParaVendas() {
  const { search } = useLocation()
  return <Navigate to={'/vendas' + search} replace />
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0D0D0D',
    }}>
      <div style={{
        width: '18px', height: '18px',
        border: '2px solid #222',
        borderTopColor: '#FFFFFF',
        borderRadius: '50%',
        animation: 'spin 0.75s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
  return session ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Usuários são cadastrados pelo gerente/administrador em Usuários; sem cadastro público. */}
        <Route path="/cadastro" element={<Navigate to="/login" replace />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<PrivateRoute><PermissoesProvider><LojaProvider><AppLayout /></LojaProvider></PermissoesProvider></PrivateRoute>}>
          <Route path="/empresas"       element={<RotaPermitida superAdmin><Empresas /></RotaPermitida>} />
          <Route path="/empresas/:id"   element={<RotaPermitida superAdmin><EmpresaDetalhe /></RotaPermitida>} />
          <Route path="/dashboard"      element={<RotaPermitida tela="dashboard"><Dashboard /></RotaPermitida>} />
          <Route path="/agenda"         element={<RotaPermitida tela="agenda"><Agenda /></RotaPermitida>} />
          <Route path="/vendas"         element={<RotaPermitida tela="pdv"><Vendas /></RotaPermitida>} />
          <Route path="/pdv"            element={<IrParaVendas />} />
          <Route path="/caixa"          element={<RotaPermitida tela="caixa"><Caixa /></RotaPermitida>} />
          <Route path="/clientes"       element={<RotaPermitida tela="clientes"><Clientes /></RotaPermitida>} />
          <Route path="/profissionais"  element={<RotaPermitida tela="profissionais"><Profissionais /></RotaPermitida>} />
          <Route path="/produtos"       element={<RotaPermitida tela="produtos"><Produtos /></RotaPermitida>} />
          <Route path="/fornecedores"   element={<RotaPermitida tela="fornecedores"><Fornecedores /></RotaPermitida>} />
          <Route path="/financeiro"     element={<RotaPermitida tela="financeiro"><Financeiro /></RotaPermitida>} />
          <Route path="/categorias"     element={<RotaPermitida tela="categorias"><Categorias /></RotaPermitida>} />
          <Route path="/contas-pagar"   element={<RotaPermitida tela="contas_pagar"><ContasPagar /></RotaPermitida>} />
          <Route path="/contas-receber" element={<RotaPermitida tela="contas_receber"><ContasReceber /></RotaPermitida>} />
          <Route path="/comissoes"      element={<RotaPermitida tela="comissoes"><Comissoes /></RotaPermitida>} />
          <Route path="/dre"            element={<RotaPermitida tela="dre"><DRE /></RotaPermitida>} />
          <Route path="/relatorios"     element={<RotaPermitida tela="relatorios"><Relatorios /></RotaPermitida>} />
          <Route path="/auditoria"      element={<RotaPermitida tela="auditoria"><Auditoria /></RotaPermitida>} />
          <Route path="/configuracoes"  element={<RotaPermitida tela="configuracoes"><Configuracoes /></RotaPermitida>} />
          <Route path="/usuarios"       element={<RotaPermitida gestao><Usuarios /></RotaPermitida>} />
          <Route path="/permissoes"     element={<IrParaUsuarios />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
