import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import { motion } from 'framer-motion'
import { Save, Upload, Trash2, ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { usePerfil } from '../hooks/usePerfil'
import { usePermissoes } from '../hooks/usePermissoes'
import { useLoja } from '../hooks/useLoja'
import type { Configuracoes as ConfigRow } from '../types'

const TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024

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
  }, [empresaId])


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
      controla_estoque_minimo: form.controla_estoque_minimo ?? true,
      updated_at: new Date().toISOString(),
    }).eq('empresa_id', empresaId)
    setSaving(false)
    if (err) { setError(err.message); return }
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

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '16px' }}>Estoque</p>
        <label className="check-rotulo" title="Mostra os campos de estoque mínimo e máximo e os alertas de estoque baixo">
          <input type="checkbox" checked={form.controla_estoque_minimo ?? true} onChange={e => setForm(f => ({ ...f, controla_estoque_minimo: e.target.checked }))} />
          Trabalhar com estoque mínimo e máximo
        </label>
        <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5, marginTop: '8px' }}>
          Marcado: o cadastro do produto tem estoque mínimo e máximo, e o sistema avisa quando o estoque fica abaixo do mínimo (Produtos, Vendas e Relatórios). Desmarcado: esses campos e avisos somem; os valores já cadastrados ficam guardados.
        </p>
      </motion.div>

      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)', marginBottom: '6px' }}>Maquininhas e taxas</p>
        <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5 }}>
          As maquininhas, as taxas, o parcelamento máximo e o repasse da taxa ao cliente ficam em{' '}
          <Link to="/categorias?secao=maquininhas" style={{ color: 'var(--c-a3)' }}>Categorias &amp; Pagamentos → Maquininhas</Link>.
        </p>
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
