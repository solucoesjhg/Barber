import { supabase } from './supabase'
import { formatCurrency, formatDate, formatDateTime } from './utils'
import { rotuloPagamento } from './taxas'
import { exibirDocumento, exibirTelefone } from './mascaras'
import type { Comanda, ItemComanda, PagamentoComanda } from '../types'

const esc = (t: string | null | undefined) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

type Item = ItemComanda & { profissional?: { nome: string } | null }

/**
 * Comprovante da venda numa janela de impressão (dá para salvar em
 * PDF): dados da loja, cliente, itens com o profissional, desconto,
 * formas de pagamento e as parcelas do Parcelado. Sem valor fiscal.
 */
export async function imprimirVenda({ comanda, itens, pagamentos, vendedor }: {
  comanda: Comanda
  itens: Item[]
  pagamentos: PagamentoComanda[]
  vendedor?: string | null
}) {
  // Abre já (antes dos awaits) para o navegador não bloquear o pop-up.
  const w = window.open('', '_blank')
  if (!w) { window.alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return }
  w.document.write('<p style="font-family:system-ui;padding:24px">Preparando...</p>')

  const idsMaq = [...new Set([...pagamentos.map(p => p.maquininha_id), comanda.maquininha_id].filter(Boolean))] as string[]
  const [{ data: loja }, { data: parcelas }, { data: maqs }] = await Promise.all([
    supabase.from('configuracoes').select('nome_empresa, cnpj, telefone, endereco, logo_url').maybeSingle(),
    supabase.from('contas_receber').select('valor, data_vencimento, numero_parcela, total_parcelas').eq('comanda_id', comanda.id).order('numero_parcela'),
    idsMaq.length ? supabase.from('maquininhas').select('id, nome').in('id', idsMaq) : Promise.resolve({ data: [] }),
  ])
  const maquininhas = Object.fromEntries(((maqs ?? []) as { id: string; nome: string }[]).map(m => [m.id, m.nome]))
  const l = (loja ?? {}) as { nome_empresa?: string; cnpj?: string; telefone?: string; endereco?: string; logo_url?: string }
  const subtotal = itens.reduce((s, i) => s + Number(i.preco_unitario) * i.quantidade, 0)
  const desconto = Number(comanda.desconto ?? 0)
  const acrescimo = Number(comanda.acrescimo ?? 0)
  const pags = pagamentos.length > 0 ? pagamentos : [{ forma: comanda.forma_pagamento, valor: comanda.total, parcelas: comanda.parcelas, maquininha_id: comanda.maquininha_id, acrescimo, cobrado: comanda.total + acrescimo } as PagamentoComanda]
  const parc = (parcelas ?? []) as { valor: number; data_vencimento: string; numero_parcela: number; total_parcelas: number }[]

  const linhasItens = itens.map(i => `<tr>
    <td>${esc(i.nome)}${i.profissional?.nome ? `<div class="sub">${esc(i.profissional.nome)}</div>` : ''}</td>
    <td class="n">${i.quantidade}</td><td class="n">${formatCurrency(Number(i.preco_unitario))}</td>
    <td class="n">${formatCurrency(Number(i.preco_unitario) * i.quantidade)}</td></tr>`).join('')
  const linhasPag = pags.map(p => {
    const maq = p.maquininha_id ? maquininhas[p.maquininha_id] : null
    return `<tr><td>${esc(rotuloPagamento(p.forma, p.parcelas, maq))}</td><td class="n">${formatCurrency(Number(p.cobrado ?? p.valor))}</td></tr>`
  }).join('')
  const linhasParc = parc.map(p => `<tr><td>${p.numero_parcela}/${p.total_parcelas}</td><td>${formatDate(p.data_vencimento)}</td><td class="n">${formatCurrency(Number(p.valor))}</td></tr>`).join('')
  const contato = [l.cnpj && `CNPJ ${exibirDocumento(l.cnpj)}`, l.telefone && exibirTelefone(l.telefone), l.endereco].filter(Boolean).map(t => esc(String(t))).join(' · ')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Venda ${esc(comanda.cliente_nome || 'Balcão')} ${formatDate(comanda.data)}</title>
<style>
@page{size:A4;margin:16mm}body{font-family:system-ui,-apple-system,sans-serif;color:#111;font-size:12px;margin:0}
.topo{display:flex;align-items:center;gap:14px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:14px}
.topo img{width:52px;height:52px;object-fit:contain}.topo b{font-size:16px;display:block}.topo span{color:#555;font-size:11px}
h1{font-size:15px;margin:0 0 2px}.meta{color:#555;margin:0 0 14px}
.grade{display:flex;gap:24px;margin-bottom:14px}.grade div span{display:block;font-size:10px;text-transform:uppercase;color:#777;letter-spacing:.05em}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#444;margin:16px 0 4px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px;border-bottom:1px solid #e2e2e2;vertical-align:top}
th{font-size:10px;text-transform:uppercase;color:#666}.n{text-align:right;white-space:nowrap}.sub{color:#777;font-size:10px;margin-top:2px}
.tot td{border-bottom:none;padding:3px 6px}.tot .grande td{font-size:15px;font-weight:700;padding-top:8px}
.rodape{margin-top:28px;color:#888;font-size:10px;text-align:center}
</style></head><body>
<div class="topo">${l.logo_url ? `<img src="${esc(l.logo_url)}" alt="">` : ''}<div><b>${esc(l.nome_empresa || 'Loja')}</b>${contato ? `<span>${contato}</span>` : ''}</div></div>
<h1>Comprovante de venda</h1>
<p class="meta">${formatDateTime(comanda.created_at ?? comanda.data)}</p>
<div class="grade">
  <div><span>Cliente</span>${esc(comanda.cliente_nome || 'Balcão')}</div>
  ${vendedor ? `<div><span>Atendido por</span>${esc(vendedor)}</div>` : ''}
</div>
<h2>Itens</h2>
<table><tr><th>Item</th><th class="n">Qtd</th><th class="n">Unitário</th><th class="n">Total</th></tr>${linhasItens}</table>
<table class="tot" style="margin-top:6px">
  ${desconto > 0 || acrescimo > 0 ? `<tr><td>Subtotal</td><td class="n">${formatCurrency(subtotal)}</td></tr>` : ''}
  ${desconto > 0 ? `<tr><td>Desconto</td><td class="n">− ${formatCurrency(desconto)}</td></tr>` : ''}
  ${acrescimo > 0 ? `<tr><td>Taxa do cartão</td><td class="n">+ ${formatCurrency(acrescimo)}</td></tr>` : ''}
  <tr class="grande"><td>Total</td><td class="n">${formatCurrency(Number(comanda.total) + acrescimo)}</td></tr>
</table>
<h2>Pagamento</h2>
<table>${linhasPag}</table>
${parc.length ? `<h2>Parcelas a pagar</h2><table><tr><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th></tr>${linhasParc}</table>` : ''}
<p class="rodape">Documento sem valor fiscal.</p>
<script>window.onload=()=>{window.print()}</script></body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}
