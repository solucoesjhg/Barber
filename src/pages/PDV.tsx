import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShoppingCart, Plus, Minus, Trash2, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import type { ItemComanda, PagamentoMetodo, Produto, Servico } from '../types'

const SERVICOS_MOCK: Servico[] = [
  { id: 's1', nome: 'Combo Cabelo + Barba', preco: 65, duracao_minutos: 50, ativo: true },
  { id: 's2', nome: 'Corte de Cabelo',      preco: 45, duracao_minutos: 30, ativo: true },
  { id: 's3', nome: 'Barba',                preco: 30, duracao_minutos: 20, ativo: true },
  { id: 's4', nome: 'Pigmentação',          preco: 80, duracao_minutos: 60, ativo: true },
  { id: 's5', nome: 'Sobrancelha',          preco: 15, duracao_minutos: 10, ativo: true },
]

const PRODUTOS_MOCK: Produto[] = [
  { id: 'p1', nome: 'Heineken Lata',      categoria: 'bebidas',  preco_custo: 4,  preco_venda: 8,  estoque_atual: 24, estoque_minimo: 12, ativo: true },
  { id: 'p2', nome: 'Skol Lata',          categoria: 'bebidas',  preco_custo: 3.5,preco_venda: 7,  estoque_atual: 18, estoque_minimo: 12, ativo: true },
  { id: 'p3', nome: 'Água Mineral',       categoria: 'bebidas',  preco_custo: 1.5,preco_venda: 4,  estoque_atual: 30, estoque_minimo: 10, ativo: true },
  { id: 'p4', nome: 'Pomada Uppercut',    categoria: 'pomadas',  preco_custo: 25, preco_venda: 55, estoque_atual: 8,  estoque_minimo: 3,  ativo: true },
  { id: 'p5', nome: 'Pomada Leve',        categoria: 'pomadas',  preco_custo: 18, preco_venda: 38, estoque_atual: 6,  estoque_minimo: 3,  ativo: true },
  { id: 'p6', nome: 'Petisco Misto',      categoria: 'petiscos', preco_custo: 8,  preco_venda: 18, estoque_atual: 15, estoque_minimo: 5,  ativo: true },
  { id: 'p7', nome: 'Batata Chips',       categoria: 'petiscos', preco_custo: 5,  preco_venda: 12, estoque_atual: 20, estoque_minimo: 5,  ativo: true },
]

const CATEGORIAS = ['servicos', 'bebidas', 'pomadas', 'petiscos'] as const
type Cat = typeof CATEGORIAS[number]

const CAT_LABEL: Record<Cat, string> = {
  servicos: 'Serviços',
  bebidas:  'Bebidas',
  pomadas:  'Pomadas',
  petiscos: 'Petiscos',
}

const PAGAMENTOS: { id: PagamentoMetodo; label: string }[] = [
  { id: 'pix',     label: 'Pix'             },
  { id: 'credito', label: 'Cartão Crédito'  },
  { id: 'debito',  label: 'Cartão Débito'   },
  { id: 'dinheiro',label: 'Dinheiro'        },
]

function uid() { return Math.random().toString(36).slice(2) }

export default function PDV() {
  const [categoria, setCategoria] = useState<Cat>('servicos')
  const [cart, setCart] = useState<ItemComanda[]>([])
  const [clienteNome, setClienteNome] = useState('')
  const [pagamento, setPagamento] = useState<PagamentoMetodo>('pix')
  const [showPayModal, setShowPayModal] = useState(false)
  const [done, setDone] = useState(false)
  const [saving, setSaving] = useState(false)

  const total = cart.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0)

  function addServico(s: Servico) {
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'servico' && i.referencia_id === s.id)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'servico', referencia_id: s.id, nome: s.nome, quantidade: 1, preco_unitario: s.preco }]
    })
  }

  function addProduto(p: Produto) {
    setCart(prev => {
      const ex = prev.find(i => i.tipo === 'produto' && i.referencia_id === p.id)
      if (ex) return prev.map(i => i.id === ex.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...prev, { id: uid(), tipo: 'produto', referencia_id: p.id, nome: p.nome, quantidade: 1, preco_unitario: p.preco_venda }]
    })
  }

  function changeQty(id: string, delta: number) {
    setCart(prev => prev
      .map(i => i.id === id ? { ...i, quantidade: Math.max(0, i.quantidade + delta) } : i)
      .filter(i => i.quantidade > 0))
  }

  function removeItem(id: string) {
    setCart(prev => prev.filter(i => i.id !== id))
  }

  async function finalizarVenda() {
    setSaving(true)
    const { data: comanda, error } = await supabase
      .from('comandas')
      .insert({ cliente_nome: clienteNome || 'Balcão', status: 'fechada', total, forma_pagamento: pagamento })
      .select('id')
      .single()

    if (!error && comanda) {
      await supabase.from('itens_comanda').insert(
        cart.map(i => ({
          comanda_id: comanda.id,
          tipo: i.tipo,
          referencia_id: i.referencia_id,
          nome: i.nome,
          quantidade: i.quantidade,
          preco_unitario: i.preco_unitario,
        }))
      )
      await supabase.from('movimentos_caixa').insert({
        tipo: 'entrada',
        categoria: 'venda',
        descricao: `Venda — ${clienteNome || 'Balcão'}`,
        valor: total,
        comanda_id: comanda.id,
      })
    }

    setSaving(false)
    setDone(true)
    setCart([])
    setClienteNome('')
    setShowPayModal(false)
    setTimeout(() => setDone(false), 2500)
  }

  const produtosFiltrados = categoria === 'servicos'
    ? null
    : PRODUTOS_MOCK.filter(p => p.categoria === categoria)

  return (
    <div className="page" style={{ display: 'flex', gap: '24px', height: 'calc(100vh - 64px)', paddingBottom: '0', overflow: 'hidden' }}>
      {/* Left — catalog */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '32px' }}>
        {/* Category tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          {CATEGORIAS.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoria(cat)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: cat === categoria ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                background: cat === categoria ? '#FFFFFF' : 'transparent',
                color: cat === categoria ? '#0D0D0D' : '#666',
                fontSize: '13px',
                fontWeight: cat === categoria ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
              }}
            >
              {CAT_LABEL[cat]}
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
          {categoria === 'servicos'
            ? SERVICOS_MOCK.map(s => (
              <motion.button
                key={s.id}
                onClick={() => addServico(s)}
                className="card-sm"
                style={{ cursor: 'pointer', border: '1px solid #2A2A2A', textAlign: 'left', transition: 'all 0.15s ease', fontFamily: 'inherit', width: '100%' }}
                whileHover={{ borderColor: '#444', background: '#242424' }}
                whileTap={{ scale: 0.97 }}
              >
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{s.nome}</p>
                <p style={{ fontSize: '11px', color: '#555' }}>{s.duracao_minutos} min</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px' }}>{formatCurrency(s.preco)}</p>
              </motion.button>
            ))
            : (produtosFiltrados ?? []).map(p => (
              <motion.button
                key={p.id}
                onClick={() => addProduto(p)}
                className="card-sm"
                style={{ cursor: 'pointer', border: '1px solid #2A2A2A', textAlign: 'left', transition: 'all 0.15s ease', fontFamily: 'inherit', width: '100%' }}
                whileHover={{ borderColor: '#444', background: '#242424' }}
                whileTap={{ scale: 0.97 }}
              >
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{p.nome}</p>
                <p style={{ fontSize: '11px', color: '#555' }}>Estoque: {p.estoque_atual}</p>
                <p style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', marginTop: '10px' }}>{formatCurrency(p.preco_venda)}</p>
              </motion.button>
            ))
          }
        </div>
      </div>

      {/* Right — cart */}
      <div style={{
        width: '320px', flexShrink: 0,
        background: '#1A1A1A',
        border: '1px solid #252525',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}>
        {/* Cart header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #222', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={15} style={{ color: '#555' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Comanda</span>
            {cart.length > 0 && (
              <span style={{
                marginLeft: 'auto', fontSize: '11px', padding: '2px 8px',
                borderRadius: '99px', background: 'rgba(255,255,255,0.07)', color: '#A3A3A3',
              }}>
                {cart.length}
              </span>
            )}
          </div>
          <input
            className="input"
            style={{ marginTop: '12px', fontSize: '13px' }}
            placeholder="Nome do cliente (opcional)"
            value={clienteNome}
            onChange={e => setClienteNome(e.target.value)}
          />
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          <AnimatePresence>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#333', fontSize: '13px' }}>
                Adicione itens à comanda
              </div>
            ) : cart.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid #252525',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.nome}
                  </p>
                  <p style={{ fontSize: '11px', color: '#555', marginTop: '2px' }}>
                    {formatCurrency(item.preco_unitario)}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => changeQty(item.id, -1)}
                    style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={10} />
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', minWidth: '16px', textAlign: 'center' }}>
                    {item.quantidade}
                  </span>
                  <button
                    onClick={() => changeQty(item.id, 1)}
                    style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid #333', background: 'transparent', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={10} />
                  </button>
                </div>
                <button onClick={() => removeItem(item.id)} style={{ background: 'transparent', border: 'none', color: '#333', cursor: 'pointer', padding: '2px', display: 'flex' }}>
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Cart footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #222', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', fontFamily: 'DM Sans, sans-serif' }}>
              {formatCurrency(total)}
            </span>
          </div>
          <button
            className="btn btn-primary btn-full"
            onClick={() => setShowPayModal(true)}
            disabled={cart.length === 0}
          >
            Finalizar Venda
          </button>
        </div>
      </div>

      {/* Payment modal */}
      <AnimatePresence>
        {showPayModal && (
          <motion.div
            style={{
              position: 'fixed', inset: 0, zIndex: 50,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '20px',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setShowPayModal(false)}
          >
            <motion.div
              className="card"
              style={{ width: '100%', maxWidth: '400px', padding: '28px' }}
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', color: '#FFFFFF' }}>Forma de Pagamento</h2>
                <button className="btn btn-icon" onClick={() => setShowPayModal(false)}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
                {PAGAMENTOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPagamento(p.id)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '8px',
                      border: pagamento === p.id ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
                      background: pagamento === p.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                      color: pagamento === p.id ? '#FFFFFF' : '#666',
                      fontSize: '14px',
                      fontWeight: pagamento === p.id ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p.label}
                    {pagamento === p.id && <Check size={14} />}
                  </button>
                ))}
              </div>

              <div style={{
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}>
                <span style={{ fontSize: '13px', color: '#A3A3A3' }}>Total a cobrar</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>{formatCurrency(total)}</span>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={finalizarVenda}
                disabled={saving}
              >
                {saving ? 'Processando...' : 'Confirmar Pagamento'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success toast */}
      <AnimatePresence>
        {done && (
          <motion.div
            style={{
              position: 'fixed', bottom: '28px', right: '28px', zIndex: 100,
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '14px 20px',
              background: '#1E1E1E',
              border: '1px solid #333',
              borderRadius: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            }}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={14} style={{ color: '#FFFFFF' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Venda registrada!</p>
              <p style={{ fontSize: '11px', color: '#555' }}>Comanda finalizada com sucesso.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
