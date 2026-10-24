import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Tags, Wallet, Pencil, Trash2, Power } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { usePermissoes } from '../hooks/usePermissoes'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../components/ui/ModalDetalhe'
import ModalFormulario, { Campo, FormGrade } from '../components/ui/ModalFormulario'
import type { CategoriaFinanceira, CategoriaFinanceiraTipo, FormaPagamentoCadastro } from '../types'

type Secao = 'categorias' | 'formas'

const CAT_FORM_INICIAL = { nome: '', tipo: 'despesa' as CategoriaFinanceiraTipo, categoria_pai_id: '' }
const FORMA_FORM_INICIAL = { nome: '' }

/** Botões do rodapé dos cards de categoria e forma de pagamento. */
function AcoesCadastro({ ativo, onExcluir, onAlternarAtivo, onEditar }: {
  ativo: boolean
  onExcluir: () => void
  onAlternarAtivo: () => void
  onEditar: () => void
}) {
  return (
    <>
      <button className="btn btn-secondary" onClick={onExcluir}><Trash2 size={13} /> Excluir</button>
      <button className="btn btn-secondary" onClick={onAlternarAtivo}><Power size={13} /> {ativo ? 'Desativar' : 'Ativar'}</button>
      <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar</button>
    </>
  )
}

/** Card da categoria: tipo, onde ela fica no plano de contas e as subcategorias. */
function CategoriaDetalhe({ categoria: c, categorias, podeEditar, onClose, onEditar, onAlternarAtivo, onExcluir }: {
  categoria: CategoriaFinanceira
  categorias: CategoriaFinanceira[]
  podeEditar: boolean
  onClose: () => void
  onEditar: () => void
  onAlternarAtivo: () => void
  onExcluir: () => void
}) {
  const pai = c.categoria_pai_id ? categorias.find(x => x.id === c.categoria_pai_id) : undefined
  const filhas = categorias.filter(x => x.categoria_pai_id === c.id)
  const tipo = c.tipo === 'receita' ? 'Receita' : 'Despesa'

  return (
    <ModalDetalhe
      largura={540}
      icone={<Tags size={18} />}
      titulo={c.nome}
      subtitulo={<>
        <span>{pai ? `${tipo} · dentro de ${pai.nome}` : tipo}</span>
        <span className={`status-pill${c.ativo ? '' : ' inativo'}`}>{c.ativo ? 'Ativa' : 'Inativa'}</span>
      </>}
      onClose={onClose}
      acoes={podeEditar ? <AcoesCadastro ativo={c.ativo} onExcluir={onExcluir} onAlternarAtivo={onAlternarAtivo} onEditar={onEditar} /> : undefined}
    >
      <InfoGrade>
        <Info rotulo="Tipo">{tipo}</Info>
        <Info rotulo="Nível">{filhas.length > 0 ? 'Sintética (agrupa outras)' : 'Analítica (recebe lançamentos)'}</Info>
        <Info rotulo="Agrupada em">{pai?.nome}</Info>
        <Info rotulo="Cadastrada em">{formatDate(c.created_at)}</Info>
      </InfoGrade>

      {!pai && (
        <SecaoDetalhe titulo={`Subcategorias (${filhas.length})`}>
          {filhas.length === 0 ? (
            <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Nenhuma. Os lançamentos vão direto nesta categoria.</p>
          ) : (
            <div className="chip-lista">
              {filhas.map(f => (
                <span key={f.id} className={`chip${f.ativo ? '' : ' fraco'}`} title={f.ativo ? undefined : 'Inativa'}>{f.nome}</span>
              ))}
            </div>
          )}
        </SecaoDetalhe>
      )}
    </ModalDetalhe>
  )
}

/** Card da forma de pagamento. */
function FormaDetalhe({ forma: f, podeEditar, onClose, onEditar, onAlternarAtivo, onExcluir }: {
  forma: FormaPagamentoCadastro
  podeEditar: boolean
  onClose: () => void
  onEditar: () => void
  onAlternarAtivo: () => void
  onExcluir: () => void
}) {
  return (
    <ModalDetalhe
      largura={540}
      icone={<Wallet size={18} />}
      titulo={f.nome}
      subtitulo={<span className={`status-pill${f.ativo ? '' : ' inativo'}`}>{f.ativo ? 'Ativa' : 'Inativa'}</span>}
      onClose={onClose}
      acoes={podeEditar ? <AcoesCadastro ativo={f.ativo} onExcluir={onExcluir} onAlternarAtivo={onAlternarAtivo} onEditar={onEditar} /> : undefined}
    >
      <InfoGrade>
        <Info rotulo="Situação">{f.ativo ? 'Aparece para escolher na baixa das contas' : 'Não aparece para escolher'}</Info>
        <Info rotulo="Cadastrada em">{formatDate(f.created_at)}</Info>
      </InfoGrade>
    </ModalDetalhe>
  )
}

export default function Categorias() {
  const { podeEditar: podeEditarTela } = usePermissoes()
  const podeEditar = podeEditarTela('categorias')
  const [secao, setSecao] = useState<Secao>('categorias')

  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([])
  const [showCatModal, setShowCatModal] = useState(false)
  const [catEditando, setCatEditando] = useState<CategoriaFinanceira | null>(null)
  const [catForm, setCatForm] = useState(CAT_FORM_INICIAL)
  const [catAbertaId, setCatAbertaId] = useState<string | null>(null)

  const [formas, setFormas] = useState<FormaPagamentoCadastro[]>([])
  const [showFormaModal, setShowFormaModal] = useState(false)
  const [formaEditando, setFormaEditando] = useState<FormaPagamentoCadastro | null>(null)
  const [formaForm, setFormaForm] = useState(FORMA_FORM_INICIAL)
  const [formaAbertaId, setFormaAbertaId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function carregar() {
    setLoading(true)
    supabase.from('categorias_financeiras').select('*').order('tipo').order('nome')
      .then(({ data }) => { setCategorias((data ?? []) as CategoriaFinanceira[]); setLoading(false) })
    supabase.from('formas_pagamento').select('*').order('nome')
      .then(({ data }) => { setFormas((data ?? []) as FormaPagamentoCadastro[]) })
  }

  useEffect(() => { carregar() }, [])

  const catAberta = catAbertaId ? categorias.find(c => c.id === catAbertaId) ?? null : null
  const formaAberta = formaAbertaId ? formas.find(f => f.id === formaAbertaId) ?? null : null

  function abrirNovaCategoria() {
    setCatEditando(null); setCatForm(CAT_FORM_INICIAL); setError(''); setShowCatModal(true)
  }
  function abrirEditarCategoria(c: CategoriaFinanceira) {
    setCatEditando(c); setCatForm({ nome: c.nome, tipo: c.tipo, categoria_pai_id: c.categoria_pai_id ?? '' }); setError(''); setShowCatModal(true)
  }
  function fecharCategoria() { setShowCatModal(false); setError('') }

  async function salvarCategoria() {
    if (!catForm.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')
    const payload = { nome: catForm.nome, tipo: catForm.tipo, categoria_pai_id: catForm.categoria_pai_id || null }
    const { error: err } = catEditando
      ? await supabase.from('categorias_financeiras').update(payload).eq('id', catEditando.id)
      : await supabase.from('categorias_financeiras').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowCatModal(false)
    carregar()
  }

  async function toggleAtivoCategoria(c: CategoriaFinanceira) {
    setCategorias(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x))
    await supabase.from('categorias_financeiras').update({ ativo: !c.ativo }).eq('id', c.id)
  }

  async function excluirCategoria(c: CategoriaFinanceira) {
    if (!window.confirm(`Excluir a categoria "${c.nome}"? Contas que já usam essa categoria continuam existindo, só perdem o vínculo.`)) return
    setCatAbertaId(null)
    const { error: err } = await supabase.from('categorias_financeiras').delete().eq('id', c.id)
    if (err) { setError(err.message); return }
    carregar()
  }

  function abrirNovaForma() {
    setFormaEditando(null); setFormaForm(FORMA_FORM_INICIAL); setError(''); setShowFormaModal(true)
  }
  function abrirEditarForma(f: FormaPagamentoCadastro) {
    setFormaEditando(f); setFormaForm({ nome: f.nome }); setError(''); setShowFormaModal(true)
  }
  function fecharForma() { setShowFormaModal(false); setError('') }

  async function salvarForma() {
    if (!formaForm.nome.trim()) { setError('Nome é obrigatório.'); return }
    setSaving(true); setError('')
    const { error: err } = formaEditando
      ? await supabase.from('formas_pagamento').update({ nome: formaForm.nome }).eq('id', formaEditando.id)
      : await supabase.from('formas_pagamento').insert({ nome: formaForm.nome })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowFormaModal(false)
    carregar()
  }

  async function toggleAtivoForma(f: FormaPagamentoCadastro) {
    setFormas(prev => prev.map(x => x.id === f.id ? { ...x, ativo: !x.ativo } : x))
    await supabase.from('formas_pagamento').update({ ativo: !f.ativo }).eq('id', f.id)
  }

  async function excluirForma(f: FormaPagamentoCadastro) {
    if (!window.confirm(`Excluir a forma de pagamento "${f.nome}"? Contas que já usam ela continuam existindo, só perdem o vínculo.`)) return
    setFormaAbertaId(null)
    const { error: err } = await supabase.from('formas_pagamento').delete().eq('id', f.id)
    if (err) { setError(err.message); return }
    carregar()
  }

  const receitas = categorias.filter(c => c.tipo === 'receita')
  const despesas = categorias.filter(c => c.tipo === 'despesa')

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Categorias & Pagamentos</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {secao === 'categorias' ? 'Categorias financeiras da sua loja' : 'Formas de pagamento aceitas'}
          </p>
        </div>
        {!podeEditar ? null : secao === 'categorias' ? (
          <button className="btn btn-primary" onClick={abrirNovaCategoria} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Categoria
          </button>
        ) : (
          <button className="btn btn-primary" onClick={abrirNovaForma} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Nova Forma de Pagamento
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '2px', padding: '4px', background: 'var(--c-1a)', border: '1px solid var(--c-25)', borderRadius: '9px', width: 'fit-content', marginBottom: '24px' }}>
        {(['categorias', 'formas'] as Secao[]).map(sVal => (
          <button
            key={sVal}
            onClick={() => setSecao(sVal)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px', borderRadius: '7px',
              border: secao === sVal ? '1px solid var(--c-fff)' : '1px solid transparent',
              background: secao === sVal ? 'rgba(var(--ink),0.07)' : 'transparent',
              color: secao === sVal ? 'var(--c-fff)' : 'var(--c-55)',
              fontSize: '13px', fontWeight: secao === sVal ? 600 : 400,
              cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit',
            }}
          >
            {sVal === 'categorias' ? <><Tags size={13} /> Categorias</> : <><Wallet size={13} /> Formas de Pagamento</>}
          </button>
        ))}
      </div>

      {error && !showCatModal && !showFormaModal && <p style={{ fontSize: '12px', color: 'var(--c-66)', marginBottom: '16px' }}>{error}</p>}

      <AnimatePresence mode="wait">
        {secao === 'categorias' ? (
          <motion.div key="categorias" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {loading ? (
              <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: 'var(--c-55)', margin: '0 0 8px' }}>Receitas</p>
                <ListaCategorias itens={receitas} onAbrir={c => setCatAbertaId(c.id)} onEditar={abrirEditarCategoria} podeEditar={podeEditar} onToggle={toggleAtivoCategoria} onExcluir={excluirCategoria} vazio="Nenhuma categoria de receita." />
                <p style={{ fontSize: '12px', color: 'var(--c-55)', margin: '20px 0 8px' }}>Despesas</p>
                <ListaCategorias itens={despesas} onAbrir={c => setCatAbertaId(c.id)} onEditar={abrirEditarCategoria} podeEditar={podeEditar} onToggle={toggleAtivoCategoria} onExcluir={excluirCategoria} vazio="Nenhuma categoria de despesa." />
              </>
            )}
          </motion.div>
        ) : (
          <motion.div key="formas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="list-header" style={{
                display: 'grid', minWidth: '450px', gridTemplateColumns: '1fr 90px 130px',
                padding: '10px 24px', borderBottom: '1px solid var(--c-22)',
                fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'var(--header-bg)',
              }}>
                <span>Nome</span><span>Status</span><span></span>
              </div>
              {loading ? (
                <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
              ) : formas.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Nenhuma forma de pagamento cadastrada.</div>
              ) : formas.map((f, i) => (
                <motion.div
                  key={f.id}
                  className="list-row clicavel"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                  onClick={() => setFormaAbertaId(f.id)}
                  style={{
                    display: 'grid', minWidth: '450px', gridTemplateColumns: '1fr 90px 130px',
                    padding: '12px 24px', alignItems: 'center',
                    borderBottom: i < formas.length - 1 ? '1px solid var(--c-1f)' : 'none',
                  }}
                  whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
                >
                  <span style={{ fontSize: '13px', color: 'var(--c-fff)' }}>{f.nome}</span>
                  <button
                    className={`status-pill${f.ativo ? '' : ' inativo'}`}
                    onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivoForma(f) }}
                    disabled={!podeEditar}
                    title={podeEditar ? (f.ativo ? 'Clique para desativar' : 'Clique para ativar') : undefined}
                  >
                    {f.ativo ? 'Ativa' : 'Inativa'}
                  </button>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                    {podeEditar && <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEditarForma(f) }}><Pencil size={12} /></button>}
                    {podeEditar && <button className="btn btn-icon" title="Excluir" onClick={e => { e.stopPropagation(); excluirForma(f) }}><Trash2 size={12} /></button>}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards de visualização */}
      <AnimatePresence>
        {catAberta && (
          <CategoriaDetalhe
            key={catAberta.id}
            categoria={catAberta}
            categorias={categorias}
            podeEditar={podeEditar}
            onClose={() => setCatAbertaId(null)}
            onEditar={() => { setCatAbertaId(null); abrirEditarCategoria(catAberta) }}
            onAlternarAtivo={() => toggleAtivoCategoria(catAberta)}
            onExcluir={() => excluirCategoria(catAberta)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {formaAberta && (
          <FormaDetalhe
            key={formaAberta.id}
            forma={formaAberta}
            podeEditar={podeEditar}
            onClose={() => setFormaAbertaId(null)}
            onEditar={() => { setFormaAbertaId(null); abrirEditarForma(formaAberta) }}
            onAlternarAtivo={() => toggleAtivoForma(formaAberta)}
            onExcluir={() => excluirForma(formaAberta)}
          />
        )}
      </AnimatePresence>

      {/* Cadastro / edição de categoria */}
      <AnimatePresence>
        {showCatModal && (
          <ModalFormulario
            tamanho="pequeno"
            icone={<Tags size={18} />}
            titulo={catEditando ? 'Editar Categoria' : 'Nova Categoria'}
            descricao={catEditando?.nome}
            onClose={fecharCategoria}
            onSalvar={salvarCategoria}
            salvando={saving}
            rotuloSalvar={catEditando ? 'Salvar' : 'Cadastrar'}
            erro={error}
          >
            <FormGrade colunas={2}>
              <Campo rotulo="Nome *">
                <input className="input" placeholder="Ex: Marketing" value={catForm.nome} onChange={e => setCatForm(f => ({ ...f, nome: e.target.value }))} />
              </Campo>
              <Campo rotulo="Tipo">
                <select className="input" value={catForm.tipo} onChange={e => setCatForm(f => ({ ...f, tipo: e.target.value as CategoriaFinanceiraTipo, categoria_pai_id: '' }))}>
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </Campo>
              <Campo
                rotulo="Conta sintética (agrupadora)"
                span="total"
                ajuda="Deixe em branco para uma conta sintética (agrupa outras no DRE) ou vincule a uma para criar uma conta analítica (recebe lançamentos)."
              >
                <select className="input" value={catForm.categoria_pai_id} onChange={e => setCatForm(f => ({ ...f, categoria_pai_id: e.target.value }))}>
                  <option value="">Nenhuma — esta é uma conta de detalhe (analítica)</option>
                  {categorias
                    .filter(c => c.tipo === catForm.tipo && !c.categoria_pai_id && c.id !== catEditando?.id)
                    .map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>

      {/* Cadastro / edição de forma de pagamento */}
      <AnimatePresence>
        {showFormaModal && (
          <ModalFormulario
            tamanho="pequeno"
            icone={<Wallet size={18} />}
            titulo={formaEditando ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
            descricao={formaEditando ? formaEditando.nome : 'Aparece para escolher na baixa das contas a pagar e a receber.'}
            onClose={fecharForma}
            onSalvar={salvarForma}
            salvando={saving}
            rotuloSalvar={formaEditando ? 'Salvar' : 'Cadastrar'}
            erro={error}
          >
            <FormGrade colunas={2}>
              <Campo rotulo="Nome *" span="total">
                <input className="input" placeholder="Ex: Vale-refeição" value={formaForm.nome} onChange={e => setFormaForm({ nome: e.target.value })} />
              </Campo>
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>
    </div>
  )
}

function ordenarHierarquia(itens: CategoriaFinanceira[]): { c: CategoriaFinanceira; nivel: number }[] {
  const raizes = itens.filter(c => !c.categoria_pai_id)
  const filhas = (id: string) => itens.filter(c => c.categoria_pai_id === id)
  const resultado: { c: CategoriaFinanceira; nivel: number }[] = []
  raizes.forEach(r => {
    resultado.push({ c: r, nivel: 0 })
    filhas(r.id).forEach(f => resultado.push({ c: f, nivel: 1 }))
  })
  return resultado
}

function ListaCategorias({ itens, podeEditar, onAbrir, onEditar, onToggle, onExcluir, vazio }: {
  itens: CategoriaFinanceira[]
  podeEditar: boolean
  onAbrir: (c: CategoriaFinanceira) => void
  onEditar: (c: CategoriaFinanceira) => void
  onToggle: (c: CategoriaFinanceira) => void
  onExcluir: (c: CategoriaFinanceira) => void
  vazio: string
}) {
  const linhas = ordenarHierarquia(itens)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '4px' }}>
      {linhas.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>{vazio}</div>
      ) : linhas.map(({ c, nivel }, i) => (
        <motion.div
          key={c.id}
          className="list-row clicavel"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
          onClick={() => onAbrir(c)}
          style={{
            display: 'grid', minWidth: '450px', gridTemplateColumns: '1fr 90px 130px',
            padding: '12px 24px', alignItems: 'center',
            borderBottom: i < linhas.length - 1 ? '1px solid var(--c-1f)' : 'none',
          }}
          whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
        >
          <span style={{ fontSize: '13px', color: nivel > 0 ? 'var(--c-a3)' : 'var(--c-fff)', fontWeight: nivel > 0 ? 400 : 600, paddingLeft: nivel > 0 ? '18px' : 0 }}>
            {nivel > 0 && '↳ '}{c.nome}
          </span>
          <button
            className={`status-pill${c.ativo ? '' : ' inativo'}`}
            onClick={e => { e.stopPropagation(); if (podeEditar) onToggle(c) }}
            disabled={!podeEditar}
            title={podeEditar ? (c.ativo ? 'Clique para desativar' : 'Clique para ativar') : undefined}
          >
            {c.ativo ? 'Ativa' : 'Inativa'}
          </button>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            {podeEditar && <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); onEditar(c) }}><Pencil size={12} /></button>}
            {podeEditar && <button className="btn btn-icon" title="Excluir" onClick={e => { e.stopPropagation(); onExcluir(c) }}><Trash2 size={12} /></button>}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
