import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Calendar, ShoppingCart, Wallet, Users,
  Scissors, Package, Truck, BarChart2, ArrowDownCircle, ArrowUpCircle,
  Percent, FileBarChart, FileText, ClipboardList, Settings, UserCog, LogOut, Sun, Moon, Building2, Tags,
  ChevronDown, ChevronRight, FolderOpen, ArrowLeftRight, Receipt,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { usePerfil } from '../../hooks/usePerfil'
import { usePermissoes } from '../../hooks/usePermissoes'
import { useLoja } from '../../hooks/useLoja'
import { useTema } from '../../hooks/useTema'
import { initials } from '../../lib/utils'
import { PAPEL_LABEL } from '../../lib/permissoes'
import type { TelaId } from '../../types'

const NAV_SUPER_ADMIN = [
  { to: '/empresas',     icon: Building2,       label: 'Empresas'      },
  { to: '/cobrancas',    icon: Receipt,         label: 'Cobranças'     },
]

// tela: permissão de "ver" que libera o item; gestao: só administrador/gerente.
type NavItemDef = { to: string; icon: typeof LayoutDashboard; label: string; tela?: TelaId; gestao?: boolean }

const NAV_TOPO: NavItemDef[] = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard', tela: 'dashboard' },
]

const NAV_GRUPOS: { label: string; icon: typeof LayoutDashboard; items: NavItemDef[] }[] = [
  {
    label: 'Cadastros',
    icon: FolderOpen,
    items: [
      { to: '/clientes',      icon: Users,    label: 'Clientes',      tela: 'clientes'      },
      { to: '/profissionais', icon: Scissors, label: 'Profissionais', tela: 'profissionais' },
      { to: '/produtos',      icon: Package,  label: 'Produtos',      tela: 'produtos'      },
      { to: '/fornecedores',  icon: Truck,    label: 'Fornecedores',  tela: 'fornecedores'  },
      { to: '/categorias',    icon: Tags,     label: 'Categorias',    tela: 'categorias'    },
      { to: '/usuarios',      icon: UserCog,     label: 'Usuários',   gestao: true },
    ],
  },
  {
    label: 'Movimentos',
    icon: ArrowLeftRight,
    items: [
      { to: '/agenda',         icon: Calendar,        label: 'Agenda',           tela: 'agenda'         },
      { to: '/vendas',         icon: ShoppingCart,    label: 'Vendas',           tela: 'pdv'            },
      { to: '/caixa',          icon: Wallet,          label: 'Caixa',            tela: 'caixa'          },
      { to: '/financeiro',     icon: BarChart2,       label: 'Financeiro',       tela: 'financeiro'     },
      { to: '/contas-pagar',   icon: ArrowUpCircle,   label: 'Contas a Pagar',   tela: 'contas_pagar'   },
      { to: '/contas-receber', icon: ArrowDownCircle, label: 'Contas a Receber', tela: 'contas_receber' },
      { to: '/comissoes',      icon: Percent,         label: 'Comissões',        tela: 'comissoes'      },
    ],
  },
  {
    label: 'Relatórios',
    icon: FileBarChart,
    items: [
      { to: '/dre',          icon: FileBarChart,  label: 'DRE',        tela: 'dre'        },
      { to: '/relatorios',   icon: FileText,      label: 'Relatórios', tela: 'relatorios' },
      { to: '/auditoria',    icon: ClipboardList, label: 'Auditoria',  tela: 'auditoria'  },
    ],
  },
]

const NAV_RODAPE: NavItemDef[] = [
  { to: '/configuracoes', icon: Settings, label: 'Configurações', tela: 'configuracoes' },
]

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) {
  return (
    <NavLink to={to} style={{ display: 'block', marginBottom: '2px' }}>
      {({ isActive }) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            color: isActive ? 'var(--c-fff)' : 'var(--c-66)',
            background: isActive ? 'rgba(var(--ink),0.07)' : 'transparent',
            fontSize: '13px',
            fontWeight: isActive ? 500 : 400,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={e => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.color = 'var(--c-a3)'
              ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(var(--ink),0.04)'
            }
          }}
          onMouseLeave={e => {
            if (!isActive) {
              (e.currentTarget as HTMLDivElement).style.color = 'var(--c-66)'
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }
          }}
        >
          <Icon size={15} strokeWidth={isActive ? 2.2 : 1.75} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{label}</span>
          {isActive && (
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--c-fff)', flexShrink: 0 }} />
          )}
        </div>
      )}
    </NavLink>
  )
}

// Uma linha curta por tela, mostrada no painel que abre ao lado do menu.
const DESCRICAO_ITEM: Record<string, string> = {
  '/clientes': 'Cadastro e histórico dos clientes',
  '/profissionais': 'Barbeiros, especialidades e comissão',
  '/produtos': 'Produtos, serviços, estoque e etiquetas',
  '/fornecedores': 'Quem fornece mercadoria para a loja',
  '/categorias': 'Plano de contas e formas de pagamento',
  '/usuarios': 'Equipe, senhas, comissões e permissões',
  '/agenda': 'Horários marcados por profissional',
  '/vendas': 'Vendas de serviços e produtos',
  '/caixa': 'Abrir, fechar, sangria e suprimento',
  '/financeiro': 'Contas Caixa/Banco e lançamentos',
  '/contas-pagar': 'Despesas, parcelas e pagamentos',
  '/contas-receber': 'Valores a receber e baixas',
  '/comissoes': 'Comissões geradas nas vendas',
  '/dre': 'Resultado do período',
  '/relatorios': 'Vendas, caixa, estoque e agenda',
  '/auditoria': 'Quem alterou o quê e quando',
}

function useTelaPequena() {
  const [pequena, setPequena] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const atualizar = () => setPequena(mq.matches)
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [])
  return pequena
}

/**
 * Grupo do menu (Cadastros, Movimentos, Relatórios).
 * Computador: passar o mouse abre um painel AO LADO do menu com as
 * telas do grupo e uma descrição curta de cada uma; clicar deixa o
 * painel fixo (fecha com outro clique, Esc, clique fora ou ao escolher
 * uma tela).
 * Celular: o menu já é uma gaveta estreita, então o grupo abre para baixo.
 * O título do grupo mantém sempre a mesma cor; um ponto indica que a
 * tela atual está dentro dele.
 *
 * O que fazia o painel "sumir": cada grupo tinha um timer de fechar que
 * fechava QUALQUER painel aberto — saindo de Cadastros para Movimentos,
 * o timer de Cadastros fechava o painel de Movimentos que tinha acabado
 * de abrir; e clicar no grupo logo depois do hover fechava o painel.
 * Agora onFechar só fecha o próprio grupo, o clique fixa em vez de
 * fechar, a zona do painel cobre o vão até o menu e, com outro painel
 * aberto, o hover espera um instante antes de trocar (passar por cima de
 * um grupo no caminho até o painel não troca de painel).
 */
function NavGroup({ label, icon: Icon, items, ativo, aberto, outroAberto, onAbrir, onFechar }: {
  label: string
  icon: typeof LayoutDashboard
  items: NavItemDef[]
  ativo: boolean
  aberto: boolean
  /** Outro grupo está com o painel aberto agora. */
  outroAberto: boolean
  onAbrir: () => void
  /** Fecha o painel DESTE grupo (não mexe no de outro). */
  onFechar: () => void
}) {
  const pequena = useTelaPequena()
  const [abertoMobile, setAbertoMobile] = useState(ativo)
  const botaoRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)
  const fecharTimer = useRef<number | null>(null)
  const abrirTimer = useRef<number | null>(null)
  const fixado = useRef(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  function limparTimers() {
    if (fecharTimer.current) { window.clearTimeout(fecharTimer.current); fecharTimer.current = null }
    if (abrirTimer.current) { window.clearTimeout(abrirTimer.current); abrirTimer.current = null }
  }
  function cancelarFechar() {
    if (fecharTimer.current) { window.clearTimeout(fecharTimer.current); fecharTimer.current = null }
  }
  function fechar() {
    limparTimers()
    fixado.current = false
    onFechar()
  }
  function fecharDepois() {
    if (fixado.current) return
    cancelarFechar()
    fecharTimer.current = window.setTimeout(() => { fecharTimer.current = null; onFechar() }, 280)
  }
  function abrir() {
    limparTimers()
    const r = botaoRef.current?.getBoundingClientRect()
    const menu = botaoRef.current?.closest('.app-sidebar')?.getBoundingClientRect()
    if (r) setPos({ top: r.top, left: menu?.right ?? r.right })
    onAbrir()
  }
  function entrarNoGrupo() {
    if (pequena) return
    cancelarFechar()
    if (aberto) return
    if (abrirTimer.current) window.clearTimeout(abrirTimer.current)
    abrirTimer.current = window.setTimeout(() => { abrirTimer.current = null; abrir() }, outroAberto ? 170 : 60)
  }
  function sairDoGrupo() {
    if (pequena) return
    if (abrirTimer.current) { window.clearTimeout(abrirTimer.current); abrirTimer.current = null }
    if (aberto) fecharDepois()
  }
  function clicar() {
    if (pequena) { setAbertoMobile(o => !o); return }
    if (!aberto) { abrir(); fixado.current = true; return }
    // Aberto pelo hover: o clique só deixa fixo (antes fechava).
    if (!fixado.current) { cancelarFechar(); fixado.current = true; return }
    fechar()
  }

  // Fechou por fora (outro grupo, troca de tela): deixa de estar fixo.
  useEffect(() => { if (!aberto) fixado.current = false }, [aberto])

  // Mantém o painel inteiro dentro da tela (grupo perto do rodapé).
  useLayoutEffect(() => {
    if (!aberto || !pos || !painelRef.current) return
    const altura = painelRef.current.offsetHeight
    const max = window.innerHeight - altura - 8
    if (pos.top > max) setPos(p => p && { ...p, top: Math.max(8, max) })
  }, [aberto, pos])

  // Fecha com Esc ou clique fora.
  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      const alvo = e.target as Node
      if (!painelRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) {
        fixado.current = false
        onFechar()
      }
    }
    function tecla(e: KeyboardEvent) { if (e.key === 'Escape') { fixado.current = false; onFechar() } }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla) }
  }, [aberto, onFechar])

  useEffect(() => limparTimers, [])

  const cabecalho = (
    <button
      ref={botaoRef}
      className={`nav-grupo${aberto && !pequena ? ' aberto' : ''}`}
      aria-expanded={pequena ? abertoMobile : aberto}
      onClick={clicar}
      onMouseEnter={entrarNoGrupo}
      onMouseLeave={sairDoGrupo}
    >
      <Icon size={14} strokeWidth={1.9} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      {ativo && <span className="nav-grupo-ponto" title="A tela atual está neste grupo" />}
      {pequena
        ? <ChevronDown size={13} style={{ flexShrink: 0, transform: abertoMobile ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
        : <ChevronRight size={13} style={{ flexShrink: 0 }} />}
    </button>
  )

  if (pequena) {
    return (
      <div style={{ marginBottom: '2px' }}>
        {cabecalho}
        <AnimatePresence initial={false}>
          {abertoMobile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ padding: '2px 0 4px' }}>
                {items.map(item => <NavItem key={item.to} {...item} />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '2px' }}>
      {cabecalho}
      {createPortal(
        <AnimatePresence>
          {aberto && pos && (
            <motion.div
              ref={painelRef}
              className="nav-painel-zona"
              style={{ top: pos.top, left: pos.left }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
              onMouseEnter={cancelarFechar}
              onMouseLeave={fecharDepois}
            >
              <div className="nav-painel" role="menu" aria-label={label}>
                <p className="nav-painel-titulo">{label}</p>
                {items.map(({ to, icon: ItemIcon, label: itemLabel }) => (
                  <NavLink key={to} to={to} role="menuitem" className={({ isActive }) => `nav-painel-item${isActive ? ' ativo' : ''}`} onClick={fechar}>
                    <span className="nav-painel-icone"><ItemIcon size={15} strokeWidth={1.8} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="nav-painel-nome">{itemLabel}</span>
                      {DESCRICAO_ITEM[to] && <span className="nav-painel-desc">{DESCRICAO_ITEM[to]}</span>}
                    </span>
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}

export default function Sidebar({ hidden }: { hidden: boolean }) {
  const { user, signOut } = useAuth()
  const { papel } = usePerfil()
  const { tema, alternar: alternarTema } = useTema()
  const { podeVer, gerenciaEquipe } = usePermissoes()
  const visivel = (item: NavItemDef) => item.gestao ? gerenciaEquipe : !item.tela || podeVer(item.tela)
  const grupos = NAV_GRUPOS
    .map(g => ({ ...g, items: g.items.filter(visivel) }))
    .filter(g => g.items.length > 0)
  const navigate = useNavigate()
  const location = useLocation()
  const name = user?.email?.split('@')[0] ?? 'Usuário'
  const ini = initials(name)
  const isSuperAdmin = papel === 'super_admin'
  const { nome: nomeLoja, logoUrl } = useLoja()
  const tituloMenu = isSuperAdmin ? 'Barber' : (nomeLoja ?? '')
  // Só um painel lateral aberto por vez; fecha ao trocar de tela.
  // Fechar um grupo nunca fecha o painel de outro.
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null)
  const fecharGrupo = useCallback((label: string) => setGrupoAberto(g => (g === label ? null : g)), [])
  const fechadores = useMemo(
    () => Object.fromEntries(NAV_GRUPOS.map(g => [g.label, () => fecharGrupo(g.label)])) as Record<string, () => void>,
    [fecharGrupo],
  )
  useEffect(() => { setGrupoAberto(null) }, [location.pathname, hidden])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <motion.aside
      className="app-sidebar"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--c-11)',
        borderRight: hidden ? 'none' : '1px solid var(--c-1f)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
      initial={false}
      animate={{ width: hidden ? 0 : 220, opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Logo */}
      <div style={{
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 20px',
        borderBottom: '1px solid var(--c-1f)',
        flexShrink: 0,
      }}>
        {/* Logo e nome da loja (Configurações); sem logo cadastrado, o padrão. */}
        <img
          src={logoUrl ?? `${import.meta.env.BASE_URL}logo.png`}
          className={logoUrl ? undefined : 'logo-padrao'}
          alt={tituloMenu || 'Logo'}
          style={{
            width: '32px',
            height: '32px',
            objectFit: 'contain',
            borderRadius: logoUrl ? '8px' : 0,
            flexShrink: 0,
          }}
        />
        <span
          title={tituloMenu}
          style={{
            fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', letterSpacing: '-0.01em', lineHeight: 1.25,
            minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}
        >
          {tituloMenu}
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '16px 8px', overflowY: 'auto' }}>
        {isSuperAdmin ? (
          NAV_SUPER_ADMIN.map(item => <NavItem key={item.to} {...item} />)
        ) : (
          <>
            {NAV_TOPO.filter(visivel).map(item => <NavItem key={item.to} {...item} />)}
            <div style={{ height: '10px' }} />
            {grupos.map(grupo => (
              <NavGroup
                key={grupo.label}
                label={grupo.label}
                icon={grupo.icon}
                items={grupo.items}
                ativo={grupo.items.some(i => location.pathname.startsWith(i.to))}
                aberto={grupoAberto === grupo.label}
                outroAberto={grupoAberto !== null && grupoAberto !== grupo.label}
                onAbrir={() => setGrupoAberto(grupo.label)}
                onFechar={fechadores[grupo.label]}
              />
            ))}
            <div style={{ height: '10px' }} />
            {NAV_RODAPE.filter(visivel).map(item => <NavItem key={item.to} {...item} />)}
          </>
        )}
      </nav>

      {/* User */}
      <div style={{ padding: '12px 8px 16px', borderTop: '1px solid var(--c-1f)', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 12px',
          borderRadius: '8px',
          cursor: 'pointer',
        }}>
          <div style={{
            width: '30px', height: '30px',
            borderRadius: '50%',
            background: 'var(--c-26)',
            border: '1px solid var(--c-33)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--c-a3)',
            flexShrink: 0,
          }}>
            {ini}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--c-fff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            <p style={{ fontSize: '10px', color: 'var(--c-44)' }}>{papel ? PAPEL_LABEL[papel] : '—'}</p>
          </div>
          <button
            onClick={alternarTema}
            title={tema === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
            aria-label={tema === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'}
            style={{
              width: '26px', height: '26px',
              border: 'none',
              background: 'transparent',
              color: 'var(--c-44)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget).style.background = 'rgba(var(--ink),0.06)'
              ;(e.currentTarget).style.color = 'var(--c-a3)'
            }}
            onMouseLeave={e => {
              (e.currentTarget).style.background = 'transparent'
              ;(e.currentTarget).style.color = 'var(--c-44)'
            }}
          >
            {tema === 'light' ? <Moon size={13} /> : <Sun size={13} />}
          </button>
          <button
            onClick={handleSignOut}
            title="Sair"
            style={{
              width: '26px', height: '26px',
              border: 'none',
              background: 'transparent',
              color: 'var(--c-44)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '6px',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget).style.background = 'rgba(var(--ink),0.06)'
              ;(e.currentTarget).style.color = 'var(--c-a3)'
            }}
            onMouseLeave={e => {
              (e.currentTarget).style.background = 'transparent'
              ;(e.currentTarget).style.color = 'var(--c-44)'
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </motion.aside>
  )
}
