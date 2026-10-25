import { useState, useEffect, useRef, type ChangeEvent, type ReactNode } from 'react'
import { Save, Upload, Trash2, ImageIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { usePerfil } from '../hooks/usePerfil'
import { usePermissoes } from '../hooks/usePermissoes'
import { useLoja } from '../hooks/useLoja'
import type { Configuracoes as ConfigRow } from '../types'

const TAMANHO_MAX_ARQUIVO = 5 * 1024 * 1024
const CORES_LOJA = ['#2563eb', '#0ea5e9', '#10b981', '#16a34a', '#f59e0b', '#ea580c', '#dc2626', '#db2777', '#7c3aed', '#a16207']

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
  const [aba, setAba] = useState<(typeof ABAS_CONFIG)[number]>('Loja')

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
      agendamento_confirmado: form.agendamento_confirmado ?? false,
      estoque_zerado: form.estoque_zerado ?? 'avisar',
      caixa_valor_inicial: Math.max(0, Number(form.caixa_valor_inicial) || 0),
      cor_destaque: form.cor_destaque || null,
      permitir_fiado: form.permitir_fiado ?? true,
      fiado_prazo_dias: Math.min(365, Math.max(0, Math.round(Number(form.fiado_prazo_dias ?? 30)))),
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

  const set = <K extends keyof ConfigRow>(campo: K, valor: ConfigRow[K]) => setForm(f => ({ ...f, [campo]: valor }))

  return (
    <div className="page" style={{ maxWidth: '820px' }}>
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', color: 'var(--c-fff)' }}>Configurações</h1>
          {!podeEditar && <p style={{ fontSize: '12px', color: 'var(--c-55)', marginTop: '2px' }}>Somente leitura</p>}
        </div>
        {podeEditar && (
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={13} /> {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
          </button>
        )}
      </div>
      {error && <p className="aviso-erro" style={{ marginBottom: '12px' }}>{error}</p>}

      <div className="perm-abas" role="tablist" style={{ marginBottom: '12px' }}>
        {ABAS_CONFIG.map(a => (
          <button key={a} role="tab" aria-selected={aba === a} className={`perm-aba${aba === a ? ' ativa' : ''}`} onClick={() => setAba(a)}>{a}</button>
        ))}
      </div>

      <fieldset disabled={!podeEditar} className="cfg-lista">
        {aba === 'Loja' && (<>
          <Linha rotulo="Logo" ajuda="Quadrado, de preferência com fundo transparente">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="cfg-logo">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo da loja" />
                  : <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Logo padrão" className="logo-padrao" style={{ opacity: 0.35 }} />}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => logoInputRef.current?.click()} disabled={processandoLogo} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {form.logo_url ? <ImageIcon size={12} /> : <Upload size={12} />}
                {processandoLogo ? 'Preparando...' : form.logo_url ? 'Trocar' : 'Enviar'}
              </button>
              {form.logo_url && (
                <button type="button" className="btn btn-icon" title="Remover logo" aria-label="Remover logo" onClick={() => set('logo_url', '')} style={{ width: '30px', height: '30px' }}>
                  <Trash2 size={12} />
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={escolherLogo} style={{ display: 'none' }} />
            </div>
          </Linha>
          <Linha rotulo="Cor da loja" ajuda="Botões principais e destaques">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button type="button" className={`cor-amostra${!form.cor_destaque ? ' ativa' : ''}`} title="Padrão do tema" onClick={() => set('cor_destaque', null)} style={{ background: 'linear-gradient(135deg, #fff 50%, #111 50%)' }} />
              {CORES_LOJA.map(c => (
                <button key={c} type="button" className={`cor-amostra${form.cor_destaque === c ? ' ativa' : ''}`} title={c} onClick={() => set('cor_destaque', c)} style={{ background: c }} />
              ))}
              <input type="color" aria-label="Outra cor" value={form.cor_destaque || '#2563eb'} onChange={e => set('cor_destaque', e.target.value)} className="cfg-cor-livre" />
            </div>
          </Linha>
          <Linha rotulo="Nome da loja">
            <input className="input cfg-input" style={{ width: '260px' }} value={form.nome_empresa ?? ''} onChange={e => set('nome_empresa', e.target.value)} />
          </Linha>
          <Linha rotulo="CNPJ">
            <input className="input cfg-input" style={{ width: '200px' }} value={form.cnpj ?? ''} onChange={e => set('cnpj', e.target.value)} />
          </Linha>
          <Linha rotulo="Telefone">
            <input className="input cfg-input" style={{ width: '200px' }} value={form.telefone ?? ''} onChange={e => set('telefone', e.target.value)} />
          </Linha>
          <Linha rotulo="Endereço">
            <input className="input cfg-input" style={{ width: '320px' }} value={form.endereco ?? ''} onChange={e => set('endereco', e.target.value)} />
          </Linha>
        </>)}

        {aba === 'Agenda' && (<>
          <Linha rotulo="Horário de funcionamento">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input className="input cfg-input" type="time" style={{ width: '110px' }} value={form.horario_abertura ?? ''} onChange={e => set('horario_abertura', e.target.value)} />
              <span style={{ fontSize: '12px', color: 'var(--c-55)' }}>às</span>
              <input className="input cfg-input" type="time" style={{ width: '110px' }} value={form.horario_fechamento ?? ''} onChange={e => set('horario_fechamento', e.target.value)} />
            </div>
          </Linha>
          <Linha rotulo="Duração padrão do serviço" ajuda="Em minutos">
            <input className="input cfg-input" type="number" min={5} style={{ width: '90px' }} value={form.duracao_padrao_min ?? ''} onChange={e => set('duracao_padrao_min', Number(e.target.value))} />
          </Linha>
          <Linha rotulo="Tolerância de atraso" ajuda="Em minutos">
            <input className="input cfg-input" type="number" min={0} style={{ width: '90px' }} value={form.tolerancia_atraso_min ?? ''} onChange={e => set('tolerancia_atraso_min', Number(e.target.value))} />
          </Linha>
          <Linha rotulo="Agendamento já entra confirmado" ajuda="Sem precisar confirmar depois">
            <Chave checked={form.agendamento_confirmado ?? false} onChange={v => set('agendamento_confirmado', v)} />
          </Linha>
          <Linha rotulo="Regras de cancelamento">
            <input className="input cfg-input" style={{ width: '320px' }} placeholder="Ex: até 2h antes" value={form.regras_cancelamento ?? ''} onChange={e => set('regras_cancelamento', e.target.value)} />
          </Linha>
        </>)}

        {aba === 'Caixa' && (<>
          <Linha rotulo="Valor de abertura (troco)" ajuda="Já vem preenchido ao abrir o caixa">
            <input className="input cfg-input" type="number" min={0} step={0.01} placeholder="0,00" style={{ width: '120px' }} value={form.caixa_valor_inicial ?? ''} onChange={e => set('caixa_valor_inicial', e.target.value === '' ? 0 : Number(e.target.value))} />
          </Linha>
          <Linha rotulo="Fechar sozinho no horário de fechamento" ajuda={`Fecha às ${form.horario_fechamento?.slice(0, 5) || '—'} com o valor contado em branco`}>
            <Chave checked={form.fechamento_automatico ?? true} onChange={v => set('fechamento_automatico', v)} />
          </Linha>
        </>)}

        {aba === 'Vendas e estoque' && (<>
          <Linha rotulo="Vender produto sem estoque">
            <select className="input cfg-input" style={{ width: '230px' }} value={form.estoque_zerado ?? 'avisar'} onChange={e => set('estoque_zerado', e.target.value as 'permitir' | 'avisar' | 'bloquear')}>
              <option value="avisar">Avisar e deixar vender</option>
              <option value="permitir">Permitir sem avisar</option>
              <option value="bloquear">Bloquear</option>
            </select>
          </Linha>
          <Linha rotulo="Estoque mínimo e máximo" ajuda="Campos no produto e avisos de estoque baixo">
            <Chave checked={form.controla_estoque_minimo ?? true} onChange={v => set('controla_estoque_minimo', v)} />
          </Linha>
          <Linha rotulo="Aceitar fiado" ajuda="Vira conta a receber no nome do cliente">
            <Chave checked={form.permitir_fiado ?? true} onChange={v => set('permitir_fiado', v)} />
          </Linha>
          {(form.permitir_fiado ?? true) && (
            <Linha rotulo="Prazo do fiado" ajuda="Dias para o cliente pagar">
              <input className="input cfg-input" type="number" min={0} max={365} style={{ width: '90px' }} value={form.fiado_prazo_dias ?? 30} onChange={e => set('fiado_prazo_dias', Number(e.target.value))} />
            </Linha>
          )}
          <Linha rotulo="Maquininhas, taxas e parcelas">
            <Link to="/categorias?secao=maquininhas" className="btn btn-secondary btn-sm" style={{ color: 'var(--text)', textDecoration: 'none' }}>Abrir</Link>
          </Linha>
        </>)}
      </fieldset>
    </div>
  )
}

const ABAS_CONFIG = ['Loja', 'Agenda', 'Caixa', 'Vendas e estoque'] as const

/** Uma configuração: nome (e uma linha de ajuda) à esquerda, controle à direita. */
function Linha({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: ReactNode }) {
  return (
    <div className="cfg-linha">
      <div style={{ minWidth: 0 }}>
        <p className="cfg-rotulo">{rotulo}</p>
        {ajuda && <p className="cfg-ajuda">{ajuda}</p>}
      </div>
      <div className="cfg-controle">{children}</div>
    </div>
  )
}

/** Liga/desliga. */
function Chave({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="cfg-chave">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span />
    </label>
  )
}
