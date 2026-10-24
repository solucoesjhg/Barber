import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowLeft, Building2, Copy, Check, UserCheck, Plus, Lock, Unlock, Trash2, Save, Receipt, LayoutDashboard, Users, AlertTriangle, LogIn } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../lib/utils'
import { nomeExibicao, papeisQuePossoAtribuir } from '../lib/permissoes'
import { situacaoMensalidade } from '../lib/mensalidades'
import UsuarioCard from '../components/usuarios/UsuarioCard'
import NovoUsuarioModal from '../components/usuarios/NovoUsuarioModal'
import StatCard from '../components/ui/StatCard'
import ModalFormulario, { Campo, FormGrade, SecaoForm } from '../components/ui/ModalFormulario'
import MensalidadesLista from '../components/admin/MensalidadesLista'
import NovaCobrancaModal from '../components/admin/NovaCobrancaModal'
import type { Mensalidade, PainelEmpresa, UsuarioListado } from '../types'

const PAPEIS_SUPER = papeisQuePossoAtribuir('super_admin')

type Aba = 'geral' | 'usuarios' | 'cobranca'

const DADOS_VAZIOS = { nome: '', cnpj: '', telefone: '', email: '', responsavel: '', endereco: '', cidade: '', observacoes: '' }
const COBRANCA_VAZIA = { plano: '', valor_mensalidade: '', dia_vencimento: '10', cobranca_ativa: true }

export default function EmpresaDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [empresa, setEmpresa] = useState<PainelEmpresa | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aba, setAba] = useState<Aba>('geral')
  const [codigoCopiado, setCodigoCopiado] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [showNovo, setShowNovo] = useState(false)
  const [showCobranca, setShowCobranca] = useState(false)

  const [dados, setDados] = useState(DADOS_VAZIOS)
  const [salvandoDados, setSalvandoDados] = useState(false)
  const [msgDados, setMsgDados] = useState('')
  const [cobranca, setCobranca] = useState(COBRANCA_VAZIA)
  const [salvandoCobranca, setSalvandoCobranca] = useState(false)
  const [msgCobranca, setMsgCobranca] = useState('')

  const [bloqueando, setBloqueando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')
  const [acaoSalvando, setAcaoSalvando] = useState(false)
  const [acaoErro, setAcaoErro] = useState('')

  function carregar() {
    if (!id) return
    Promise.all([
      supabase.rpc('painel_empresas'),
      supabase.rpc('listar_usuarios'),
      supabase.from('mensalidades').select('*').eq('empresa_id', id).order('vencimento', { ascending: false }),
    ]).then(([{ data: painel, error: errPainel }, { data: users, error: errUsers }, { data: mens }]) => {
      const emp = ((painel ?? []) as PainelEmpresa[]).find(e => e.id === id) ?? null
      setEmpresa(emp)
      if (emp) {
        setDados({
          nome: emp.nome ?? '', cnpj: emp.cnpj ?? '', telefone: emp.telefone ?? '', email: emp.email ?? '',
          responsavel: emp.responsavel ?? '', endereco: emp.endereco ?? '', cidade: emp.cidade ?? '', observacoes: emp.observacoes ?? '',
        })
        setCobranca({
          plano: emp.plano ?? '', valor_mensalidade: String(Number(emp.valor_mensalidade ?? 0)),
          dia_vencimento: String(emp.dia_vencimento ?? 10), cobranca_ativa: emp.cobranca_ativa ?? true,
        })
      }
      setError(errPainel?.message ?? errUsers?.message ?? '')
      setUsuarios((users ?? []) as UsuarioListado[])
      setMensalidades((mens ?? []) as Mensalidade[])
      setLoading(false)
    })
  }

  useEffect(() => { setLoading(true); carregar() }, [id])

  const [entrando, setEntrando] = useState(false)
  // Modo suporte: entra na loja como administrador dela (sem senha).
  async function entrarNaLoja() {
    if (!empresa || entrando) return
    if (!window.confirm(`Entrar em ${empresa.nome} como administrador (modo suporte)? Você vê e mexe em tudo da loja até clicar em "Sair do suporte".`)) return
    setEntrando(true)
    const { error: err } = await supabase.rpc('entrar_suporte', { p_empresa_id: empresa.id })
    if (err) { setEntrando(false); window.alert(err.message); return }
    window.location.href = '/dashboard'
  }

  function copiarCodigo() {
    if (!empresa?.codigo) return
    navigator.clipboard?.writeText(empresa.codigo).then(() => {
      setCodigoCopiado(true)
      setTimeout(() => setCodigoCopiado(false), 1500)
    })
  }

  async function salvarDados() {
    if (!id || salvandoDados) return
    if (!dados.nome.trim()) { setMsgDados('O nome é obrigatório.'); return }
    setSalvandoDados(true); setMsgDados('')
    const vazioNulo = (v: string) => v.trim() || null
    const { error: err } = await supabase.from('empresas').update({
      nome: dados.nome.trim(), cnpj: vazioNulo(dados.cnpj), telefone: vazioNulo(dados.telefone), email: vazioNulo(dados.email),
      responsavel: vazioNulo(dados.responsavel), endereco: vazioNulo(dados.endereco), cidade: vazioNulo(dados.cidade),
      observacoes: vazioNulo(dados.observacoes),
    }).eq('id', id)
    setSalvandoDados(false)
    setMsgDados(err ? err.message : 'Dados salvos.')
    if (!err) carregar()
  }

  async function salvarCobranca() {
    if (!id || salvandoCobranca) return
    const valor = Number(String(cobranca.valor_mensalidade || '0').replace(',', '.'))
    const dia = Number(cobranca.dia_vencimento)
    if (!(valor >= 0)) { setMsgCobranca('Valor inválido.'); return }
    if (!(dia >= 1 && dia <= 28)) { setMsgCobranca('O dia de vencimento deve ser de 1 a 28.'); return }
    setSalvandoCobranca(true); setMsgCobranca('')
    const { error: err } = await supabase.from('empresas').update({
      plano: cobranca.plano.trim() || null, valor_mensalidade: valor, dia_vencimento: dia, cobranca_ativa: cobranca.cobranca_ativa,
    }).eq('id', id)
    setSalvandoCobranca(false)
    setMsgCobranca(err ? err.message : 'Cobrança salva.')
    if (!err) carregar()
  }

  async function alterarAcesso(ativo: boolean) {
    if (!id || acaoSalvando) return
    setAcaoSalvando(true); setAcaoErro('')
    const { error: err } = await supabase.rpc('definir_acesso_empresa', { p_empresa_id: id, p_ativo: ativo, p_motivo: ativo ? null : (motivo.trim() || null) })
    setAcaoSalvando(false)
    if (err) { setAcaoErro(err.message); return }
    setBloqueando(false)
    carregar()
  }

  async function excluirEmpresa() {
    if (!id || !empresa || acaoSalvando) return
    if (confirmacao.trim().toLowerCase() !== empresa.nome.trim().toLowerCase()) { setAcaoErro('Digite o nome da loja exatamente como aparece.'); return }
    setAcaoSalvando(true); setAcaoErro('')
    const { error: err } = await supabase.rpc('excluir_empresa', { p_empresa_id: id, p_confirmacao: confirmacao.trim() })
    setAcaoSalvando(false)
    if (err) { setAcaoErro(err.message); return }
    navigate('/empresas', { replace: true })
  }

  const vinculados = usuarios
    .filter(u => u.empresa_id === id)
    .sort((a, b) => Number(b.papel === 'administrador') - Number(a.papel === 'administrador') || nomeExibicao(a).localeCompare(nomeExibicao(b)))
  const temAdmin = vinculados.some(u => u.papel === 'administrador' && u.ativo)

  if (loading) {
    return <div className="page"><p style={{ color: 'var(--c-66)', fontSize: '13px' }}>Carregando...</p></div>
  }
  if (!empresa) {
    return <div className="page"><p style={{ color: 'var(--c-66)', fontSize: '13px' }}>Loja não encontrada.</p></div>
  }

  const recebido = mensalidades.filter(m => m.status === 'paga').reduce((s, m) => s + Number(m.valor_pago ?? m.valor), 0)
  const aReceber = mensalidades.filter(m => situacaoMensalidade(m) === 'pendente').reduce((s, m) => s + Number(m.valor), 0)
  const atrasado = mensalidades.filter(m => situacaoMensalidade(m) === 'atrasada').reduce((s, m) => s + Number(m.valor), 0)

  const ABAS: { id: Aba; label: string; icone: typeof Users; contagem?: number }[] = [
    { id: 'geral', label: 'Visão geral', icone: LayoutDashboard },
    { id: 'usuarios', label: 'Usuários', icone: Users, contagem: vinculados.length },
    { id: 'cobranca', label: 'Cobrança', icone: Receipt, contagem: empresa.mensalidades_atrasadas || undefined },
  ]

  const setD = (campo: keyof typeof DADOS_VAZIOS) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDados(d => ({ ...d, [campo]: e.target.value }))

  return (
    <div className="page">
      <button
        onClick={() => navigate('/empresas')}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--c-a3)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px', padding: 0 }}
      >
        <ArrowLeft size={13} /> Empresas
      </button>

      <div className="empresa-cabecalho" style={{ marginBottom: '20px' }}>
        <div className="usuario-avatar" style={{ borderRadius: '10px', width: '44px', height: '44px' }}>
          <Building2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '22px', color: 'var(--c-fff)', overflowWrap: 'anywhere' }}>{empresa.nome}</h1>
            <span className={empresa.ativo ? 'badge badge-done' : 'badge badge-canceled'}>{empresa.ativo ? 'Ativa' : 'Bloqueada'}</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--c-a3)', marginTop: '2px' }}>
            Desde {formatDate(empresa.created_at)} · {empresa.email ?? 'sem e-mail de contato'}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={entrarNaLoja} disabled={entrando} title="Ver e operar o sistema como o administrador desta loja" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <LogIn size={13} /> {entrando ? 'Entrando...' : 'Entrar como a loja'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={copiarCodigo} title="Copiar código da loja" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace' }}>
          {codigoCopiado ? <Check size={13} /> : <Copy size={13} />}
          {empresa.codigo ?? '—'}
        </button>
      </div>

      {!empresa.ativo && (
        <p className="aviso-erro" style={{ marginBottom: '16px' }}>
          Loja bloqueada{empresa.bloqueada_em ? ` em ${formatDateTime(empresa.bloqueada_em)}` : ''}. A equipe vê "Acesso suspenso" e não consegue usar o sistema.
          {empresa.motivo_bloqueio ? ` Motivo: ${empresa.motivo_bloqueio}` : ''}
        </p>
      )}
      {error && <p className="aviso-erro" style={{ marginBottom: '16px' }}>{error}</p>}

      <div className="perm-abas" role="tablist" style={{ marginBottom: '20px' }}>
        {ABAS.map(a => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} className={`perm-aba${aba === a.id ? ' ativa' : ''}`} onClick={() => setAba(a.id)}>
            <a.icone size={13} />
            <span>{a.label}</span>
            {a.contagem !== undefined && <span className="perm-aba-contagem">{a.contagem}</span>}
          </button>
        ))}
      </div>

      {aba === 'geral' && (
        <>
          <div className="stat-grid-auto" style={{ marginBottom: '20px' }}>
            <StatCard rotulo="Usuários ativos" valor={String(empresa.usuarios_ativos)} sub={`${vinculados.length} cadastrados`} />
            <StatCard rotulo="Vendas no mês" valor={formatCurrency(Number(empresa.faturamento_mes))} sub={`${empresa.vendas_mes} ${empresa.vendas_mes === 1 ? 'venda' : 'vendas'}`} />
            <StatCard rotulo="Último acesso" valor={empresa.ultimo_acesso ? formatDate(empresa.ultimo_acesso.slice(0, 10)) : 'Nunca'} sub={empresa.ultimo_acesso ? formatDateTime(empresa.ultimo_acesso) : undefined} />
            <StatCard rotulo="Em atraso" valor={<span style={{ color: Number(empresa.valor_atrasado) > 0 ? '#ef4444' : undefined }}>{formatCurrency(Number(empresa.valor_atrasado))}</span>} sub={`${empresa.mensalidades_atrasadas} ${empresa.mensalidades_atrasadas === 1 ? 'cobrança' : 'cobranças'}`} />
          </div>

          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <FormGrade colunas={2}>
              <SecaoForm titulo="Dados da loja" />
              <Campo rotulo="Nome da loja *" span="total">
                <input className="input" value={dados.nome} onChange={setD('nome')} />
              </Campo>
              <Campo rotulo="CNPJ">
                <input className="input" value={dados.cnpj} onChange={setD('cnpj')} />
              </Campo>
              <Campo rotulo="Responsável">
                <input className="input" value={dados.responsavel} onChange={setD('responsavel')} />
              </Campo>
              <Campo rotulo="Telefone">
                <input className="input" value={dados.telefone} onChange={setD('telefone')} />
              </Campo>
              <Campo rotulo="E-mail de contato">
                <input className="input" type="email" value={dados.email} onChange={setD('email')} />
              </Campo>
              <Campo rotulo="Endereço">
                <input className="input" value={dados.endereco} onChange={setD('endereco')} />
              </Campo>
              <Campo rotulo="Cidade">
                <input className="input" value={dados.cidade} onChange={setD('cidade')} />
              </Campo>
              <Campo rotulo="Observações internas" span="total">
                <textarea className="input" rows={3} placeholder="Só o super admin vê" value={dados.observacoes} onChange={setD('observacoes')} style={{ resize: 'vertical' }} />
              </Campo>
            </FormGrade>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              {msgDados && <span style={{ fontSize: '12px', color: msgDados === 'Dados salvos.' ? 'var(--c-a3)' : '#ef4444' }}>{msgDados}</span>}
              <button className="btn btn-primary btn-sm" onClick={salvarDados} disabled={salvandoDados} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Save size={13} /> {salvandoDados ? 'Salvando...' : 'Salvar dados'}
              </button>
            </div>
          </div>

          <div className="card" style={{ padding: '20px', borderColor: 'rgba(239,68,68,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <AlertTriangle size={14} style={{ color: '#ef4444' }} />
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>Zona de risco</p>
            </div>
            <div className="secao-cabecalho" style={{ padding: '12px 0', borderTop: '1px solid var(--c-1f)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '13px', color: 'var(--c-fff)' }}>{empresa.ativo ? 'Bloquear acesso' : 'Desbloquear acesso'}</p>
                <p className="subtexto">{empresa.ativo ? 'A equipe para de acessar o sistema até você desbloquear. Nenhum dado é apagado.' : 'A equipe volta a acessar normalmente.'}</p>
              </div>
              {empresa.ativo ? (
                <button className="btn btn-secondary btn-sm" onClick={() => { setMotivo(''); setAcaoErro(''); setBloqueando(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={13} /> Bloquear
                </button>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => alterarAcesso(true)} disabled={acaoSalvando} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Unlock size={13} /> Desbloquear
                </button>
              )}
            </div>
            <div className="secao-cabecalho" style={{ padding: '12px 0 0', borderTop: '1px solid var(--c-1f)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '13px', color: 'var(--c-fff)' }}>Excluir loja</p>
                <p className="subtexto">Apaga a loja, os usuários dela e todos os dados (vendas, agenda, financeiro, cobranças). Não tem volta.</p>
              </div>
              <button className="btn btn-sm" onClick={() => { setConfirmacao(''); setAcaoErro(''); setExcluindo(true) }} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ef4444', color: '#fff', border: '1px solid #ef4444' }}>
                <Trash2 size={13} /> Excluir loja
              </button>
            </div>
            {acaoErro && !bloqueando && !excluindo && <p className="aviso-erro" style={{ marginTop: '12px' }}>{acaoErro}</p>}
          </div>
        </>
      )}

      {aba === 'usuarios' && (
        <>
          <div className="secao-cabecalho" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={14} style={{ color: 'var(--c-a3)' }} />
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>Usuários desta loja</p>
              <span style={{ fontSize: '11px', color: 'var(--c-a3)' }}>({vinculados.length})</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNovo(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={13} strokeWidth={2.5} /> {temAdmin ? 'Novo Usuário' : 'Cadastrar Administrador'}
            </button>
          </div>

          {!temAdmin && (
            <p className="aviso-info" style={{ marginBottom: '12px' }}>
              Esta loja ainda não tem administrador. Cadastre um: ele entra com o e-mail e a senha que você definir e cadastra o resto da equipe pelo sistema.
            </p>
          )}

          {vinculados.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--c-66)', fontSize: '13px' }}>Nenhum usuário nesta loja ainda.</div>
          ) : (
            <div className="usuarios-lista">
              {vinculados.map(u => (
                <UsuarioCard
                  key={u.usuario_id}
                  usuario={u}
                  aberto={abertoId === u.usuario_id}
                  onToggle={() => setAbertoId(a => a === u.usuario_id ? null : u.usuario_id)}
                  papeis={PAPEIS_SUPER}
                  profissionais={[]}
                  podeEditar={u.papel !== 'super_admin'}
                  comPermissoes={false}
                  onSaved={carregar}
                />
              ))}
            </div>
          )}
        </>
      )}

      {aba === 'cobranca' && (
        <>
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <FormGrade colunas={4}>
              <SecaoForm titulo="Plano e mensalidade" ajuda="Usado pelo botão “Gerar mensalidades do mês” na tela Cobranças." />
              <Campo rotulo="Plano">
                <input className="input" placeholder="Ex: Básico" value={cobranca.plano} onChange={e => setCobranca(c => ({ ...c, plano: e.target.value }))} />
              </Campo>
              <Campo rotulo="Mensalidade (R$)">
                <input className="input" type="number" min={0} step={0.01} value={cobranca.valor_mensalidade} onChange={e => setCobranca(c => ({ ...c, valor_mensalidade: e.target.value }))} />
              </Campo>
              <Campo rotulo="Dia de vencimento">
                <input className="input" type="number" min={1} max={28} value={cobranca.dia_vencimento} onChange={e => setCobranca(c => ({ ...c, dia_vencimento: e.target.value }))} />
              </Campo>
              <Campo rotulo="Cobrança">
                <select className="input" value={cobranca.cobranca_ativa ? 'sim' : 'nao'} onChange={e => setCobranca(c => ({ ...c, cobranca_ativa: e.target.value === 'sim' }))}>
                  <option value="sim">Ativa</option>
                  <option value="nao">Isenta / pausada</option>
                </select>
              </Campo>
            </FormGrade>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              {msgCobranca && <span style={{ fontSize: '12px', color: msgCobranca === 'Cobrança salva.' ? 'var(--c-a3)' : '#ef4444' }}>{msgCobranca}</span>}
              <button className="btn btn-primary btn-sm" onClick={salvarCobranca} disabled={salvandoCobranca} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Save size={13} /> {salvandoCobranca ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          <div className="stat-grid-auto" style={{ marginBottom: '16px' }}>
            <StatCard rotulo="Recebido (total)" valor={formatCurrency(recebido)} />
            <StatCard rotulo="A vencer" valor={formatCurrency(aReceber)} />
            <StatCard rotulo="Em atraso" valor={<span style={{ color: atrasado > 0 ? '#ef4444' : undefined }}>{formatCurrency(atrasado)}</span>} />
          </div>

          <div className="secao-cabecalho" style={{ marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>Histórico de cobranças</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCobranca(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={13} strokeWidth={2.5} /> Nova cobrança
            </button>
          </div>
          <MensalidadesLista mensalidades={mensalidades} onAlterado={carregar} vazio="Nenhuma cobrança lançada para esta loja." />
        </>
      )}

      <AnimatePresence>
        {showNovo && (
          <NovoUsuarioModal
            papeis={temAdmin ? PAPEIS_SUPER : ['administrador']}
            profissionais={[]}
            empresaId={id}
            onClose={() => setShowNovo(false)}
            onCreated={novoId => { setShowNovo(false); setAbertoId(novoId); carregar() }}
          />
        )}
        {showCobranca && (
          <NovaCobrancaModal
            empresaId={id}
            valorPadrao={Number(empresa.valor_mensalidade ?? 0) || undefined}
            diaVencimento={empresa.dia_vencimento}
            onClose={() => setShowCobranca(false)}
            onSalvo={() => { setShowCobranca(false); carregar() }}
          />
        )}
        {bloqueando && (
          <ModalFormulario
            tamanho="pequeno"
            icone={<Lock size={18} />}
            titulo="Bloquear loja"
            descricao={`A equipe de ${empresa.nome} vai ver "Acesso suspenso" ao entrar. Os dados ficam guardados.`}
            onClose={() => setBloqueando(false)}
            onSalvar={() => alterarAcesso(false)}
            salvando={acaoSalvando}
            rotuloSalvar="Bloquear"
            erro={acaoErro}
          >
            <Campo rotulo="Motivo (aparece para a loja)">
              <input className="input" placeholder="Ex: Mensalidade em atraso" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
            </Campo>
          </ModalFormulario>
        )}
        {excluindo && (
          <ModalFormulario
            tamanho="pequeno"
            icone={<Trash2 size={18} />}
            titulo="Excluir loja"
            descricao="Isso apaga a loja, todos os usuários dela e todos os dados. Não dá para desfazer."
            onClose={() => setExcluindo(false)}
            onSalvar={excluirEmpresa}
            salvando={acaoSalvando}
            rotuloSalvar="Excluir definitivamente"
            erro={acaoErro}
          >
            <Campo rotulo={`Digite "${empresa.nome}" para confirmar`}>
              <input className="input" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} autoFocus autoComplete="off" />
            </Campo>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}
