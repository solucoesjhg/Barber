import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [lembrar, setLembrar] = useState(false)
  const [recuperar, setRecuperar] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await signIn(email, senha)
    if (error) setErro(error.message)
    else navigate('/dashboard')
    setLoading(false)
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setEmailEnviado(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* Painel esquerdo — visual */}
      <div className="hidden lg:flex lg:w-1/2 bg-black flex-col justify-between p-12 relative overflow-hidden">
        {/* Textura sutil */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
            <ScissorsIcon />
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">BarberOS</span>
        </div>

        <div className="relative z-10">
          <p className="text-white/30 text-sm font-medium uppercase tracking-widest mb-4">Sistema de Gestão</p>
          <h2 className="text-white text-4xl font-semibold leading-tight tracking-tight mb-6">
            Sua barbearia<br />no próximo nível.
          </h2>
          <p className="text-white/50 text-base leading-relaxed max-w-sm">
            Agenda, clientes, caixa e comissões em uma plataforma simples e poderosa.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-6">
          <Stat label="Agendamentos" value="100%" desc="automatizados" />
          <div className="w-px h-10 bg-white/10" />
          <Stat label="Tempo" value="-60%" desc="em gestão manual" />
          <div className="w-px h-10 bg-white/10" />
          <Stat label="Visibilidade" value="Total" desc="do negócio" />
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo mobile */}
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center">
            <ScissorsIcon className="text-white" size={16} />
          </div>
          <span className="font-semibold text-gray-900">BarberOS</span>
        </div>

        <div className="w-full max-w-sm">
          {!recuperar ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Bem-vindo de volta</h1>
                <p className="text-sm text-gray-400 mt-1">Entre com sua conta para continuar</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-100 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Senha</label>
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={senha}
                      onChange={e => setSenha(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-100 transition-all pr-14"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium transition"
                    >
                      {mostrarSenha ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div
                      onClick={() => setLembrar(!lembrar)}
                      className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${lembrar ? 'bg-black border-black' : 'border-gray-300 group-hover:border-gray-400'}`}
                    >
                      {lembrar && <svg width="10" height="7" viewBox="0 0 10 7" fill="none"><path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="text-sm text-gray-600">Lembrar acesso</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setRecuperar(true)}
                    className="text-sm text-gray-500 hover:text-gray-900 transition font-medium"
                  >
                    Esqueci a senha
                  </button>
                </div>

                {erro && (
                  <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    {erro}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2 shadow-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Entrando...
                    </span>
                  ) : 'Entrar'}
                </button>
              </form>
            </>
          ) : emailEnviado ? (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M20 12V22H4V12" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 7H2v5h20V7z" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifique seu e-mail</h2>
              <p className="text-sm text-gray-500 mb-6">Enviamos um link de redefinição para <strong className="text-gray-700">{email}</strong></p>
              <button onClick={() => { setRecuperar(false); setEmailEnviado(false) }} className="text-sm text-gray-500 hover:text-gray-900 font-medium transition">
                ← Voltar ao login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Recuperar senha</h1>
                <p className="text-sm text-gray-400 mt-1">Enviaremos um link para o seu e-mail</p>
              </div>

              <form onSubmit={handleRecuperar} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoFocus
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:bg-white focus:ring-4 focus:ring-gray-100 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-gray-900 active:scale-[0.98] transition-all disabled:opacity-40 mt-2 shadow-sm"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </span>
                  ) : 'Enviar link'}
                </button>

                <button
                  type="button"
                  onClick={() => setRecuperar(false)}
                  className="w-full text-sm text-gray-500 hover:text-gray-900 py-2 transition font-medium"
                >
                  ← Voltar ao login
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-12 text-xs text-gray-300">© 2026 BarberOS. Todos os direitos reservados.</p>
      </div>
    </div>
  )
}

function Stat({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div>
      <p className="text-white/40 text-xs mb-1">{label}</p>
      <p className="text-white text-xl font-semibold leading-none">{value}</p>
      <p className="text-white/30 text-xs mt-0.5">{desc}</p>
    </div>
  )
}

function ScissorsIcon({ className = 'text-black', size = 18 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>
      <line x1="8.12" y1="8.12" x2="12" y2="12"/>
    </svg>
  )
}
