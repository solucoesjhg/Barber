import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [erro, setErro]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showSenha, setShowSenha] = useState(false)
  const { signIn } = useAuth()
  const navigate   = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setLoading(true)
    const { error } = await signIn(email, senha)
    if (error) {
      setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
    } else {
      navigate('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0D0D',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <motion.div
        style={{ width: '100%', maxWidth: '380px' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '44px', height: '44px',
            background: '#FFFFFF',
            borderRadius: '11px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <line x1="20" y1="4" x2="8.12" y2="15.88"/>
              <line x1="14.47" y1="14.48" x2="20" y2="20"/>
              <line x1="8.12" y1="8.12" x2="12" y2="12"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '22px', color: '#FFFFFF', lineHeight: 1.2, marginBottom: '6px' }}>
            BarberOS
          </h1>
          <p style={{ fontSize: '13px', color: '#444' }}>Sistema de gestão</p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: '32px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="field">
              <label className="label">E-mail</label>
              <input
                className="input"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label className="label">Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showSenha ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha(s => !s)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#444', display: 'flex', alignItems: 'center',
                  }}
                >
                  {showSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {erro && (
              <p style={{ fontSize: '13px', color: '#888', textAlign: 'center', padding: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid #2A2A2A' }}>
                {erro}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
              style={{ marginTop: '4px' }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#333', marginTop: '24px' }}>
          BarberOS ERP © {new Date().getFullYear()}
        </p>
      </motion.div>
    </div>
  )
}
