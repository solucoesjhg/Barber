import { useEffect, useState } from 'react'
import { Printer, RotateCcw, ClipboardCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatCurrency, formatDate, formatDateTime } from '../../lib/utils'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../ui/ModalDetalhe'
import type { Comissao, FechamentoComissao, ValeProfissional } from '../../types'

const escapar = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/**
 * O "holerite" de um fechamento de comissão: as comissões pagas, os
 * vales descontados e o líquido. Dá para imprimir e, para quem gerencia
 * comissões, estornar (as comissões e os vales voltam a ficar em aberto).
 */
export default function HoleriteModal({ fechamentoId, podeEstornar, onClose, onEstornado }: {
  fechamentoId: string
  podeEstornar: boolean
  onClose: () => void
  onEstornado: () => void
}) {
  const [f, setF] = useState<FechamentoComissao | null>(null)
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [vales, setVales] = useState<ValeProfissional[]>([])
  const [saldo, setSaldo] = useState<ValeProfissional | null>(null)
  const [loading, setLoading] = useState(true)
  const [estornando, setEstornando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    Promise.all([
      supabase.from('fechamentos_comissao').select('*, profissional:profissionais(nome)').eq('id', fechamentoId).maybeSingle(),
      supabase.from('comissoes').select('id, valor_comissao, valor_base, percentual, created_at, comanda:comandas(cliente_nome), item:itens_comanda(nome, quantidade)')
        .eq('fechamento_id', fechamentoId).order('created_at'),
      supabase.from('vales_profissional').select('*').eq('fechamento_id', fechamentoId).order('data'),
      supabase.from('vales_profissional').select('*').eq('gerado_por_fechamento', fechamentoId).maybeSingle(),
    ]).then(([{ data: fd }, { data: cd }, { data: vd }, { data: sd }]) => {
      if (!ativo) return
      setF((fd ?? null) as FechamentoComissao | null)
      setComissoes((cd ?? []) as unknown as Comissao[])
      setVales((vd ?? []) as ValeProfissional[])
      setSaldo((sd ?? null) as ValeProfissional | null)
      setLoading(false)
    })
    return () => { ativo = false }
  }, [fechamentoId])

  async function estornar() {
    if (!f || estornando) return
    if (!window.confirm('Estornar este fechamento? As comissões e os vales voltam a ficar em aberto e o pagamento sai do financeiro.')) return
    setEstornando(true); setErro('')
    const { error } = await supabase.rpc('estornar_fechamento_comissao', { p_fechamento_id: f.id })
    setEstornando(false)
    if (error) { setErro(error.message); return }
    onEstornado()
  }

  function imprimir() {
    if (!f) return
    const nome = f.profissional?.nome ?? 'Profissional'
    const linhas = comissoes.map(c => `<tr><td>${formatDate(c.created_at.slice(0, 10))}</td><td>${escapar(c.comanda?.cliente_nome ?? 'Balcão')}</td><td>${escapar(c.item?.nome ?? '')}</td><td class="n">${formatCurrency(Number(c.valor_base))}</td><td class="n">${Number(c.percentual)}%</td><td class="n">${formatCurrency(Number(c.valor_comissao))}</td></tr>`).join('')
    const linhasVales = vales.map(v => `<tr><td>${formatDate(v.data)}</td><td colspan="4">${escapar(v.descricao ?? 'Vale')}</td><td class="n">− ${formatCurrency(Number(v.valor))}</td></tr>`).join('')
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comissão ${escapar(nome)}</title>
<style>body{font-family:system-ui,sans-serif;color:#111;margin:32px;font-size:12px}h1{font-size:18px;margin:0}p{margin:2px 0 14px;color:#555}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #ddd}th{font-size:10px;text-transform:uppercase;color:#666}
.n{text-align:right;white-space:nowrap}.tot td{font-weight:700;border-bottom:none}h2{font-size:12px;margin:18px 0 0;text-transform:uppercase;color:#444}
.assin{margin-top:60px;display:flex;gap:40px}.assin div{flex:1;border-top:1px solid #333;padding-top:4px;text-align:center}</style></head><body>
<h1>Fechamento de comissão — ${escapar(nome)}</h1>
<p>Período de ${formatDate(f.inicio)} a ${formatDate(f.fim)} · fechado em ${formatDateTime(f.created_at)}</p>
<h2>Comissões (${comissoes.length})</h2>
<table><tr><th>Data</th><th>Cliente</th><th>Item</th><th class="n">Base</th><th class="n">%</th><th class="n">Comissão</th></tr>${linhas}
<tr class="tot"><td colspan="5">Total de comissões</td><td class="n">${formatCurrency(Number(f.total_comissoes))}</td></tr></table>
${vales.length ? `<h2>Vales descontados</h2><table>${linhasVales}<tr class="tot"><td colspan="5">Total descontado</td><td class="n">− ${formatCurrency(Number(f.total_vales))}</td></tr></table>` : ''}
<table style="margin-top:18px"><tr class="tot"><td>Líquido pago</td><td class="n" style="font-size:15px">${formatCurrency(Number(f.valor_pago))}</td></tr>
${saldo ? `<tr><td>Vale que ficou para o próximo fechamento</td><td class="n">${formatCurrency(Number(saldo.valor))}</td></tr>` : ''}</table>
${f.observacao ? `<p style="margin-top:14px">Obs.: ${escapar(f.observacao)}</p>` : ''}
<div class="assin"><div>${escapar(nome)}</div><div>Responsável</div></div>
<script>window.onload=()=>{window.print()}</script></body></html>`
    const w = window.open('', '_blank')
    if (!w) { window.alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return }
    w.document.write(html)
    w.document.close()
  }

  return (
    <ModalDetalhe
      icone={<ClipboardCheck size={18} />}
      titulo={f ? `Comissão · ${f.profissional?.nome ?? ''}` : 'Fechamento'}
      subtitulo={f && <span>{formatDate(f.inicio)} a {formatDate(f.fim)} · fechado em {formatDateTime(f.created_at)}</span>}
      onClose={onClose}
      acoes={f ? (
        <>
          <button className="btn btn-primary" onClick={imprimir}><Printer size={13} /> Imprimir</button>
          {podeEstornar && (
            <button className="btn btn-secondary" onClick={estornar} disabled={estornando}><RotateCcw size={13} /> {estornando ? 'Estornando...' : 'Estornar'}</button>
          )}
        </>
      ) : undefined}
    >
      {loading ? (
        <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '32px 0', textAlign: 'center' }}>Carregando...</p>
      ) : !f ? (
        <p style={{ fontSize: '13px', color: 'var(--c-55)', padding: '32px 0', textAlign: 'center' }}>Fechamento não encontrado.</p>
      ) : (
        <>
          <InfoGrade>
            <Info rotulo="Comissões">{formatCurrency(Number(f.total_comissoes))}</Info>
            <Info rotulo="Vales descontados">{formatCurrency(Number(f.total_vales))}</Info>
            <Info rotulo="Líquido pago">{formatCurrency(Number(f.valor_pago))}</Info>
            {saldo && <Info rotulo="Vale para o próximo">{formatCurrency(Number(saldo.valor))}</Info>}
            {f.observacao && <Info rotulo="Observação" largo>{f.observacao}</Info>}
          </InfoGrade>
          <SecaoDetalhe titulo={`Comissões (${comissoes.length})`}>
            <div className="fechamento-lista">
              {comissoes.map(c => (
                <span key={c.id}>
                  <span className="texto-cortado">{formatDate(c.created_at.slice(0, 10))} · {c.comanda?.cliente_nome ?? 'Balcão'}{c.item ? ` · ${c.item.nome}` : ''} · {Number(c.percentual)}% de {formatCurrency(Number(c.valor_base))}</span>
                  <span className="valor-num">{formatCurrency(Number(c.valor_comissao))}</span>
                </span>
              ))}
              {comissoes.length === 0 && <p className="subtexto">Só vales neste fechamento.</p>}
            </div>
          </SecaoDetalhe>
          {vales.length > 0 && (
            <SecaoDetalhe titulo={`Vales descontados (${vales.length})`}>
              <div className="fechamento-lista">
                {vales.map(v => (
                  <span key={v.id}>
                    <span className="texto-cortado">{formatDate(v.data)}{v.descricao ? ` · ${v.descricao}` : ''}</span>
                    <span className="valor-num">− {formatCurrency(Number(v.valor))}</span>
                  </span>
                ))}
              </div>
            </SecaoDetalhe>
          )}
          {erro && <p className="aviso-erro" style={{ marginTop: '12px' }}>{erro}</p>}
        </>
      )}
    </ModalDetalhe>
  )
}
