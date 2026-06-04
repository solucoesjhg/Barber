import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { fadeUp, stagger, staggerItem } from '../lib/motion'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [modo, setModo] = useState<'login' | 'recuperar' | 'enviado'>('login')
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await signIn(email, senha)
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
    else navigate('/dashboard')
    setLoading(false)
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 900))
    setModo('enviado')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* LEFT PANEL */}
      <motion.div
        className="hidden lg:flex lg:w-[52%] flex-col relative overflow-hidden"
        style={{ background: '#0a0a0a' }}
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}
        />

        {/* Radial glow */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(200,169,81,0.06) 0%, transparent 70%)' }}
        />

        {/* Decorative line */}
        <motion.div
          className="absolute right-0 top-0 bottom-0 w-px"
          style={{ background: 'linear-gradient(to bottom, transparent, rgba(200,169,81,0.15), transparent)' }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
        />

        {/* Logo */}
        <motion.div
          className="relative z-10 px-12 pt-12 flex items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <ScissorsIcon style={{ color: '#0f0f0f' }} size={15} />
          </div>
          <span className="font-semibold text-base tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>BarberOS</span>
        </motion.div>

        {/* Central content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12 pb-8">
          <motion.div variants={stagger} initial="initial" animate="animate">
            <motion.p
              variants={staggerItem}
              className="uppercase font-semibold tracking-[0.2em] mb-5"
              style={{ fontSize: '11px', color: 'var(--accent-text)', opacity: 0.7 }}
            >
              Sistema de Gestão
            </motion.p>
            <motion.h2
              variants={staggerItem}
              className="text-5xl font-semibold leading-[1.1] tracking-[-0.03em] mb-6"
              style={{ color: 'var(--text-primary)' }}
            >
              Sua barbearia<br />no próximo nível.
            </motion.h2>
            <motion.p
              variants={staggerItem}
              className="text-base leading-relaxed max-w-sm mb-14"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              Agenda inteligente, gestão de clientes, caixa e comissões — tudo em uma plataforma elegante.
            </motion.p>

            {/* Stats */}
            <motion.div variants={staggerItem} className="flex items-center gap-8">
              {[
                { value: '100%', label: 'Digital' },
                { value: '-60%', label: 'Tempo gasto' },
                { value: '∞', label: 'Escalável' },
              ].map((s, i) => (
                <div key={i}>
                  <p className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--accent)' }}>{s.value}</p>
                  <p className="text-xs mt-0.5 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.div
          className="relative z-10 px-12 pb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.18)' }}>© 2026 BarberOS. Todos os direitos reservados.</p>
        </motion.div>
      </motion.div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col items-center justify-center px-10 py-16 relative" style={{ background: 'var(--bg-secondary)' }}>

        {/* Mobile logo */}
        <motion.div
          className="lg:hidden flex items-center gap-2.5 mb-10"
          {...fadeUp}
        >
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <ScissorsIcon style={{ color: '#0f0f0f' }} size={15} />
          </div>
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>BarberOS</span>
        </motion.div>

        <div className="w-full max-w-[360px]">
          <AnimatePresence mode="wait">

            {/* LOGIN */}
            {modo === 'login' && (
              <motion.div
                key="login"
                variants={stagger}
                initial="initial"
                animate="animate"
                exit={{ opacity: 0, x: -20 }}
              >
                <motion.div variants={staggerItem} className="mb-8">
                  <h1
                    className="text-[28px] font-semibold tracking-[-0.02em] leading-tight"
                    style={{ color: 'var(--text-primary)', fontFamily: "'Playfair Display', serif" }}
                  >
                    Bem-vindo de volta
                  </h1>
                  <p className="text-sm mt-1.5 font-normal" style={{ color: 'var(--text-secondary)' }}>
                    Entre com sua conta para continuar
                  </p>
                </motion.div>

                <form onSubmit={handleLogin}>
                  <motion.div variants={staggerItem} className="space-y-5">

                    <InputField
                      label="E-mail"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      autoFocus
                      required
                    />

                    <div>
                      <div className="relative">
                        <InputField
                          label="Senha"
                          type={mostrarSenha ? 'text' : 'password'}
                          value={senha}
                          onChange={e => setSenha(e.target.value)}
                          placeholder="••••••••"
                          required
                          paddingRight
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarSenha(!mostrarSenha)}
                          className="absolute right-4 bottom-3 text-xs font-medium transition-colors duration-150"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {mostrarSenha ? 'Ocultar' : 'Ver'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <motion.label
                        className="flex items-center gap-2.5 cursor-pointer"
                        whileTap={{ scale: 0.97 }}
                      >
                        <motion.div
                          onClick={() => setLembrar(!lembrar)}
                          className="w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer transition-all duration-200"
                          style={{
                            background: lembrar ? 'var(--accent)' : 'transparent',
                            borderColor: lembrar ? 'var(--accent)' : 'var(--border)',
                          }}
                          animate={{ scale: lembrar ? [1, 0.88, 1] : 1 }}
                        >
                          {lembrar && (
                            <motion.svg
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.15 }}
                              width="10" height="7" viewBox="0 0 10 7" fill="none"
                            >
                              <path d="M1 3.5L3.5 6L9 1" stroke="#0f0f0f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </motion.svg>
                          )}
                        </motion.div>
                        <span className="text-sm select-none" style={{ color: 'var(--text-secondary)' }}>Lembrar acesso</span>
                      </motion.label>

                      <motion.button
                        type="button"
                        onClick={() => setModo('recuperar')}
                        className="text-sm transition-colors font-medium"
                        style={{ color: 'var(--text-muted)' }}
                        whileHover={{ color: '#F5F5F0' }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Esqueci a senha
                      </motion.button>
                    </div>

                    <AnimatePresence>
                      {erro && (
                        <motion.div
                          initial={{ opacity: 0, y: -6, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: -6, height: 0 }}
                          className="flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 overflow-hidden"
                          style={{
                            background: 'rgba(248,113,113,0.1)',
                            border: '1px solid rgba(248,113,113,0.25)',
                            color: 'var(--error)',
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="flex-shrink-0">
                            <circle cx="7.5" cy="7.5" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                            <path d="M7.5 4.5v3.5M7.5 10.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                          {erro}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <PrimaryButton loading={loading} label="Entrar" loadingLabel="Entrando..." />
                  </motion.div>
                </form>
              </motion.div>
            )}

            {/* RECUPERAR SENHA */}
            {modo === 'recuperar' && (
              <motion.div
                key="recuperar"
                variants={stagger}
                initial="initial"
                animate="animate"
                exit={{ opacity: 0, x: 20 }}
              >
                <motion.div variants={staggerItem} className="mb-8">
                  <motion.button
                    onClick={() => setModo('login')}
                    className="flex items-center gap-1.5 text-sm mb-5 transition-colors font-medium"
                    style={{ color: 'var(--text-muted)' }}
                    whileHover={{ x: -2, color: '#F5F5F0' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Voltar
                  </motion.button>
                  <h1
                    className="text-[28px] font-semibold tracking-[-0.02em]"
                    style={{ color: 'var(--text-primary)', fontFamily: "'Playfair Display', serif" }}
                  >
                    Recuperar senha
                  </h1>
                  <p className="text-sm mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Enviaremos um link para o seu e-mail
                  </p>
                </motion.div>

                <form onSubmit={handleRecuperar}>
                  <motion.div variants={staggerItem} className="space-y-5">
                    <InputField
                      label="E-mail"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      autoFocus
                      required
                    />
                    <PrimaryButton loading={loading} label="Enviar link" loadingLabel="Enviando..." />
                  </motion.div>
                </form>
              </motion.div>
            )}

            {/* EMAIL ENVIADO */}
            {modo === 'enviado' && (
              <motion.div
                key="enviado"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="text-center"
              >
                <motion.div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#C8A951" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="22,6 12,13 2,6" stroke="#C8A951" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-semibold mb-2"
                  style={{ color: 'var(--text-primary)', fontFamily: "'Playfair Display', serif" }}
                >
                  Verifique seu e-mail
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm mb-6 leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Enviamos um link de redefinição para<br />
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{email}</span>
                </motion.p>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => { setModo('login'); setErro('') }}
                  className="text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ← Voltar ao login
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function InputField({ label, paddingRight, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; paddingRight?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label
        className="block text-[11px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </label>
      <input
        {...props}
        className="input"
        style={paddingRight ? { paddingRight: '64px' } : undefined}
      />
    </div>
  )
}

function PrimaryButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      className="w-full rounded-xl text-sm font-semibold tracking-[-0.01em] mt-2 relative overflow-hidden"
      style={{
        padding: '14px',
        background: 'var(--accent)',
        color: '#0f0f0f',
        boxShadow: 'var(--shadow-accent)',
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        minHeight: '48px',
      }}
      whileHover={!loading ? { scale: 1.01, background: '#D4AF37' } : {}}
      whileTap={!loading ? { scale: 0.98 } : {}}
      transition={{ duration: 0.15 }}
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2"
          >
            <motion.span
              className="w-4 h-4 border-2 rounded-full"
              style={{ borderColor: 'rgba(0,0,0,0.2)', borderTopColor: '#0f0f0f' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
            {loadingLabel}
          </motion.span>
        ) : (
          <motion.span
            key="label"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

function ScissorsIcon({ className = '', style, size = 18 }: { className?: string; style?: React.CSSProperties; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  )
}
