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
    <div className="min-h-screen flex bg-white overflow-hidden">

      {/* PAINEL ESQUERDO */}
      <motion.div
        className="hidden lg:flex lg:w-[52%] bg-[#0a0a0a] flex-col relative overflow-hidden"
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Grid sutil */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}
        />

        {/* Gradiente radial suave */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)' }}
        />

        {/* Linha decorativa */}
        <motion.div
          className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent"
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
          <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center">
            <ScissorsIcon className="text-black" size={15} />
          </div>
          <span className="text-white font-semibold text-base tracking-tight">BarberOS</span>
        </motion.div>

        {/* Conteúdo central */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12 pb-8">
          <motion.div
            variants={stagger}
            initial="initial"
            animate="animate"
          >
            <motion.p
              variants={staggerItem}
              className="text-white/30 text-xs font-semibold uppercase tracking-[0.2em] mb-5"
            >
              Sistema de Gestão
            </motion.p>
            <motion.h2
              variants={staggerItem}
              className="text-white text-5xl font-semibold leading-[1.1] tracking-[-0.03em] mb-6"
            >
              Sua barbearia<br />no próximo nível.
            </motion.h2>
            <motion.p
              variants={staggerItem}
              className="text-white/40 text-base leading-relaxed max-w-sm mb-14"
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
                  <p className="text-white text-2xl font-semibold tracking-tight">{s.value}</p>
                  <p className="text-white/30 text-xs mt-0.5 font-medium">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Rodapé */}
        <motion.div
          className="relative z-10 px-12 pb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
        >
          <p className="text-white/20 text-xs">© 2026 BarberOS. Todos os direitos reservados.</p>
        </motion.div>
      </motion.div>

      {/* PAINEL DIREITO */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative bg-white">

        {/* Logo mobile */}
        <motion.div
          className="lg:hidden flex items-center gap-2.5 mb-10"
          {...fadeUp}
        >
          <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
            <ScissorsIcon className="text-white" size={15} />
          </div>
          <span className="font-semibold text-gray-900">BarberOS</span>
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
                  <h1 className="text-[28px] font-semibold text-gray-900 tracking-[-0.02em] leading-tight">
                    Bem-vindo de volta
                  </h1>
                  <p className="text-sm text-gray-400 mt-1.5 font-normal">Entre com sua conta para continuar</p>
                </motion.div>

                <form onSubmit={handleLogin}>
                  <motion.div variants={staggerItem} className="space-y-4">

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
                          className="absolute right-4 bottom-3 text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors duration-150"
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
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer transition-all duration-200 ${lembrar ? 'bg-black border-black' : 'border-gray-300 hover:border-gray-400'}`}
                          animate={{ scale: lembrar ? [1, 0.88, 1] : 1 }}
                        >
                          {lembrar && (
                            <motion.svg
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.15 }}
                              width="10" height="7" viewBox="0 0 10 7" fill="none"
                            >
                              <path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </motion.svg>
                          )}
                        </motion.div>
                        <span className="text-sm text-gray-600 select-none">Lembrar acesso</span>
                      </motion.label>

                      <motion.button
                        type="button"
                        onClick={() => setModo('recuperar')}
                        className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium"
                        whileHover={{ scale: 1.02 }}
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
                          className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3 overflow-hidden"
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
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-5 transition-colors font-medium"
                    whileHover={{ x: -2 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Voltar
                  </motion.button>
                  <h1 className="text-[28px] font-semibold text-gray-900 tracking-[-0.02em]">Recuperar senha</h1>
                  <p className="text-sm text-gray-400 mt-1.5">Enviaremos um link para o seu e-mail</p>
                </motion.div>

                <form onSubmit={handleRecuperar}>
                  <motion.div variants={staggerItem} className="space-y-4">
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
                  className="w-16 h-16 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="22,6 12,13 2,6" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.div>
                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-semibold text-gray-900 mb-2"
                >
                  Verifique seu e-mail
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm text-gray-400 mb-6 leading-relaxed"
                >
                  Enviamos um link de redefinição para<br />
                  <span className="font-medium text-gray-700">{email}</span>
                </motion.p>
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => { setModo('login'); setErro('') }}
                  className="text-sm text-gray-500 hover:text-gray-900 font-medium transition-colors"
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
      <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
      <input
        {...props}
        className={`w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/80 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-gray-300 focus:bg-white focus:ring-4 focus:ring-black/[0.04] transition-all duration-200 ${paddingRight ? 'pr-16' : ''}`}
      />
    </div>
  )
}

function PrimaryButton({ loading, label, loadingLabel }: { loading: boolean; label: string; loadingLabel: string }) {
  return (
    <motion.button
      type="submit"
      disabled={loading}
      className="w-full bg-[#0a0a0a] text-white py-3.5 rounded-xl text-sm font-semibold tracking-[-0.01em] disabled:opacity-40 disabled:cursor-not-allowed mt-2 relative overflow-hidden"
      whileHover={{ scale: 1.01, backgroundColor: '#1a1a1a' }}
      whileTap={{ scale: 0.98 }}
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
              className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full"
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

function ScissorsIcon({ className = '', size = 18 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/>
      <line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  )
}
