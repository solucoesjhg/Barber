import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AppLayout from './components/layout/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agenda from './pages/Agenda'
import PDV from './pages/PDV'
import Clientes from './pages/Clientes'
import Profissionais from './pages/Profissionais'
import Produtos from './pages/Produtos'
import Financeiro from './pages/Financeiro'

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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<PrivateRoute><AppLayout /></PrivateRoute>}>
          <Route path="/dashboard"     element={<Dashboard />} />
          <Route path="/agenda"        element={<Agenda />} />
          <Route path="/pdv"           element={<PDV />} />
          <Route path="/clientes"      element={<Clientes />} />
          <Route path="/profissionais" element={<Profissionais />} />
          <Route path="/produtos"      element={<Produtos />} />
          <Route path="/financeiro"    element={<Financeiro />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
