import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, gerarCodigoProduto } from '../lib/utils'
import type { Produto } from '../types'

export default function EtiquetaModal({ produto, onClose, onSkuGerado }: {
  produto: Produto
  onClose: () => void
  onSkuGerado: (sku: string) => void
}) {
  const [codigo, setCodigo] = useState(produto.sku ?? '')
  const [quantidade, setQuantidade] = useState(1)
  const refs = useRef<(SVGSVGElement | null)[]>([])

  useEffect(() => {
    if (produto.sku) { setCodigo(produto.sku); return }
    const novoCodigo = gerarCodigoProduto(produto.id)
    setCodigo(novoCodigo)
    supabase.from('produtos').update({ sku: novoCodigo }).eq('id', produto.id).then(() => onSkuGerado(novoCodigo))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produto.id])

  useEffect(() => {
    if (!codigo) return
    refs.current.slice(0, quantidade).forEach(svg => {
      if (!svg) return
      JsBarcode(svg, codigo, { format: 'CODE128', width: 2, height: 46, fontSize: 13, margin: 6 })
    })
  }, [codigo, quantidade])

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <EtiquetaEstilos />
      <motion.div className="card no-print-hide" style={{ width: '100%', maxWidth: '420px', padding: '28px' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Etiqueta — {produto.nome}</h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="field" style={{ marginBottom: '18px' }}>
          <label className="label">Cópias</label>
          <input className="input" type="number" min={1} max={50} value={quantidade} onChange={e => setQuantidade(Math.max(1, Number(e.target.value)))} />
        </div>

        <div id="area-impressao" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
          {Array.from({ length: quantidade }).map((_, i) => (
            <div key={i} className="etiqueta" style={{ background: '#fff', borderRadius: '6px', padding: '8px 10px', textAlign: 'center', width: '170px' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#111', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{produto.nome}</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>{formatCurrency(produto.preco_venda)}</p>
              <svg ref={el => { refs.current[i] = el }} />
            </div>
          ))}
        </div>

        <button className="btn btn-primary btn-full" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Printer size={14} /> Imprimir {quantidade > 1 ? `(${quantidade})` : ''}
        </button>
      </motion.div>
    </motion.div>
  )
}

function EtiquetaEstilos() {
  return (
    <style>{`
      @media print {
        body * { visibility: hidden; }
        #area-impressao, #area-impressao * { visibility: visible; }
        #area-impressao {
          position: fixed; inset: 0; margin: 0; padding: 12px;
          justify-content: flex-start !important;
        }
        .etiqueta { break-inside: avoid; }
      }
    `}</style>
  )
}
