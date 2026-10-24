import { useState, useEffect, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus, Search, X, Wallet, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { dataLocalISO } from '../lib/periodo'
import { inicioDoMes, rotuloCompetencia, situacaoMensalidade, type SituacaoMensalidade } from '../lib/mensalidades'
import StatCard from '../components/ui/StatCard'
import MensalidadesLista from '../components/admin/MensalidadesLista'
import NovaCobrancaModal from '../components/admin/NovaCobrancaModal'
import type { Empresa, Mensalidade } from '../types'

type Filtro = 'todas' | SituacaoMensalidade
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'atrasada', label: 'Em atraso' },
  { id: 'pendente', label: 'A vencer' },
  { id: 'paga', label: 'Pagas' },
  { id: 'cancelada', label: 'Canceladas' },
]

/** Super admin: cobranças das lojas (mensalidade da plataforma). */
export default function Cobrancas() {
  const [mes, setMes] = useState(dataLocalISO().slice(0, 7))
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([])
  const [atrasadasAntigas, setAtrasadasAntigas] = useState<Mensalidade[]>([])
  const [empresas, setEmpresas] = useState<Pick<Empresa, 'id' | 'nome' | 'valor_mensalidade' | 'dia_vencimento'>[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [showNova, setShowNova] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [aviso, setAviso] = useState('')

  function carregar() {
    setLoading(true)
    const inicio = `${mes}-01`
    const [a, m] = mes.split('-').map(Number)
    const fim = inicioDoMes(dataLocalISO(new Date(a, m, 1)))
    Promise.all([
      supabase.from('mensalidades').select('*, empresa:empresas(nome)').gte('vencimento', inicio).lt('vencimento', fim).order('vencimento'),
      supabase.from('mensalidades').select('*, empresa:empresas(nome)').eq('status', 'pendente').lt('vencimento', inicio).order('vencimento'),
      supabase.from('empresas').select('id, nome, valor_mensalidade, dia_vencimento').order('nome'),
    ]).then(([{ data, error }, { data: antigas }, { data: emps }]) => {
      setErro(error?.message ?? '')
      setMensalidades((data ?? []) as Mensalidade[])
      setAtrasadasAntigas((antigas ?? []) as Mensalidade[])
      setEmpresas((emps ?? []) as typeof empresas)
      setLoading(false)
    })
  }

  useEffect(() => { carregar() }, [mes])

  async function gerar() {
    if (gerando) return
    setGerando(true); setAviso('')
    const { data, error } = await supabase.rpc('gerar_mensalidades', { p_competencia: `${mes}-01` })
    setGerando(false)
    if (error) { setAviso(error.message); return }
    const n = Number(data ?? 0)
    setAviso(n === 0 ? 'Todas as lojas com cobrança ativa já têm a mensalidade deste mês.' : `${n} ${n === 1 ? 'mensalidade gerada' : 'mensalidades geradas'}.`)
    carregar()
  }

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todas: mensalidades.length, atrasada: 0, pendente: 0, paga: 0, cancelada: 0 }
    mensalidades.forEach(m => { c[situacaoMensalidade(m)]++ })
    return c
  }, [mensalidades])

  const visiveis = mensalidades.filter(m => {
    if (filtro !== 'todas' && situacaoMensalidade(m) !== filtro) return false
    const termo = busca.trim().toLowerCase()
    return !termo || (m.empresa?.nome ?? '').toLowerCase().includes(termo) || (m.descricao ?? '').toLowerCase().includes(termo)
  })

  const soma = (lista: Mensalidade[], campo: 'valor' | 'pago' = 'valor') =>
    lista.reduce((s, m) => s + Number(campo === 'pago' ? (m.valor_pago ?? m.valor) : m.valor), 0)
  const recebido = soma(mensalidades.filter(m => m.status === 'paga'), 'pago')
  const aVencer = soma(mensalidades.filter(m => situacaoMensalidade(m) === 'pendente'))
  const atrasado = soma(mensalidades.filter(m => situacaoMensalidade(m) === 'atrasada'))
  const atrasadoAntigo = soma(atrasadasAntigas)

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Cobranças</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>Mensalidades das lojas · {rotuloCompetencia(`${mes}-01`)}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input className="input" type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} style={{ width: 'auto' }} aria-label="Mês" />
          <button className="btn btn-secondary" onClick={gerar} disabled={gerando} title="Lança a mensalidade do mês para cada loja ativa com cobrança, com o valor e o dia cadastrados" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RefreshCw size={14} /> {gerando ? 'Gerando...' : 'Gerar mensalidades do mês'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowNova(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova cobrança
          </button>
        </div>
      </div>

      {aviso && <p className="aviso-info" style={{ marginBottom: '16px' }}>{aviso}</p>}
      {erro && <p className="aviso-erro" style={{ marginBottom: '16px' }}>{erro}</p>}

      <div className="stat-grid-auto" style={{ marginBottom: '20px' }}>
        <StatCard rotulo="Recebido" icone={Wallet} valor={formatCurrency(recebido)} sub={`${contagem.paga} pagas`} />
        <StatCard rotulo="A vencer" icone={Clock} valor={formatCurrency(aVencer)} sub={`${contagem.pendente} cobranças`} />
        <StatCard rotulo="Em atraso no mês" icone={AlertTriangle} valor={<span style={{ color: atrasado > 0 ? '#ef4444' : undefined }}>{formatCurrency(atrasado)}</span>} sub={`${contagem.atrasada} cobranças`} />
        <StatCard rotulo="Atraso de meses anteriores" icone={AlertTriangle} valor={<span style={{ color: atrasadoAntigo > 0 ? '#ef4444' : undefined }}>{formatCurrency(atrasadoAntigo)}</span>} sub={`${atrasadasAntigas.length} cobranças`} />
      </div>

      <div className="barra-filtros">
        <div className="pilulas" role="tablist">
          {FILTROS.map(f => (
            <button key={f.id} role="tab" aria-selected={filtro === f.id} className={`pilula${filtro === f.id ? ' ativa' : ''}`} onClick={() => setFiltro(f.id)}>
              {f.label}<span className="pilula-contagem">{contagem[f.id]}</span>
            </button>
          ))}
        </div>
        <div className="filtro-busca">
          <Search size={13} />
          <input placeholder="Buscar loja..." value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && (
            <button onClick={() => setBusca('')} aria-label="Limpar busca" style={{ background: 'none', border: 'none', color: 'var(--c-55)', cursor: 'pointer', display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
      ) : (
        <MensalidadesLista mensalidades={visiveis} mostrarEmpresa onAlterado={carregar} vazio="Nenhuma cobrança neste mês. Use “Gerar mensalidades do mês”." />
      )}

      {!loading && atrasadasAntigas.length > 0 && (
        <>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', margin: '28px 0 12px' }}>Em atraso de meses anteriores</p>
          <MensalidadesLista mensalidades={atrasadasAntigas} mostrarEmpresa onAlterado={carregar} />
        </>
      )}

      <AnimatePresence>
        {showNova && (
          <NovaCobrancaModal
            empresas={empresas}
            onClose={() => setShowNova(false)}
            onSalvo={() => { setShowNova(false); carregar() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
