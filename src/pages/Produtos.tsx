import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { useLoja } from '../hooks/useLoja'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle, Package, Scissors, Check, Tag, Pencil, Download, Upload, ClipboardList } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import EtiquetaModal from '../components/EtiquetaModal'
import EntradaProdutosModal from '../components/EntradaProdutosModal'
import ProdutoFotosModal from '../components/ProdutoFotosModal'
import { ProdutoDetalheModal, ServicoDetalheModal } from '../components/ProdutoServicoDetalhe'
import Checkbox from '../components/ui/Checkbox'
import BarraSelecao, { ItemSelecao } from '../components/ui/BarraSelecao'
import ModalFormulario, { Campo, FormGrade, SecaoForm } from '../components/ui/ModalFormulario'
import { usePermissoes } from '../hooks/usePermissoes'
import { useSelecao } from '../hooks/useSelecao'
import { COLUNAS_PRODUTO } from '../lib/produtos'
import type { Produto, ProdutoCategoria, Servico, Profissional } from '../types'

type Secao = 'produtos' | 'servicos'

const CAT_LABEL: Record<ProdutoCategoria, string> = {
  bebidas: 'Bebidas', pomadas: 'Pomadas', petiscos: 'Petiscos', outros: 'Outros',
}

const CATEGORIAS_VALIDAS: ProdutoCategoria[] = ['bebidas', 'pomadas', 'petiscos', 'outros']

const COLUNAS_SERVICO = 'minmax(200px, 1fr) 92px 76px 76px minmax(120px, 0.9fr) 70px 36px'

const COLUNAS_IMPORTACAO = [
  'Nome do Produto', 'Categoria (bebidas/pomadas/petiscos/outros)', 'Unidade (un, kg, ml...)',
  'Preço de Custo', 'Preço de Venda', 'Estoque Atual', 'Estoque Mínimo', 'Estoque Máximo', 'Comissão (%)', 'SKU / Código',
] as const

function baixarModeloProdutos() {
  const exemplo = ['Pomada Modeladora', 'pomadas', 'un', 12, 25, 20, 5, 50, '', '']
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS_IMPORTACAO as unknown as string[], exemplo])
  ws['!cols'] = COLUNAS_IMPORTACAO.map(() => ({ wch: 22 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos')
  XLSX.writeFile(wb, 'modelo-importacao-produtos.xlsx')
}

interface LinhaImportada {
  nome: string
  categoria: ProdutoCategoria
  unidade: string
  preco_custo: number
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  estoque_maximo: number | null
  comissao_percentual: number | null
  sku: string | null
  ativo: true
}

function normalizarCategoria(valor: unknown): ProdutoCategoria {
  const v = String(valor ?? '').trim().toLowerCase()
  return (CATEGORIAS_VALIDAS as string[]).includes(v) ? (v as ProdutoCategoria) : 'outros'
}

function numero(valor: unknown, padrao = 0): number {
  const n = Number(String(valor ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : padrao
}

async function lerPlanilhaProdutos(arquivo: File): Promise<{ validas: LinhaImportada[]; erros: string[] }> {
  const buf = await arquivo.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const linhas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

  const validas: LinhaImportada[] = []
  const erros: string[] = []

  linhas.forEach((linha, i) => {
    const nome = String(linha[COLUNAS_IMPORTACAO[0]] ?? '').trim()
    const precoVenda = numero(linha[COLUNAS_IMPORTACAO[4]], NaN)
    if (!nome) { erros.push(`Linha ${i + 2}: sem nome do produto, ignorada.`); return }
    if (!Number.isFinite(precoVenda) || precoVenda <= 0) { erros.push(`Linha ${i + 2} (${nome}): preço de venda inválido, ignorada.`); return }

    validas.push({
      nome,
      categoria: normalizarCategoria(linha[COLUNAS_IMPORTACAO[1]]),
      unidade: String(linha[COLUNAS_IMPORTACAO[2]] ?? '').trim() || 'un',
      preco_custo: numero(linha[COLUNAS_IMPORTACAO[3]], 0),
      preco_venda: precoVenda,
      estoque_atual: numero(linha[COLUNAS_IMPORTACAO[5]], 0),
      estoque_minimo: numero(linha[COLUNAS_IMPORTACAO[6]], 5),
      estoque_maximo: linha[COLUNAS_IMPORTACAO[7]] ? numero(linha[COLUNAS_IMPORTACAO[7]], 0) : null,
      comissao_percentual: linha[COLUNAS_IMPORTACAO[8]] ? numero(linha[COLUNAS_IMPORTACAO[8]], 0) : null,
      sku: String(linha[COLUNAS_IMPORTACAO[9]] ?? '').trim() || null,
      ativo: true,
    })
  })

  return { validas, erros }
}

export default function Produtos() {
  const { podeEditar: podeEditarTela, verCustoProdutos: verCusto } = usePermissoes()
  // Loja sem estoque mínimo/máximo (Configurações): sem campos e sem alertas.
  const { controlaEstoqueMinimo } = useLoja()
  const podeEditar = podeEditarTela('produtos')
  const [secao, setSecao] = useState<Secao>('produtos')

  // Produtos
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [showProdModal, setShowProdModal] = useState(false)
  const [editProdId, setEditProdId] = useState<string | null>(null)
  const [prodForm, setProdForm] = useState({
    nome: '', categoria: 'bebidas' as ProdutoCategoria, sku: '', unidade: 'un',
    preco_custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '5', estoque_maximo: '',
    comissao_percentual: '',
  })

  // Serviços
  const [servicos, setServicos] = useState<Servico[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [showServModal, setShowServModal] = useState(false)
  const [editServId, setEditServId] = useState<string | null>(null)
  const [servForm, setServForm] = useState({
    nome: '', preco: '', duracao_minutos: '30', descricao: '', categoria: '', comissao_percentual: '',
    preco_na_venda: false, profissional_ids: [] as string[],
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [produtosEtiqueta, setProdutosEtiqueta] = useState<Produto[] | null>(null)
  const [importando, setImportando] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{ ok: number; erros: string[] } | null>(null)
  const [showEntrada, setShowEntrada] = useState(false)
  const [produtoFotosAlvo, setProdutoFotosAlvo] = useState<Produto | null>(null)
  const [produtoAbertoId, setProdutoAbertoId] = useState<string | null>(null)
  const [servicoAbertoId, setServicoAbertoId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selecao = useSelecao(produtos.map(p => p.id))

  const alertas = controlaEstoqueMinimo ? produtos.filter(p => p.estoque_atual <= p.estoque_minimo) : []
  // Colunas enxutas: SKU, margem e comissão vão numa 2ª linha embaixo do
  // nome.
  const colunasTabela = verCusto
    ? '22px minmax(220px, 1fr) 92px 96px 96px 104px 70px 72px'
    : '22px minmax(220px, 1fr) 92px 96px 104px 70px 72px'
  const larguraMinima = verCusto ? '780px' : '680px'
  const produtoAberto = produtoAbertoId ? produtos.find(p => p.id === produtoAbertoId) ?? null : null
  const servicoAberto = servicoAbertoId ? servicos.find(s => s.id === servicoAbertoId) ?? null : null

  // O custo não sai da tabela produtos pela API (privilégio de coluna):
  // quem tem permissão de ver custo recebe pela RPC custos_produtos().
  async function carregarProdutos() {
    const [{ data, error: err }, custos] = await Promise.all([
      supabase.from('produtos').select(COLUNAS_PRODUTO).order('nome'),
      verCusto ? supabase.rpc('custos_produtos') : Promise.resolve({ data: [] }),
    ])
    if (err) { setError(err.message); return }
    const custoPorId = new Map(((custos.data ?? []) as { produto_id: string; preco_custo: number }[]).map(c => [c.produto_id, Number(c.preco_custo)]))
    setProdutos(((data ?? []) as unknown as Produto[]).map(p => ({ ...p, preco_custo: custoPorId.get(p.id) ?? 0 })))
  }

  async function handleImportarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setImportando(true); setResultadoImportacao(null); setError('')
    try {
      const { validas, erros } = await lerPlanilhaProdutos(arquivo)
      if (validas.length > 0) {
        const linhas = verCusto ? validas : validas.map(({ preco_custo: _custo, ...resto }) => resto)
        const { error: err } = await supabase.from('produtos').insert(linhas)
        if (err) { setError(err.message); setImportando(false); return }
        await carregarProdutos()
      }
      setResultadoImportacao({ ok: validas.length, erros })
    } catch {
      setError('Não foi possível ler o arquivo. Confira se é um .xlsx ou .csv válido.')
    }
    setImportando(false)
  }

  function imprimirSelecionados() {
    setProdutosEtiqueta(produtos.filter(p => selecao.tem(p.id)))
  }

  useEffect(() => {
    carregarProdutos()

    supabase
      .from('servicos')
      .select('*, profissionais:profissional_servicos(profissional:profissionais(*))')
      .order('nome')
      .then(({ data }) => {
        const mapped = ((data ?? []) as any[]).map(s => ({
          ...s,
          profissionais: (s.profissionais ?? []).map((ps: any) => ps.profissional).filter(Boolean),
        }))
        setServicos(mapped as Servico[])
        setLoading(false)
      })

    supabase.from('profissionais').select('*').order('nome')
      .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verCusto])

  async function handleSaveProd() {
    if (!prodForm.nome.trim() || !prodForm.preco_venda) {
      setError('Nome e preço de venda são obrigatórios.'); return
    }
    setSaving(true); setError('')
    const payload: Record<string, unknown> = {
      nome: prodForm.nome, categoria: prodForm.categoria,
      sku: prodForm.sku || null,
      unidade: prodForm.unidade || 'un',
      preco_venda: Number(prodForm.preco_venda),
      estoque_atual: Number(prodForm.estoque_atual) || 0,
      estoque_minimo: Number(prodForm.estoque_minimo) || 5,
      estoque_maximo: prodForm.estoque_maximo ? Number(prodForm.estoque_maximo) : null,
      comissao_percentual: prodForm.comissao_percentual ? Number(prodForm.comissao_percentual) : null,
    }
    // Quem não vê custo também não define/altera custo — omitido do
    // payload em vez de mandar 0 (senão zerava o custo real ao editar
    // qualquer outro campo).
    if (verCusto) payload.preco_custo = Number(prodForm.preco_custo) || 0
    const custo = (anterior?: Produto) => verCusto ? Number(prodForm.preco_custo) || 0 : anterior?.preco_custo ?? 0
    if (editProdId) {
      const { data, error: err } = await supabase.from('produtos').update(payload).eq('id', editProdId).select(COLUNAS_PRODUTO).single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setProdutos(prev => prev.map(p => p.id === editProdId ? { ...(data as unknown as Produto), preco_custo: custo(p) } : p))
    } else {
      const { data, error: err } = await supabase.from('produtos').insert({ ...payload, ativo: true }).select(COLUNAS_PRODUTO).single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) setProdutos(prev => [...prev, { ...(data as unknown as Produto), preco_custo: custo() }])
    }
    fecharModalProd(); setSaving(false)
  }

  function abrirNovoProd() {
    setEditProdId(null)
    setProdForm({ nome: '', categoria: 'bebidas', sku: '', unidade: 'un', preco_custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '5', estoque_maximo: '', comissao_percentual: '' })
    setError('')
    setShowProdModal(true)
  }

  function abrirEdicaoProd(p: Produto) {
    setEditProdId(p.id)
    setProdForm({
      nome: p.nome, categoria: p.categoria, sku: p.sku ?? '', unidade: p.unidade,
      preco_custo: p.preco_custo != null ? String(p.preco_custo) : '', preco_venda: String(p.preco_venda),
      estoque_atual: String(p.estoque_atual), estoque_minimo: String(p.estoque_minimo),
      estoque_maximo: p.estoque_maximo != null ? String(p.estoque_maximo) : '',
      comissao_percentual: p.comissao_percentual != null ? String(p.comissao_percentual) : '',
    })
    setError('')
    setShowProdModal(true)
  }

  function fecharModalProd() {
    setShowProdModal(false)
    setEditProdId(null)
    setError('')
  }

  async function toggleAtivoProd(id: string, ativo: boolean) {
    setProdutos(prev => prev.map(p => p.id === id ? { ...p, ativo: !ativo } : p))
    await supabase.from('produtos').update({ ativo: !ativo }).eq('id', id)
  }

  async function handleSaveServ() {
    if (!servForm.nome.trim()) { setError('O nome é obrigatório.'); return }
    if (!servForm.preco_na_venda && !servForm.preco) {
      setError('Informe o preço ou marque "Valor definido na venda".'); return
    }
    setSaving(true); setError('')
    const payload = {
      nome: servForm.nome,
      preco: Number(servForm.preco) || 0,
      preco_na_venda: servForm.preco_na_venda,
      duracao_minutos: Number(servForm.duracao_minutos) || 30,
      descricao: servForm.descricao || null,
      categoria: servForm.categoria || null,
      comissao_percentual: servForm.comissao_percentual ? Number(servForm.comissao_percentual) : null,
    }
    let servicoId: string | null = editServId
    if (editServId) {
      const { data, error: err } = await supabase.from('servicos').update(payload).eq('id', editServId).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) {
        await supabase.from('profissional_servicos').delete().eq('servico_id', editServId)
        const novoServ: Servico = {
          ...(data as Servico),
          profissionais: profissionais.filter(p => servForm.profissional_ids.includes(p.id)),
        }
        setServicos(prev => prev.map(s => s.id === editServId ? novoServ : s))
      }
    } else {
      const { data, error: err } = await supabase.from('servicos').insert({ ...payload, ativo: true }).select('*').single()
      if (err) { setError(err.message); setSaving(false); return }
      if (data) {
        servicoId = (data as Servico).id
        const novoServ: Servico = {
          ...(data as Servico),
          profissionais: profissionais.filter(p => servForm.profissional_ids.includes(p.id)),
        }
        setServicos(prev => [...prev, novoServ])
      }
    }
    if (servicoId && servForm.profissional_ids.length > 0) {
      await supabase.from('profissional_servicos').insert(
        servForm.profissional_ids.map(pid => ({ profissional_id: pid, servico_id: servicoId }))
      )
    }
    fecharModalServ(); setSaving(false)
  }

  function abrirNovoServ() {
    setEditServId(null)
    setServForm({ nome: '', preco: '', duracao_minutos: '30', descricao: '', categoria: '', comissao_percentual: '', preco_na_venda: false, profissional_ids: [] })
    setError('')
    setShowServModal(true)
  }

  function abrirEdicaoServ(s: Servico) {
    setEditServId(s.id)
    setServForm({
      nome: s.nome, preco: s.preco_na_venda && !s.preco ? '' : String(s.preco), duracao_minutos: String(s.duracao_minutos),
      preco_na_venda: !!s.preco_na_venda,
      descricao: s.descricao ?? '', categoria: s.categoria ?? '',
      comissao_percentual: s.comissao_percentual != null ? String(s.comissao_percentual) : '',
      profissional_ids: (s.profissionais ?? []).map(p => p.id),
    })
    setError('')
    setShowServModal(true)
  }

  function fecharModalServ() {
    setShowServModal(false)
    setEditServId(null)
    setError('')
  }

  async function toggleAtivoServ(id: string, ativo: boolean) {
    setServicos(prev => prev.map(s => s.id === id ? { ...s, ativo: !ativo } : s))
    await supabase.from('servicos').update({ ativo: !ativo }).eq('id', id)
  }

  function toggleProfissional(id: string) {
    setServForm(f => ({
      ...f,
      profissional_ids: f.profissional_ids.includes(id)
        ? f.profissional_ids.filter(p => p !== id)
        : [...f.profissional_ids, id],
    }))
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Produtos & Serviços</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
            {secao === 'produtos' ? 'Estoque da conveniência' : 'Serviços oferecidos'}
          </p>
        </div>
        {secao === 'produtos' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {podeEditar && (
              <button className="btn btn-icon" title="Baixar modelo de planilha" onClick={baixarModeloProdutos}>
                <Download size={13} />
              </button>
            )}
            {podeEditar && (
              <button className="btn btn-icon" title={importando ? 'Importando...' : 'Importar produtos por planilha'} onClick={() => fileInputRef.current?.click()} disabled={importando}>
                <Upload size={13} />
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportarArquivo} style={{ display: 'none' }} />
            {podeEditar && <div style={{ width: '1px', height: '20px', background: 'var(--c-25)', margin: '0 4px' }} />}
            {podeEditar && verCusto && (
              <button className="btn btn-secondary" onClick={() => setShowEntrada(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={14} /> Nova Entrada
              </button>
            )}
            {podeEditar && (
              <button className="btn btn-primary" onClick={abrirNovoProd} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={14} strokeWidth={2.5} /> Novo Produto
              </button>
            )}
          </div>
        ) : podeEditar ? (
          <button className="btn btn-primary" onClick={abrirNovoServ} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={14} strokeWidth={2.5} /> Novo Serviço
          </button>
        ) : null}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '2px',
        padding: '4px',
        background: 'var(--c-1a)',
        border: '1px solid var(--c-25)',
        borderRadius: '9px',
        width: 'fit-content',
        marginBottom: '24px',
      }}>
        {(['produtos', 'servicos'] as Secao[]).map(s => (
          <button
            key={s}
            onClick={() => setSecao(s)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px',
              borderRadius: '7px',
              border: secao === s ? '1px solid var(--c-fff)' : '1px solid transparent',
              background: secao === s ? 'rgba(var(--ink),0.07)' : 'transparent',
              color: secao === s ? 'var(--c-fff)' : 'var(--c-55)',
              fontSize: '13px',
              fontWeight: secao === s ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: 'inherit',
            }}
          >
            {s === 'produtos' ? <><Package size={13} /> Produtos</> : <><Scissors size={13} /> Serviços</>}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {secao === 'produtos' ? (
          <motion.div key="produtos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {error && <p style={{ fontSize: '12px', color: 'var(--c-66)', marginBottom: '16px' }}>{error}</p>}
            {resultadoImportacao && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px',
                  padding: '12px 16px',
                  background: 'rgba(var(--ink),0.04)',
                  border: '1px solid var(--c-33)',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}
              >
                <Upload size={14} style={{ color: 'var(--c-a3)', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '13px', color: 'var(--c-a3)' }}>
                    <strong style={{ color: 'var(--c-fff)' }}>{resultadoImportacao.ok} produto{resultadoImportacao.ok === 1 ? '' : 's'}</strong> importado{resultadoImportacao.ok === 1 ? '' : 's'} com sucesso.
                    {resultadoImportacao.erros.length > 0 && ` ${resultadoImportacao.erros.length} linha(s) ignorada(s):`}
                  </p>
                  {resultadoImportacao.erros.length > 0 && (
                    <ul style={{ marginTop: '6px', paddingLeft: '18px' }}>
                      {resultadoImportacao.erros.map((e, i) => (
                        <li key={i} style={{ fontSize: '11px', color: 'var(--c-66)' }}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button className="btn btn-icon" onClick={() => setResultadoImportacao(null)}><X size={12} /></button>
              </motion.div>
            )}
            {alertas.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 16px',
                  background: 'rgba(var(--ink),0.04)',
                  border: '1px solid var(--c-33)',
                  borderRadius: '8px',
                  marginBottom: '20px',
                }}
              >
                <AlertTriangle size={14} style={{ color: 'var(--c-a3)', flexShrink: 0 }} />
                <p style={{ fontSize: '13px', color: 'var(--c-a3)' }}>
                  <strong style={{ color: 'var(--c-fff)' }}>{alertas.length} produto{alertas.length > 1 ? 's' : ''}</strong>{' '}
                  abaixo do estoque mínimo: {alertas.map(p => p.nome).join(', ')}.
                </p>
              </motion.div>
            )}

            <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="list-header" style={{
                display: 'grid',
                minWidth: larguraMinima,
                gridTemplateColumns: colunasTabela,
                gap: '12px',
                padding: '10px 20px',
                borderBottom: '1px solid var(--c-22)',
                fontSize: '10px', fontWeight: 600, color: 'var(--c-44)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'var(--header-bg)',
                alignItems: 'center',
              }}>
                <span className="celula-check">
                  <Checkbox label="Selecionar todos os produtos" checked={selecao.todos} indeterminate={selecao.alguns} onChange={selecao.alternarTodos} disabled={produtos.length === 0} />
                </span>
                <span>Produto</span><span>Categoria</span>{verCusto && <span style={{ textAlign: 'right' }}>Custo</span>}
                <span style={{ textAlign: 'right' }}>Venda</span><span>Estoque</span><span>Status</span><span />
              </div>

              {produtos.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                  Nenhum produto cadastrado.
                </div>
              ) : produtos.map((p, i) => {
                const baixo  = controlaEstoqueMinimo && p.estoque_atual <= p.estoque_minimo
                const margem = verCusto && p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null
                const detalhes = [p.sku && `#${p.sku}`, margem && `+${margem}% margem`, p.comissao_percentual != null && `comissão ${p.comissao_percentual}%`].filter(Boolean).join(' · ')
                return (
                  <motion.div
                    key={p.id}
                    className={`list-row clicavel${selecao.tem(p.id) ? ' selecionada' : ''}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
                    onClick={() => setProdutoAbertoId(p.id)}
                    style={{
                      display: 'grid',
                      minWidth: larguraMinima,
                      gridTemplateColumns: colunasTabela,
                      gap: '12px',
                      padding: '10px 20px',
                      borderBottom: i < produtos.length - 1 ? '1px solid var(--c-1f)' : 'none',
                      alignItems: 'center',
                    }}
                    whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
                  >
                    <span className="celula-check">
                      <Checkbox label={`Selecionar ${p.nome}`} checked={selecao.tem(p.id)} onChange={m => selecao.alternar(p.id, m)} />
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '6px', flexShrink: 0,
                        background: 'var(--c-1f)', border: '1px solid var(--c-2a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      }}>
                        {p.foto_url ? (
                          <img src={p.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Package size={13} style={{ color: 'var(--c-44)' }} />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{p.nome}</p>
                        {detalhes && <p className="subtexto texto-cortado">{detalhes}</p>}
                      </div>
                    </div>
                    <span className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-66)' }}>{CAT_LABEL[p.categoria]}</span>
                    {verCusto && <span className="valor-num" style={{ fontSize: '13px', color: 'var(--c-55)', textAlign: 'right' }}>{formatCurrency(p.preco_custo)}</span>}
                    <span className="valor-num" style={{ fontSize: '13px', color: 'var(--c-a3)', fontWeight: 500, textAlign: 'right' }}>{formatCurrency(p.preco_venda)}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: baixo ? 'var(--c-fff)' : 'var(--c-a3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {p.estoque_atual} {p.unidade}
                        {baixo && <AlertTriangle size={11} style={{ color: 'var(--c-77)' }} />}
                      </p>
                    </div>
                    <button
                      className={`status-pill${p.ativo ? '' : ' inativo'}`}
                      onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivoProd(p.id, p.ativo) }}
                      disabled={!podeEditar}
                      title={podeEditar ? (p.ativo ? 'Clique para desativar' : 'Clique para ativar') : undefined}
                    >
                      {p.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                      {podeEditar && (
                        <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicaoProd(p) }} style={{ width: '30px', height: '30px' }}>
                          <Pencil size={12} />
                        </button>
                      )}
                      {podeEditar && (
                        <button className="btn btn-icon" title="Gerar/imprimir etiqueta" onClick={e => { e.stopPropagation(); setProdutosEtiqueta([p]) }} style={{ width: '30px', height: '30px' }}>
                          <Tag size={12} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Cards (mobile) */}
            {produtos.length > 0 && (
              <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
                {produtos.map((p, i) => {
                  const baixo  = controlaEstoqueMinimo && p.estoque_atual <= p.estoque_minimo
                  const margem = verCusto && p.preco_custo > 0 ? ((p.preco_venda - p.preco_custo) / p.preco_custo * 100).toFixed(0) : null
                  const detalhes = [p.sku && `#${p.sku}`, margem && `+${margem}% margem`, p.comissao_percentual != null && `comissão ${p.comissao_percentual}%`].filter(Boolean).join(' · ')
                  return (
                    <motion.div
                      key={p.id}
                      className="card entity-card"
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.04 }}
                      onClick={() => setProdutoAbertoId(p.id)}
                      style={{ cursor: 'pointer', borderColor: selecao.tem(p.id) ? 'var(--c-55)' : undefined }}
                    >
                      <div className="entity-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{ marginTop: '3px', display: 'flex' }}>
                          <Checkbox label={`Selecionar ${p.nome}`} checked={selecao.tem(p.id)} onChange={m => selecao.alternar(p.id, m)} />
                        </span>
                        <button
                          title="Ver fotos"
                          onClick={e => { e.stopPropagation(); setProdutoFotosAlvo(p) }}
                          className="entity-avatar"
                          style={{
                            width: '40px', height: '40px', borderRadius: '10px', padding: 0, cursor: 'pointer',
                            background: 'var(--c-26)', border: '1px solid var(--c-33)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          {p.foto_url ? (
                            <img src={p.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Package size={16} style={{ color: 'var(--c-a3)' }} />
                          )}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="entity-title" style={{
                              fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
                            }}>{p.nome}</h3>
                          </div>
                          {detalhes && <p className="entity-subtle" style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '2px' }}>{detalhes}</p>}
                        </div>
                        <button
                          className={`status-pill${p.ativo ? '' : ' inativo'}`}
                          onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivoProd(p.id, p.ativo) }}
                          disabled={!podeEditar}
                          style={{ flexShrink: 0 }}
                        >
                          {p.ativo ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>

                      <div className="entity-divider" style={{ height: '1px', background: 'var(--c-22)', margin: '14px 0' }} />

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Categoria</p>
                          <p style={{ fontSize: '13px', color: 'var(--c-a3)', textTransform: 'capitalize' }}>{CAT_LABEL[p.categoria]}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Estoque</p>
                          <p style={{ fontSize: '13px', color: baixo ? 'var(--c-fff)' : 'var(--c-a3)', fontWeight: baixo ? 700 : 400 }}>
                            {p.estoque_atual} {p.unidade} {baixo && <AlertTriangle size={11} style={{ marginLeft: '2px', color: 'var(--c-77)', verticalAlign: 'middle' }} />}
                          </p>
                        </div>
                        {verCusto && (
                          <div>
                            <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Custo</p>
                            <p style={{ fontSize: '13px', color: 'var(--c-55)' }}>{formatCurrency(p.preco_custo)}</p>
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Venda</p>
                          <p style={{ fontSize: '13px', color: 'var(--c-a3)', fontWeight: 500 }}>{formatCurrency(p.preco_venda)}</p>
                        </div>
                      </div>

                      <div className="entity-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {podeEditar && (
                          <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicaoProd(p) }}>
                            <Pencil size={12} />
                          </button>
                        )}
                        {podeEditar && (
                          <button className="btn btn-icon" title="Gerar/imprimir etiqueta" onClick={e => { e.stopPropagation(); setProdutosEtiqueta([p]) }}>
                            <Tag size={12} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            <BarraSelecao
              quantidade={selecao.quantidade}
              onLimpar={selecao.limpar}
              acoes={podeEditar ? (
                <button className="btn btn-secondary btn-sm" onClick={imprimirSelecionados} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={12} /> Imprimir etiquetas
                </button>
              ) : undefined}
            >
              <ItemSelecao rotulo="Em estoque" valor={produtos.filter(p => selecao.tem(p.id)).reduce((s, p) => s + p.estoque_atual, 0)} />
              <ItemSelecao rotulo="Valor de venda" valor={formatCurrency(produtos.filter(p => selecao.tem(p.id)).reduce((s, p) => s + p.estoque_atual * p.preco_venda, 0))} />
            </BarraSelecao>
            {produtos.length === 0 && (
              <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                Nenhum produto cadastrado.
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="servicos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="card desktop-row" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="list-header" style={{
                display: 'grid',
                minWidth: '720px', gridTemplateColumns: COLUNAS_SERVICO, gap: '12px', alignItems: 'center',
                padding: '10px 20px',
                borderBottom: '1px solid var(--c-22)',
                fontSize: '10px', fontWeight: 600, color: 'var(--c-44)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
                background: 'var(--header-bg)',
              }}>
                <span>Serviço</span><span style={{ textAlign: 'right' }}>Preço</span><span>Duração</span><span>Comissão</span><span>Profissionais</span><span>Status</span><span />
              </div>

              {loading ? (
                <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                  Carregando...
                </div>
              ) : servicos.length === 0 ? (
                <div style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                  Nenhum serviço cadastrado.
                </div>
              ) : servicos.map((s, i) => (
                <motion.div
                  key={s.id}
                  className="list-row clicavel"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }}
                  onClick={() => setServicoAbertoId(s.id)}
                  style={{
                    display: 'grid',
                    minWidth: '720px', gridTemplateColumns: COLUNAS_SERVICO, gap: '12px',
                    padding: '11px 20px',
                    borderBottom: i < servicos.length - 1 ? '1px solid var(--c-1f)' : 'none',
                    alignItems: 'center',
                  }}
                  whileHover={{ backgroundColor: 'rgba(var(--ink),0.02)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <Scissors size={13} style={{ color: 'var(--c-44)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p className="texto-cortado" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--c-fff)' }}>{s.nome}</p>
                      {s.categoria && <p className="subtexto texto-cortado">{s.categoria}</p>}
                    </div>
                  </div>
                  <span className="valor-num" style={{ fontSize: '13px', color: 'var(--c-a3)', fontWeight: 500, textAlign: 'right' }}>{s.preco_na_venda ? 'Na venda' : formatCurrency(s.preco)}</span>
                  <span style={{ fontSize: '12px', color: 'var(--c-66)' }}>{s.duracao_minutos} min</span>
                  <span style={{ fontSize: '12px', color: 'var(--c-66)' }}>{s.comissao_percentual != null ? `${s.comissao_percentual}%` : '—'}</span>
                  <span className="texto-cortado" style={{ fontSize: '12px', color: 'var(--c-a3)' }} title={s.profissionais?.map(p => p.nome).join(', ')}>
                    {s.profissionais && s.profissionais.length > 0 ? s.profissionais.map(p => p.nome).join(', ') : <span style={{ color: 'var(--c-33)' }}>—</span>}
                  </span>
                  <button
                    className={`status-pill${s.ativo ? '' : ' inativo'}`}
                    onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivoServ(s.id, s.ativo) }}
                    disabled={!podeEditar}
                    title={podeEditar ? (s.ativo ? 'Clique para desativar' : 'Clique para ativar') : undefined}
                  >
                    {s.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  {podeEditar ? (
                    <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicaoServ(s) }} style={{ width: '30px', height: '30px', justifySelf: 'end' }}>
                      <Pencil size={12} />
                    </button>
                  ) : <span />}
                </motion.div>
              ))}
            </div>

            {/* Cards (mobile) */}
            {!loading && servicos.length > 0 && (
              <div className="entity-grid mobile-only-grid" style={{ gap: '16px' }}>
                {servicos.map((s, i) => (
                  <motion.div
                    key={s.id}
                    className="card entity-card"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.04 }}
                    onClick={() => setServicoAbertoId(s.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="entity-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div className="entity-avatar" style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: 'var(--c-26)', border: '1px solid var(--c-33)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <Scissors size={16} style={{ color: 'var(--c-a3)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="entity-title" style={{
                          fontSize: '14px', fontWeight: 600, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{s.nome}</h3>
                        {s.categoria && <p className="entity-subtle" style={{ fontSize: '11px', color: 'var(--c-55)', marginTop: '2px' }}>{s.categoria}</p>}
                      </div>
                      <button
                        className={`status-pill${s.ativo ? '' : ' inativo'}`}
                        onClick={e => { e.stopPropagation(); if (podeEditar) toggleAtivoServ(s.id, s.ativo) }}
                        disabled={!podeEditar}
                        style={{ flexShrink: 0 }}
                      >
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>

                    <div className="entity-divider" style={{ height: '1px', background: 'var(--c-22)', margin: '14px 0' }} />

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Preço</p>
                        <p style={{ fontSize: '13px', color: 'var(--c-a3)', fontWeight: 500 }}>{s.preco_na_venda ? 'Na venda' : formatCurrency(s.preco)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Duração</p>
                        <p style={{ fontSize: '13px', color: 'var(--c-66)' }}>{s.duracao_minutos} min</p>
                      </div>
                      <div>
                        <p style={{ fontSize: '10px', color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Comissão</p>
                        <p style={{ fontSize: '13px', color: 'var(--c-66)' }}>{s.comissao_percentual != null ? `${s.comissao_percentual}%` : '—'}</p>
                      </div>
                    </div>

                    {s.profissionais && s.profissionais.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                        {s.profissionais.map(p => (
                          <span key={p.id} style={{
                            fontSize: '10px', color: 'var(--c-a3)',
                            background: 'rgba(var(--ink),0.06)',
                            border: '1px solid var(--c-2a)',
                            borderRadius: '99px',
                            padding: '2px 8px',
                          }}>{p.nome}</span>
                        ))}
                      </div>
                    )}

                    {podeEditar && (
                      <div className="entity-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-icon" title="Editar" onClick={e => { e.stopPropagation(); abrirEdicaoServ(s) }}>
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
            {!loading && servicos.length === 0 && (
              <div className="card mobile-only-grid" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>
                Nenhum serviço cadastrado.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cadastro / edição de produto */}
      <AnimatePresence>
        {showProdModal && (() => {
          const custo = Number(prodForm.preco_custo) || 0
          const venda = Number(prodForm.preco_venda) || 0
          const margem = custo > 0 && venda > 0 ? `${(((venda - custo) / custo) * 100).toFixed(0)}% · ${formatCurrency(venda - custo)} por unidade` : ''
          return (
            <ModalFormulario
              icone={<Package size={18} />}
              titulo={editProdId ? 'Editar Produto' : 'Novo Produto'}
              descricao={editProdId ? produtos.find(p => p.id === editProdId)?.nome : 'Nome e preço de venda são obrigatórios.'}
              onClose={fecharModalProd}
              onSalvar={handleSaveProd}
              salvando={saving}
              rotuloSalvar={editProdId ? 'Salvar' : 'Cadastrar'}
              erro={error}
            >
              <FormGrade>
                <SecaoForm titulo="Produto" />
                <Campo rotulo="Nome *" span={2}>
                  <input className="input" placeholder="Nome do produto" value={prodForm.nome} onChange={e => setProdForm(f => ({ ...f, nome: e.target.value }))} />
                </Campo>
                <Campo rotulo="Categoria">
                  <select className="input" value={prodForm.categoria} onChange={e => setProdForm(f => ({ ...f, categoria: e.target.value as ProdutoCategoria }))}>
                    <option value="bebidas">Bebidas</option>
                    <option value="pomadas">Pomadas</option>
                    <option value="petiscos">Petiscos</option>
                    <option value="outros">Outros</option>
                  </select>
                </Campo>
                <Campo rotulo="SKU / Código">
                  <input className="input" placeholder="opcional" value={prodForm.sku} onChange={e => setProdForm(f => ({ ...f, sku: e.target.value }))} />
                </Campo>
                <Campo rotulo="Unidade">
                  <input className="input" placeholder="un, kg, ml..." value={prodForm.unidade} onChange={e => setProdForm(f => ({ ...f, unidade: e.target.value }))} />
                </Campo>
                <Campo rotulo="Comissão (%)">
                  <input className="input" type="number" min={0} max={100} placeholder="usa a do profissional" value={prodForm.comissao_percentual} onChange={e => setProdForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
                </Campo>

                <SecaoForm titulo="Preço" />
                {verCusto && (
                  <Campo rotulo="Preço de Custo">
                    <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={prodForm.preco_custo} onChange={e => setProdForm(f => ({ ...f, preco_custo: e.target.value }))} />
                  </Campo>
                )}
                <Campo rotulo="Preço de Venda *">
                  <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={prodForm.preco_venda} onChange={e => setProdForm(f => ({ ...f, preco_venda: e.target.value }))} />
                </Campo>
                {verCusto && (
                  <Campo rotulo="Margem">
                    <div className="input campo-calculado">{margem || 'Informe custo e venda'}</div>
                  </Campo>
                )}

                <SecaoForm titulo="Estoque" />
                <Campo rotulo="Estoque Atual">
                  <input className="input" type="number" min={0} placeholder="0" value={prodForm.estoque_atual} onChange={e => setProdForm(f => ({ ...f, estoque_atual: e.target.value }))} />
                </Campo>
                {controlaEstoqueMinimo && (
                  <>
                    <Campo rotulo="Estoque Mínimo">
                      <input className="input" type="number" min={0} placeholder="5" value={prodForm.estoque_minimo} onChange={e => setProdForm(f => ({ ...f, estoque_minimo: e.target.value }))} />
                    </Campo>
                    <Campo rotulo="Estoque Máximo">
                      <input className="input" type="number" min={0} placeholder="opcional" value={prodForm.estoque_maximo} onChange={e => setProdForm(f => ({ ...f, estoque_maximo: e.target.value }))} />
                    </Campo>
                  </>
                )}
              </FormGrade>
            </ModalFormulario>
          )
        })()}
      </AnimatePresence>

      {/* Cadastro / edição de serviço */}
      <AnimatePresence>
        {showServModal && (
          <ModalFormulario
            icone={<Scissors size={18} />}
            titulo={editServId ? 'Editar Serviço' : 'Novo Serviço'}
            descricao={editServId ? servicos.find(s => s.id === editServId)?.nome : 'Nome e preço são obrigatórios (ou marque "Valor definido na venda").'}
            onClose={fecharModalServ}
            onSalvar={handleSaveServ}
            salvando={saving}
            rotuloSalvar={editServId ? 'Salvar' : 'Cadastrar'}
            erro={error}
          >
            <FormGrade>
              <Campo rotulo="Nome *" span={2}>
                <input className="input" placeholder="Nome do serviço" value={servForm.nome} onChange={e => setServForm(f => ({ ...f, nome: e.target.value }))} />
              </Campo>
              <Campo rotulo="Categoria">
                <input className="input" placeholder="Ex: Cabelo, Barba..." value={servForm.categoria} onChange={e => setServForm(f => ({ ...f, categoria: e.target.value }))} />
              </Campo>
              <Campo rotulo={servForm.preco_na_venda ? 'Preço de referência' : 'Preço *'}>
                <input className="input" type="number" min={0} step={0.01} placeholder={servForm.preco_na_venda ? 'opcional' : '0,00'} value={servForm.preco} onChange={e => setServForm(f => ({ ...f, preco: e.target.value }))} />
              </Campo>
              <Campo rotulo="Duração (min)">
                <input className="input" type="number" min={5} step={5} placeholder="30" value={servForm.duracao_minutos} onChange={e => setServForm(f => ({ ...f, duracao_minutos: e.target.value }))} />
              </Campo>
              <Campo rotulo="Comissão (%)">
                <input className="input" type="number" min={0} max={100} placeholder="usa a do profissional" value={servForm.comissao_percentual} onChange={e => setServForm(f => ({ ...f, comissao_percentual: e.target.value }))} />
              </Campo>
              <div className="field span-total">
                <label className="check-rotulo" title="O agendamento fica sem valor e o valor é informado na hora da venda">
                  <input type="checkbox" checked={servForm.preco_na_venda} onChange={e => setServForm(f => ({ ...f, preco_na_venda: e.target.checked }))} />
                  Valor definido na venda (o preço é decidido na hora de vender)
                </label>
              </div>
              <Campo rotulo="Descrição" span="total">
                <textarea className="input textarea" style={{ minHeight: '64px' }} placeholder="opcional" value={servForm.descricao} onChange={e => setServForm(f => ({ ...f, descricao: e.target.value }))} />
              </Campo>
              {profissionais.length > 0 && (
                <Campo rotulo={`Profissionais que fazem (${servForm.profissional_ids.length} de ${profissionais.length})`} span="total">
                  <div className="opcoes-grade">
                    {profissionais.map(p => {
                      const checked = servForm.profissional_ids.includes(p.id)
                      return (
                        <button key={p.id} type="button" className={`opcao${checked ? ' marcada' : ''}`} onClick={() => toggleProfissional(p.id)} aria-pressed={checked}>
                          <span className="opcao-caixa">{checked && <Check size={10} strokeWidth={3} />}</span>
                          <span style={{ minWidth: 0 }}>
                            <span className="texto-cortado" style={{ display: 'block', fontSize: '13px', color: 'var(--c-fff)' }}>{p.nome}</span>
                            <span className="texto-cortado" style={{ display: 'block', fontSize: '11px', color: 'var(--c-55)' }}>{p.especialidade}{p.ativo ? '' : ' · inativo'}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </Campo>
              )}
            </FormGrade>
          </ModalFormulario>
        )}
      </AnimatePresence>

      {/* Cards de visualização */}
      <AnimatePresence>
        {produtoAberto && (
          <ProdutoDetalheModal
            key={produtoAberto.id}
            produto={produtoAberto}
            verCusto={verCusto}
            podeEditar={podeEditar}
            onClose={() => setProdutoAbertoId(null)}
            onEditar={() => { setProdutoAbertoId(null); abrirEdicaoProd(produtoAberto) }}
            onFotos={() => { setProdutoAbertoId(null); setProdutoFotosAlvo(produtoAberto) }}
            onEtiqueta={() => { setProdutoAbertoId(null); setProdutosEtiqueta([produtoAberto]) }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {servicoAberto && (
          <ServicoDetalheModal
            key={servicoAberto.id}
            servico={servicoAberto}
            podeEditar={podeEditar}
            onClose={() => setServicoAbertoId(null)}
            onEditar={() => { setServicoAbertoId(null); abrirEdicaoServ(servicoAberto) }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {produtosEtiqueta && (
          <EtiquetaModal
            produtos={produtosEtiqueta}
            onClose={() => { setProdutosEtiqueta(null); selecao.limpar() }}
            onSkuGerado={(id, sku) => {
              setProdutos(prev => prev.map(x => x.id === id ? { ...x, sku } : x))
              setProdutosEtiqueta(prev => prev ? prev.map(x => x.id === id ? { ...x, sku } : x) : prev)
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEntrada && (
          <EntradaProdutosModal
            produtos={produtos}
            onClose={() => setShowEntrada(false)}
            onSuccess={carregarProdutos}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {produtoFotosAlvo && (
          <ProdutoFotosModal
            produto={produtoFotosAlvo}
            onClose={() => setProdutoFotosAlvo(null)}
            onChange={carregarProdutos}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
