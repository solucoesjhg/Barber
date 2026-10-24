import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Building2, Copy, Check, ChevronRight, Search, X, Store, TrendingUp, AlertTriangle, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import { inicioDoMes } from '../lib/mensalidades'
import StatCard from '../components/ui/StatCard'
import ModalFormulario, { Campo, FormGrade, SecaoForm } from '../components/ui/ModalFormulario'
import type { PainelEmpresa } from '../types'

const FORM_INICIAL = {
  nome: '', cnpj: '', telefone: '', email: '', responsavel: '', cidade: '',
  plano: '', valor_mensalidade: '', dia_vencimento: '10',
  admin_nome: '', admin_email: '', admin_senha: '',
}

type Filtro = 'todas' | 'ativas' | 'bloqueadas' | 'atraso'
const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'ativas', label: 'Ativas' },
  { id: 'bloqueadas', label: 'Bloqueadas' },
  { id: 'atraso', label: 'Em atraso' },
]

const COLUNAS = 'minmax(200px, 1.6fr) 120px 70px minmax(120px, 1fr) 120px 130px 90px 20px'

export default function Empresas() {
  const navigate = useNavigate()
  const [empresas, setEmpresas] = useState<PainelEmpresa[]>([])
  const [recebidoMes, setRecebidoMes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(FORM_INICIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [codigoCopiado, setCodigoCopiado] = useState<string | null>(null)

  function copiarCodigo(codigo: string) {
    navigator.clipboard?.writeText(codigo).then(() => {
      setCodigoCopiado(codigo)
      setTimeout(() => setCodigoCopiado(null), 1500)
    })
  }

  function carregar() {
    setLoading(true)
    Promise.all([
      supabase.rpc('painel_empresas'),
      supabase.from('mensalidades').select('valor_pago, valor').eq('status', 'paga').gte('pago_em', inicioDoMes()),
    ]).then(([{ data, error: err }, { data: pagas }]) => {
      if (err) setErroCarga(err.message)
      setEmpresas((data ?? []) as PainelEmpresa[])
      setRecebidoMes((pagas ?? []).reduce((s, m) => s + Number(m.valor_pago ?? m.valor ?? 0), 0))
      setLoading(false)
    })
  }

  useEffect(() => { carregar() }, [])

  const contagem: Record<Filtro, number> = {
    todas: empresas.length,
    ativas: empresas.filter(e => e.ativo).length,
    bloqueadas: empresas.filter(e => !e.ativo).length,
    atraso: empresas.filter(e => e.mensalidades_atrasadas > 0).length,
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return empresas.filter(e => {
      if (filtro === 'ativas' && !e.ativo) return false
      if (filtro === 'bloqueadas' && e.ativo) return false
      if (filtro === 'atraso' && !(e.mensalidades_atrasadas > 0)) return false
      if (!termo) return true
      return [e.nome, e.codigo, e.email, e.cnpj, e.responsavel, e.cidade].some(v => v?.toLowerCase().includes(termo))
    })
  }, [empresas, filtro, busca])

  const mrr = empresas.filter(e => e.ativo && e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensalidade ?? 0), 0)
  const emAtraso = empresas.reduce((s, e) => s + Number(e.valor_atrasado ?? 0), 0)

  async function handleSave() {
    if (saving) return
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return }
    const comAdmin = form.admin_email.trim() !== ''
    if (comAdmin && !form.admin_nome.trim()) { setError('Informe o nome do administrador.'); return }
    if (comAdmin && form.admin_senha.length < 6) { setError('A senha do administrador precisa ter pelo menos 6 caracteres.'); return }
    const valor = Number(String(form.valor_mensalidade || '0').replace(',', '.'))
    const dia = Number(form.dia_vencimento)
    if (!(valor >= 0)) { setError('Valor da mensalidade inválido.'); return }
    if (!(dia >= 1 && dia <= 28)) { setError('Dia de vencimento deve ser de 1 a 28.'); return }
    setSaving(true); setError('')
    const { data: nova, error: err } = await supabase.from('empresas').insert({
      nome: form.nome.trim(), cnpj: form.cnpj || null, telefone: form.telefone || null, email: form.email || null,
      responsavel: form.responsavel || null, cidade: form.cidade || null,
      plano: form.plano || null, valor_mensalidade: valor, dia_vencimento: dia,
    }).select('id').single()
    if (err || !nova) { setSaving(false); setError(err?.message ?? 'Não foi possível criar a loja.'); return }
    if (comAdmin) {
      const { error: errAdmin } = await supabase.rpc('criar_usuario_loja', {
        p_email: form.admin_email.trim(), p_senha: form.admin_senha, p_nome: form.admin_nome.trim(),
        p_papel: 'administrador', p_empresa_id: nova.id,
      })
      if (errAdmin) {
        // A loja já foi criada: abre o detalhe dela para tentar o administrador de novo.
        setSaving(false)
        window.alert(`A loja foi criada, mas o administrador não: ${errAdmin.message}\nCadastre-o na tela da loja.`)
        navigate(`/empresas/${nova.id}`)
        return
      }
    }
    setSaving(false)
    setForm(FORM_INICIAL)
    setShowModal(false)
    carregar()
  }

  const set = (campo: keyof typeof FORM_INICIAL) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [campo]: e.target.value }))

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Empresas</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            Painel de controle das lojas cadastradas na plataforma
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={14} strokeWidth={2.5} /> Nova Loja
        </button>
      </div>

      <div className="stat-grid-auto" style={{ marginBottom: '20px' }}>
        <StatCard rotulo="Lojas ativas" icone={Store} valor={String(contagem.ativas)} sub={`${contagem.todas} cadastradas · ${contagem.bloqueadas} bloqueadas`} />
        <StatCard rotulo="Receita mensal" icone={TrendingUp} valor={formatCurrency(mrr)} sub="Soma das mensalidades das lojas ativas" />
        <StatCard rotulo="Recebido no mês" icone={Wallet} valor={formatCurrency(recebidoMes)} />
        <StatCard rotulo="Em atraso" icone={AlertTriangle} valor={<span style={{ color: emAtraso > 0 ? '#ef4444' : undefined }}>{formatCurrency(emAtraso)}</span>} sub={`${contagem.atraso} ${contagem.atraso === 1 ? 'loja' : 'lojas'}`} />
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
          <input placeholder="Buscar nome, código, CNPJ, cidade..." value={busca} onChange={e => setBusca(e.target.value)} />
          {busca && (
            <button onClick={() => setBusca('')} aria-label="Limpar busca" style={{ background: 'none', border: 'none', color: 'var(--c-55)', cursor: 'pointer', display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {erroCarga && <p className="aviso-erro" style={{ marginBottom: '12px' }}>{erroCarga}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="list-header" style={{
          display: 'grid', minWidth: '960px', gridTemplateColumns: COLUNAS, gap: '12px',
          padding: '10px 20px', borderBottom: '1px solid var(--c-22)',
          fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'var(--header-bg)',
        }}>
          <span>Loja</span><span>Código</span><span>Equipe</span><span>Vendas no mês</span><span>Último acesso</span><span>Mensalidade</span><span>Status</span><span />
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
        ) : visiveis.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
            {empresas.length === 0 ? 'Nenhuma loja cadastrada ainda.' : 'Nenhuma loja neste filtro.'}
          </div>
        ) : visiveis.map((e, i) => (
          <motion.div
            key={e.id}
            className="list-row"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
            onClick={() => navigate(`/empresas/${e.id}`)}
            style={{
              display: 'grid', minWidth: '960px', gridTemplateColumns: COLUNAS, gap: '12px',
              padding: '12px 20px', alignItems: 'center',
              borderBottom: i < visiveis.length - 1 ? '1px solid var(--c-1f)' : 'none',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--c-26)', border: '1px solid var(--c-33)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Building2 size={14} style={{ color: 'var(--c-a3)' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{e.nome}</p>
                <p className="subtexto texto-cortado">
                  {[e.cidade, e.plano, `desde ${formatDate(e.created_at)}`].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <button
              onClick={ev => { ev.stopPropagation(); e.codigo && copiarCodigo(e.codigo) }}
              title="Copiar código"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                fontSize: '11px', fontFamily: 'monospace', color: 'var(--c-a3)',
                background: 'rgba(var(--ink),0.04)', border: '1px solid var(--c-2a)', borderRadius: '6px',
                padding: '4px 8px', cursor: 'pointer',
              }}
            >
              {codigoCopiado === e.codigo ? <Check size={11} /> : <Copy size={11} />}
              {e.codigo ?? '—'}
            </button>
            <span style={{ fontSize: '13px', color: 'var(--c-a3)' }}>{e.usuarios_ativos}</span>
            <div style={{ minWidth: 0 }}>
              <p className="valor-num" style={{ fontSize: '13px', color: 'var(--c-fff)' }}>{formatCurrency(Number(e.faturamento_mes))}</p>
              <p className="subtexto">{e.vendas_mes} {e.vendas_mes === 1 ? 'venda' : 'vendas'}</p>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--c-a3)' }} title={e.ultimo_acesso ? formatDateTime(e.ultimo_acesso) : undefined}>
              {e.ultimo_acesso ? formatDate(e.ultimo_acesso.slice(0, 10)) : 'Nunca'}
            </span>
            <div style={{ minWidth: 0 }}>
              {!e.cobranca_ativa ? (
                <span className="subtexto">Sem cobrança</span>
              ) : e.mensalidades_atrasadas > 0 ? (
                <>
                  <span className="badge badge-atrasada">{e.mensalidades_atrasadas} em atraso</span>
                  <p className="subtexto" style={{ color: '#ef4444' }}>{formatCurrency(Number(e.valor_atrasado))}</p>
                </>
              ) : (
                <>
                  <p className="valor-num" style={{ fontSize: '13px', color: 'var(--c-fff)' }}>{formatCurrency(Number(e.valor_mensalidade ?? 0))}</p>
                  <p className="subtexto">{e.proximo_vencimento ? `vence ${formatDate(e.proximo_vencimento)}` : `todo dia ${e.dia_vencimento}`}</p>
                </>
              )}
            </div>
            <span>
              <span className={e.ativo ? 'badge badge-done' : 'badge badge-canceled'} title={!e.ativo && e.motivo_bloqueio ? e.motivo_bloqueio : undefined}>
                {e.ativo ? 'Ativa' : 'Bloqueada'}
              </span>
            </span>
            <ChevronRight size={14} style={{ color: 'var(--c-33)' }} />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <ModalFormulario
            icone={<Building2 size={18} />}
            titulo="Nova Loja"
            descricao="A loja já nasce com configurações, categorias financeiras e formas de pagamento padrão."
            onClose={() => setShowModal(false)}
            onSalvar={handleSave}
            salvando={saving}
            rotuloSalvar="Cadastrar"
            erro={error}
          >
            <FormGrade>
              <SecaoForm titulo="Loja" />
              <Campo rotulo="Nome da loja *" span={2}>
                <input className="input" placeholder="Ex: Barbearia do João" value={form.nome} onChange={set('nome')} />
              </Campo>
              <Campo rotulo="CNPJ">
                <input className="input" placeholder="opcional" value={form.cnpj} onChange={set('cnpj')} />
              </Campo>
              <Campo rotulo="Responsável">
                <input className="input" placeholder="opcional" value={form.responsavel} onChange={set('responsavel')} />
              </Campo>
              <Campo rotulo="Telefone">
                <input className="input" placeholder="opcional" value={form.telefone} onChange={set('telefone')} />
              </Campo>
              <Campo rotulo="Cidade">
                <input className="input" placeholder="opcional" value={form.cidade} onChange={set('cidade')} />
              </Campo>
              <Campo rotulo="E-mail de contato" span={2}>
                <input className="input" type="email" placeholder="opcional" value={form.email} onChange={set('email')} />
              </Campo>
              <SecaoForm titulo="Cobrança" ajuda="Quanto a loja paga pelo sistema. Dá para mudar depois na tela da loja." />
              <Campo rotulo="Plano">
                <input className="input" placeholder="Ex: Básico" value={form.plano} onChange={set('plano')} />
              </Campo>
              <Campo rotulo="Mensalidade (R$)">
                <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.valor_mensalidade} onChange={set('valor_mensalidade')} />
              </Campo>
              <Campo rotulo="Dia de vencimento">
                <input className="input" type="number" min={1} max={28} value={form.dia_vencimento} onChange={set('dia_vencimento')} />
              </Campo>
              <SecaoForm titulo="Administrador da loja" ajuda="Opcional. Ele entra com este e-mail e senha e cadastra o resto da equipe pelo sistema." />
              <Campo rotulo="Nome">
                <input className="input" placeholder="Ex: João Silva" value={form.admin_nome} onChange={set('admin_nome')} />
              </Campo>
              <Campo rotulo="E-mail de acesso">
                <input className="input" type="email" autoComplete="off" placeholder="dono@loja.com" value={form.admin_email} onChange={set('admin_email')} />
              </Campo>
              <Campo rotulo="Senha inicial">
                <input className="input" type="password" autoComplete="new-password" placeholder="Mín. 6 caracteres" value={form.admin_senha} onChange={set('admin_senha')} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
