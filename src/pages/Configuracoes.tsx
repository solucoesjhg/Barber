import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { Save, Upload, Trash2, ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../hooks/usePerfil'
import { usePermissoes } from '../hooks/usePermissoes'
import { useLoja } from '../hooks/useLoja'
import type { Configuracoes as ConfigRow } from '../types'

const TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024
const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Campos de % da tela: '' = sem taxa. Chaves: pix, debito, c1..c12. */
type TaxasForm = Record<string, string>

/**
 * Reduz a imagem do logo (máx. 256px no lado maior) e devolve em data
 * URL, que fica gravada em configuracoes.logo_url — sem depender de
 * Storage. WebP quando o navegador gera (bem menor); senão PNG, que
 * mantém o fundo transparente.
 */
function prepararLogo(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    leitor.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'))
      img.onload = () => {
        const lado = 256
        const escala = Math.min(1, lado / Math.max(img.width || lado, img.height || lado))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round((img.width || lado) * escala))
        canvas.height = Math.max(1, Math.round((img.height || lado) * escala))
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Não foi possível processar a imagem.')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const webp = canvas.toDataURL('image/webp', 0.9)
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png'))
      }
      img.src = leitor.result as string
    }
    leitor.readAsDataURL(arquivo)
  })
}

export default function Configuracoes() {
  const { empresaId, loading: perfilLoading } = usePerfil()
  const { podeEditar: podeEditarTela } = usePermissoes()
  const { recarregar: recarregarLoja } = useLoja()
  const podeEditar = podeEditarTela('configuracoes')
  const [form, setForm] = useState<Partial<ConfigRow>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [processandoLogo, setProcessandoLogo] = useState(false)
  const [taxas, setTaxas] = useState<TaxasForm>({})
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function escolherLogo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) { setError('Escolha um arquivo de imagem (PNG, JPG, WebP ou SVG).'); return }
    if (arquivo.size > TAMANHO_MAX_ARQUIVO) { setError('A imagem é muito grande (máximo 5 MB).'); return }
    setProcessandoLogo(true); setError('')
    try {
      const logo = await prepararLogo(arquivo)
      setForm(f => ({ ...f, logo_url: logo }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível usar essa imagem.')
    }
    setProcessandoLogo(false)
  }

  useEffect(() => {
    if (!empresaId) { setLoading(false); return }
    supabase.from('configuracoes').select('*').eq('empresa_id', empresaId).single()
      .then(({ data }) => { if (data) setForm(data as ConfigRow); setLoading(false) })
    supabase.from('taxas_pagamento').select('forma_pagamento, parcelas, percentual')
      .then(({ data }) => {
        const t: TaxasForm = {}
        for (const l of (data ?? []) as { forma_pagamento: string; parcelas: number; percentual: number }[]) {
          const chave = l.forma_pagamento === 'credito' ? `c${l.parcelas}` : l.forma_pagamento
          t[chave] = Number(l.percentual) > 0 ? String(Number(l.percentual)) : ''
        }
        setTaxas(t)
      })
  }, [empresaId])

  function campoTaxa(chave: string, rotulo: string) {
    return (
      <div className="field" key={chave}>
        <label className="label">{rotulo}</label>
        <input
          className="input" type="number" min={0} max={99} step={0.01} placeholder="0"
          value={taxas[chave] ?? ''}
          onChange={e => setTaxas(t => ({ ...t, [chave]: e.target.value }))}
        />
      </div>
    )
  }

  async function handleSave() {
    if (!empresaId) return
    setSaving(true); setError(''); setSaved(false)
    const { error: err } = await supabase.from('configuracoes').update({
      nome_empresa: form.nome_empresa,
      logo_url: form.logo_url || null,
      cnpj: form.cnpj || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      horario_abertura: form.horario_abertura,
      horario_fechamento: form.horario_fechamento,
      duracao_padrao_min: Number(form.duracao_padrao_min) || 30,
      tolerancia_atraso_min: Number(form.tolerancia_atraso_min) || 10,
      regras_cancelamento: form.regras_cancelamento || null,
      fechamento_automatico: form.fechamento_automatico ?? true,
      comissao_desconta_taxa: form.comissao_desconta_taxa ?? true,
      parcelas_maximas: Number(form.parcelas_maximas) || 12,
      updated_at: new Date().toISOString(),
    }).eq('empresa_id', empresaId)
    if (err) { setSaving(false); setError(err.message); return }

    const linhas = [
      { forma_pagamento: 'pix', parcelas: 1, chave: 'pix' },
      { forma_pagamento: 'debito', parcelas: 1, chave: 'debito' },
      ...PARCELAS.map(n => ({ forma_pagamento: 'credito', parcelas: n, chave: `c${n}` })),
    ].map(({ chave, ...l }) => ({ ...l, empresa_id: empresaId, percentual: Number(String(taxas[chave] ?? '').replace(',', '.')) || 0, updated_at: new Date().toISOString() }))
    const invalida = linhas.find(l => l.percentual < 0 || l.percentual >= 100)
    if (invalida) { setSaving(false); setError('As taxas precisam ficar entre 0% e 99,99%.'); return }
    const { error: errTaxas } = await supabase.from('taxas_pagamento').upsert(linhas, { onConflict: 'empresa_id,forma_pagamento,parcelas' })
    setSaving(false)
    if (errTaxas) {
      setError(/taxas_pagamento/.test(errTaxas.message)
        ? 'As taxas ainda não estão ativas no banco de dados. Peça para rodar a atualização do banco (migração 20261024000001) no Supabase.'
        : errTaxas.message)
      return
    }
    // Nome e logo do topo do menu atualizam na hora.
    recarregarLoja()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading || perfilLoading) {
    return <div className="page"><p style={{ color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</p></div>
  }

  if (!empresaId) {
    return (
      <div className="page">
        <p style={{ color: 'var(--c-44)', fontSize: '13px' }}>Sua conta não está vinculada a nenhuma loja, então não há configurações pra mostrar.</p>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: '640px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>Configurações</h1>
        <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>
          {podeEditar ? 'Dados da empresa e regras de operação' : 'Dados da empresa e regras de operação · somente leitura'}
        </p>
      </div>

      <fieldset disabled={!podeEditar} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '16px' }}>Empresa</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="field">
            <label className="label">Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div className="logo-preview">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo da loja" />
                  : <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo padrão" className="logo-padrao" style={{ opacity: 0.35 }} />}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '12px', color: 'var(--c-77)', lineHeight: 1.5 }}>
                  {form.logo_url ? 'Aparece no topo do menu, ao lado do nome da loja.' : 'Sem logo próprio: o menu mostra o logo padrão.'}
                  {' '}Use uma imagem quadrada, de preferência com fundo transparente.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => logoInputRef.current?.click()} disabled={processandoLogo} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {form.logo_url ? <ImageIcon size={13} /> : <Upload size={13} />}
                    {processandoLogo ? 'Preparando...' : form.logo_url ? 'Trocar logo' : 'Enviar logo'}
                  </button>
                  {form.logo_url && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, logo_url: '' }))} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Trash2 size={13} /> Remover
                    </button>
                  )}
                </div>
              </div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={escolherLogo} style={{ display: 'none' }} />
            </div>
          </div>
          <div className="field">
            <label className="label">Nome da loja</label>
            <input className="input" value={form.nome_empresa ?? ''} placeholder="Aparece no topo do menu" onChange={e => setForm(f => ({ ...f, nome_empresa: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="label">CNPJ</label>
              <input className="input" value={form.cnpj ?? ''} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Telefone</label>
              <input className="input" value={form.telefone ?? ''} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="label">Endereço</label>
            <input className="input" value={form.endereco ?? ''} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
          </div>
        </div>
      </motion.div>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '16px' }}>Operação</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="label">Abertura</label>
              <input className="input" type="time" value={form.horario_abertura ?? ''} onChange={e => setForm(f => ({ ...f, horario_abertura: e.target.value }))} />
            </div>
            <div className="field">
              <label className="label">Fechamento</label>
              <input className="input" type="time" value={form.horario_fechamento ?? ''} onChange={e => setForm(f => ({ ...f, horario_fechamento: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="field">
              <label className="label">Duração padrão do serviço (min)</label>
              <input className="input" type="number" min={5} value={form.duracao_padrao_min ?? ''} onChange={e => setForm(f => ({ ...f, duracao_padrao_min: Number(e.target.value) }))} />
            </div>
            <div className="field">
              <label className="label">Tolerância de atraso (min)</label>
              <input className="input" type="number" min={0} value={form.tolerancia_atraso_min ?? ''} onChange={e => setForm(f => ({ ...f, tolerancia_atraso_min: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="field">
            <label className="label">Regras de cancelamento</label>
            <input className="input" placeholder="Ex: cancelamento com até 2h de antecedência" value={form.regras_cancelamento ?? ''} onChange={e => setForm(f => ({ ...f, regras_cancelamento: e.target.value }))} />
          </div>
          <label className="check-rotulo" title="O caixa que ficar aberto fecha sozinho no horário de fechamento">
            <input type="checkbox" checked={form.fechamento_automatico ?? true} onChange={e => setForm(f => ({ ...f, fechamento_automatico: e.target.checked }))} />
            Fechar o caixa automaticamente no horário de fechamento
          </label>
          <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5, marginTop: '-6px' }}>
            Quem esquecer o caixa aberto tem ele fechado às {form.horario_fechamento?.slice(0, 5) || 'horário de fechamento'}, com o saldo esperado calculado e o valor contado em branco. Caixa aberto depois desse horário fecha no dia seguinte.
          </p>
        </div>
      </motion.div>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '6px' }}>Taxas da maquininha (%)</p>
        <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5, marginBottom: '16px' }}>
          O cliente paga o valor da venda; a taxa sai do que a loja recebe. Na venda aparecem a taxa e o líquido, e a taxa entra no Financeiro e na DRE. Deixe em branco o que não tem taxa.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {campoTaxa('pix', 'Pix')}
            {campoTaxa('debito', 'Cartão Débito')}
          </div>
          <div>
            <p className="label" style={{ marginBottom: '8px' }}>Cartão Crédito, por parcelas</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '10px' }}>
              {PARCELAS.map(n => campoTaxa(`c${n}`, n === 1 ? '1x (à vista)' : `${n}x`))}
            </div>
          </div>
          <div className="field">
            <label className="label">Parcelamento máximo no crédito</label>
            <select className="input" value={form.parcelas_maximas ?? 12} onChange={e => setForm(f => ({ ...f, parcelas_maximas: Number(e.target.value) }))}>
              {PARCELAS.map(n => <option key={n} value={n}>{n === 1 ? 'Só à vista (1x)' : `Até ${n}x`}</option>)}
            </select>
          </div>
          <label className="check-rotulo" title="A base da comissão de cada item fica sem a parte da taxa">
            <input type="checkbox" checked={form.comissao_desconta_taxa ?? true} onChange={e => setForm(f => ({ ...f, comissao_desconta_taxa: e.target.checked }))} />
            Descontar a taxa da comissão do profissional
          </label>
          <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5, marginTop: '-6px' }}>
            Ex.: corte de R$ 40,00 no crédito 3x com taxa de 5%: a comissão de 50% é calculada sobre R$ 38,00 (R$ 19,00). Desmarcado, é sobre R$ 40,00 (R$ 20,00). Vale para as vendas novas.
          </p>
        </div>
      </motion.div>

      </fieldset>

      {error && <p style={{ fontSize: '12px', color: 'var(--c-66)', marginBottom: '12px' }}>{error}</p>}
      {podeEditar && (
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Save size={14} /> {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </button>
      )}
    </div>
  )
}
