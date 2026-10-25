import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { carregarMaquininhas, carregarTaxas, type RepassePadrao } from '../lib/taxas'

const PARCELAS = Array.from({ length: 12 }, (_, i) => i + 1)

/** Campos de % da tela: '' = sem taxa. Chaves: pix, debito, c1..c12. */
type TaxasForm = Record<string, string>

/** Maquininha na tela: id ausente = nova (ainda não salva). */
interface MaqForm { chave: string; id?: string; nome: string; ativo: boolean; taxas: TaxasForm; aberta: boolean; diasDebito: string; diasCredito: string }

const LINHAS_TAXA = [
  { forma_pagamento: 'pix', parcelas: 1, chave: 'pix' },
  { forma_pagamento: 'debito', parcelas: 1, chave: 'debito' },
  ...PARCELAS.map(n => ({ forma_pagamento: 'credito', parcelas: n, chave: `c${n}` })),
]
const pctTexto = (v: number) => (v > 0 ? String(v) : '')

/**
 * Maquininhas da loja (cada uma com as taxas dela) e as opções de
 * pagamento: parcelamento máximo, repasse da taxa ao cliente e se a taxa
 * sai da comissão. Fica em Categorias & Pagamentos → Maquininhas.
 */
export default function MaquininhasEditor({ podeEditar }: { podeEditar: boolean }) {
  const [maquininhas, setMaquininhas] = useState<MaqForm[]>([])
  const [removidas, setRemovidas] = useState<string[]>([])
  const [opcoes, setOpcoes] = useState({ parcelasMaximas: 12, descontaComissao: true, repasse: 'nunca' as RepassePadrao })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  // Prazo de depósito (recebíveis do cartão): só depois da migração.
  const [temDias, setTemDias] = useState(false)

  useEffect(() => {
    Promise.all([
      carregarMaquininhas(true), carregarTaxas(),
      supabase.from('maquininhas').select('id, dias_debito, dias_credito'),
    ]).then(([lista, t, { data: dias, error: erroDias }]) => {
      setTemDias(!erroDias)
      const prazo = new Map(((dias ?? []) as { id: string; dias_debito: number; dias_credito: number }[]).map(d => [d.id, d]))
      setMaquininhas(lista.map(m => ({
        chave: m.id, id: m.id, nome: m.nome, ativo: m.ativo, aberta: false,
        diasDebito: String(prazo.get(m.id)?.dias_debito ?? 1), diasCredito: String(prazo.get(m.id)?.dias_credito ?? 30),
        taxas: { pix: pctTexto(m.pix), debito: pctTexto(m.debito), ...Object.fromEntries(PARCELAS.map(n => [`c${n}`, pctTexto(m.credito[n] ?? 0)])) },
      })))
      setRemovidas([])
      setOpcoes({ parcelasMaximas: t.parcelasMaximas, descontaComissao: t.descontaComissao, repasse: t.repassePadrao })
      setLoading(false)
    })
  }, [])

  const mudarMaq = (chave: string, mudanca: Partial<MaqForm>) =>
    setMaquininhas(ms => ms.map(m => (m.chave === chave ? { ...m, ...mudanca } : m)))

  function novaMaquininha() {
    const chave = `nova-${Date.now()}`
    setMaquininhas(ms => [...ms, { chave, nome: '', ativo: true, aberta: true, taxas: {}, diasDebito: '1', diasCredito: '30' }])
  }

  function removerMaquininha(m: MaqForm) {
    if (!window.confirm(`Excluir a maquininha "${m.nome || 'sem nome'}"? As vendas já feitas nela continuam com a taxa que tinham. Para só parar de usar, desmarque "Ativa".`)) return
    if (m.id) setRemovidas(r => [...r, m.id!])
    setMaquininhas(ms => ms.filter(x => x.chave !== m.chave))
  }

  function campoTaxa(m: MaqForm, chave: string, rotulo: string) {
    return (
      <div className="field" key={chave}>
        <label className="label">{rotulo}</label>
        <input
          className="input" type="number" min={0} max={99} step={0.01} placeholder="0"
          value={m.taxas[chave] ?? ''}
          onChange={e => mudarMaq(m.chave, { taxas: { ...m.taxas, [chave]: e.target.value } })}
        />
      </div>
    )
  }

  // Grava as maquininhas e as taxas de cada uma. Devolve a mensagem de erro, se houver.
  async function salvarMaquininhas(): Promise<string> {
    const nomes = maquininhas.map(m => m.nome.trim().toLowerCase())
    if (nomes.some(n => !n)) return 'Dê um nome para cada maquininha.'
    if (new Set(nomes).size !== nomes.length) return 'Há duas maquininhas com o mesmo nome.'
    const pct = (m: MaqForm, chave: string) => Number(String(m.taxas[chave] ?? '').replace(',', '.')) || 0
    if (maquininhas.some(m => LINHAS_TAXA.some(l => pct(m, l.chave) < 0 || pct(m, l.chave) >= 100))) return 'As taxas precisam ficar entre 0% e 99,99%.'

    const dias = (t: string, padrao: number) => Math.min(60, Math.max(0, Math.round(Number(t)))) || (t.trim() === '0' ? 0 : padrao)
    const prazos = (m: MaqForm) => (temDias ? { dias_debito: dias(m.diasDebito, 1), dias_credito: dias(m.diasCredito, 30) } : {})

    if (removidas.length > 0) {
      const { error: e } = await supabase.from('maquininhas').delete().in('id', removidas)
      if (e) return e.message
    }
    const linhas: { maquininha_id: string; forma_pagamento: string; parcelas: number; percentual: number }[] = []
    const salvas: MaqForm[] = []
    for (const m of maquininhas) {
      let id = m.id
      if (id) {
        const { error: e } = await supabase.from('maquininhas').update({ nome: m.nome.trim(), ativo: m.ativo, ...prazos(m) }).eq('id', id)
        if (e) return e.message
      } else {
        const { data, error: e } = await supabase.from('maquininhas').insert({ nome: m.nome.trim(), ativo: m.ativo, ...prazos(m) }).select('id').single()
        if (e || !data) return e?.message ?? 'Não foi possível cadastrar a maquininha.'
        id = (data as { id: string }).id
      }
      salvas.push({ ...m, id, chave: id })
      for (const l of LINHAS_TAXA) linhas.push({ maquininha_id: id, forma_pagamento: l.forma_pagamento, parcelas: l.parcelas, percentual: pct(m, l.chave) })
    }
    if (linhas.length > 0) {
      const { error: e } = await supabase.from('taxas_maquininha').upsert(linhas, { onConflict: 'maquininha_id,forma_pagamento,parcelas' })
      if (e) return e.message
    }
    setMaquininhas(salvas)
    setRemovidas([])
    return ''
  }

  async function salvar() {
    if (saving) return
    setSaving(true); setError(''); setSaved(false)
    const erroMaq = await salvarMaquininhas()
    if (erroMaq) { setSaving(false); setError(erroMaq); return }
    const { error: e } = await supabase.rpc('salvar_opcoes_pagamento', {
      p_parcelas_maximas: opcoes.parcelasMaximas, p_desconta_comissao: opcoes.descontaComissao, p_repasse_padrao: opcoes.repasse,
    })
    setSaving(false)
    if (e) { setError(e.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>

  return (
    <div style={{ maxWidth: '680px' }}>
      <fieldset disabled={!podeEditar} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--c-fff)' }}>Maquininhas e taxas (%)</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={novaMaquininha} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={13} /> Nova maquininha
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5, marginBottom: '16px' }}>
          Cadastre cada maquininha com as taxas dela. Na venda no cartão escolhe-se a maquininha e a taxa vem dela; a taxa entra no Financeiro e na DRE. Deixe em branco o que não tem taxa.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {maquininhas.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--c-55)', padding: '12px', border: '1px dashed var(--c-2a)', borderRadius: '8px', textAlign: 'center' }}>
              Nenhuma maquininha cadastrada: as vendas no cartão ficam sem taxa.
            </p>
          )}
          {maquininhas.map(m => (
            <div key={m.chave} className="maquininha-card" style={{ border: '1px solid var(--c-25)', borderRadius: '10px', padding: '12px 14px', opacity: m.ativo ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  className="input" placeholder="Nome (ex.: Stone, Cielo)" value={m.nome}
                  onChange={e => mudarMaq(m.chave, { nome: e.target.value })}
                  style={{ flex: '1 1 180px' }} aria-label="Nome da maquininha"
                />
                <label className="check-rotulo" title="Só as ativas aparecem na venda">
                  <input type="checkbox" checked={m.ativo} onChange={e => mudarMaq(m.chave, { ativo: e.target.checked })} />
                  Ativa
                </label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => mudarMaq(m.chave, { aberta: !m.aberta })}>
                  {m.aberta ? 'Fechar taxas' : 'Ver taxas'}
                </button>
                <button type="button" className="btn btn-icon" title="Excluir maquininha" aria-label="Excluir maquininha" onClick={() => removerMaquininha(m)} style={{ width: '30px', height: '30px' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              {!m.aberta && (
                <p style={{ fontSize: '11px', color: 'var(--c-66)', marginTop: '8px' }}>
                  {[
                    m.taxas.pix && `Pix ${m.taxas.pix}%`,
                    m.taxas.debito && `Débito ${m.taxas.debito}%`,
                    ...PARCELAS.filter(n => m.taxas[`c${n}`]).map(n => `${n}x ${m.taxas[`c${n}`]}%`),
                  ].filter(Boolean).join(' · ') || 'Sem taxas cadastradas'}
                </p>
              )}
              {m.aberta && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {campoTaxa(m, 'pix', 'Pix')}
                    {campoTaxa(m, 'debito', 'Cartão Débito')}
                  </div>
                  {temDias && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div className="field">
                        <label className="label">Débito cai em (dias)</label>
                        <input className="input" type="number" min={0} max={60} value={m.diasDebito} onChange={e => mudarMaq(m.chave, { diasDebito: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="label">Crédito: 1ª parcela cai em (dias)</label>
                        <input className="input" type="number" min={0} max={60} value={m.diasCredito} onChange={e => mudarMaq(m.chave, { diasCredito: e.target.value })} />
                        <p className="campo-ajuda">As outras parcelas, mês a mês. Vai para os Recebíveis do cartão.</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="label" style={{ marginBottom: '8px' }}>Cartão Crédito, por parcelas</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '10px' }}>
                      {PARCELAS.map(n => campoTaxa(m, `c${n}`, n === 1 ? '1x (à vista)' : `${n}x`))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="field">
            <label className="label">Parcelamento máximo no crédito</label>
            <select className="input" value={opcoes.parcelasMaximas} onChange={e => setOpcoes(o => ({ ...o, parcelasMaximas: Number(e.target.value) }))}>
              {PARCELAS.map(n => <option key={n} value={n}>{n === 1 ? 'Só à vista (1x)' : `Até ${n}x`}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label">Repassar a taxa ao cliente</label>
            <select className="input" value={opcoes.repasse} onChange={e => setOpcoes(o => ({ ...o, repasse: e.target.value as RepassePadrao }))}>
              <option value="nunca">Não repassar (a loja paga a taxa)</option>
              <option value="credito_parcelado">Repassar no crédito parcelado (2x ou mais)</option>
              <option value="sempre">Sempre repassar (débito, crédito e Pix com taxa)</option>
            </select>
            <p className="campo-ajuda">
              É só a sugestão: na venda dá para marcar ou desmarcar. Com repasse, o cliente paga o valor com a taxa embutida e a loja recebe o valor cheio
              (ex.: R$ 100,00 com taxa de 4% → cliente paga R$ 104,17).
            </p>
          </div>
          <label className="check-rotulo" title="A base da comissão de cada item fica sem a parte da taxa">
            <input type="checkbox" checked={opcoes.descontaComissao} onChange={e => setOpcoes(o => ({ ...o, descontaComissao: e.target.checked }))} />
            Descontar a taxa da comissão do profissional
          </label>
          <p style={{ fontSize: '12px', color: 'var(--c-66)', lineHeight: 1.5, marginTop: '-6px' }}>
            Ex.: corte de R$ 40,00 no crédito 3x com taxa de 5%: a comissão de 50% é calculada sobre R$ 38,00 (R$ 19,00). Desmarcado, é sobre R$ 40,00 (R$ 20,00). Com a taxa repassada ao cliente, nada é descontado. Vale para as vendas novas.
          </p>
        </div>
      </motion.div>
      </fieldset>
      {error && <p className="aviso-erro" style={{ marginBottom: '12px' }}>{error}</p>}
      {podeEditar && (
        <button className="btn btn-primary" onClick={salvar} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Save size={14} /> {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar maquininhas'}
        </button>
      )}
    </div>
  )
}
