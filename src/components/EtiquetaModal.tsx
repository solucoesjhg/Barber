import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import JsBarcode from 'jsbarcode'
import { X, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency, gerarCodigoProduto } from '../lib/utils'
import type { Produto } from '../types'

export default function EtiquetaModal({ produtos, onClose, onSkuGerado }: {
  produtos: Produto[]
  onClose: () => void
  onSkuGerado: (id: string, sku: string) => void
}) {
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [quantidades, setQuantidades] = useState<Record<string, number>>(
    () => Object.fromEntries(produtos.map(p => [p.id, 1]))
  )
  const refs = useRef<Record<string, SVGSVGElement | null>>({})

  useEffect(() => {
    setCodigos(prev => {
      const next = { ...prev }
      produtos.forEach(p => { if (p.sku) next[p.id] = p.sku })
      return next
    })
    produtos.filter(p => !p.sku).forEach(p => {
      const novoCodigo = gerarCodigoProduto(p.id)
      setCodigos(prev => ({ ...prev, [p.id]: novoCodigo }))
      supabase.from('produtos').update({ sku: novoCodigo }).eq('id', p.id).then(() => onSkuGerado(p.id, novoCodigo))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos.map(p => p.id).join(',')])

  useEffect(() => {
    produtos.forEach(p => {
      const codigo = codigos[p.id]
      if (!codigo) return
      const qtd = quantidades[p.id] ?? 1
      for (let i = 0; i < qtd; i++) {
        const svg = refs.current[`${p.id}-${i}`]
        if (svg) JsBarcode(svg, codigo, { format: 'CODE128', width: 2, height: 46, fontSize: 13, margin: 6 })
      }
    })
  }, [codigos, quantidades, produtos])

  const totalEtiquetas = produtos.reduce((s, p) => s + (quantidades[p.id] ?? 1), 0)
  const multiplo = produtos.length > 1

  return (
    <motion.div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <EtiquetaEstilos />
      <motion.div className="card no-print-hide" style={{ width: '100%', maxWidth: multiplo ? '560px' : '420px', padding: '28px', maxHeight: '85vh', overflowY: 'auto' }}
        initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>
            {multiplo ? `Etiquetas — ${produtos.length} produtos` : `Etiqueta — ${produtos[0]?.nome}`}
          </h2>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
          {produtos.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid #1F1F1F' }}>
              <span style={{ flex: 1, fontSize: '13px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
              <label style={{ fontSize: '11px', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Cópias
                <input
                  className="input" type="number" min={1} max={50}
                  style={{ width: '64px' }}
                  value={quantidades[p.id] ?? 1}
                  onChange={e => setQuantidades(q => ({ ...q, [p.id]: Math.max(1, Number(e.target.value)) }))}
                />
              </label>
            </div>
          ))}
        </div>

        <div id="area-impressao" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
          {produtos.map(p => (
            Array.from({ length: quantidades[p.id] ?? 1 }).map((_, i) => (
              <div key={`${p.id}-${i}`} className="etiqueta" style={{ background: '#fff', borderRadius: '6px', padding: '8px 10px', textAlign: 'center', width: '170px' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#111', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#111', marginBottom: '4px' }}>{formatCurrency(p.preco_venda)}</p>
                <svg ref={el => { refs.current[`${p.id}-${i}`] = el }} />
              </div>
            ))
          ))}
        </div>

        <button className="btn btn-primary btn-full" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Printer size={14} /> Imprimir {totalEtiquetas > 1 ? `(${totalEtiquetas})` : ''}
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
