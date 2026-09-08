import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/utils'
import type { Auditoria as AuditoriaRow } from '../types'

const ACAO_LABEL: Record<string, string> = { insert: 'Criação', update: 'Alteração', delete: 'Exclusão' }
const MODULOS = ['comandas', 'sessoes_caixa', 'contas_pagar', 'contas_receber', 'agendamentos']

export default function Auditoria() {
  const [logs, setLogs] = useState<AuditoriaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroModulo, setFiltroModulo] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(200)
    if (filtroModulo) query = query.eq('modulo', filtroModulo)
    query.then(({ data }) => { setLogs((data ?? []) as AuditoriaRow[]); setLoading(false) })
  }, [filtroModulo])

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Auditoria</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          Histórico de criação, alteração e exclusão nos módulos sensíveis (visível só pra admin/gerente)
        </p>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setFiltroModulo('')}
          style={{
            padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
            border: filtroModulo === '' ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
            background: filtroModulo === '' ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: filtroModulo === '' ? '#FFFFFF' : '#555',
            fontSize: '12px', cursor: 'pointer',
          }}
        >
          Todos
        </button>
        {MODULOS.map(m => (
          <button
            key={m}
            onClick={() => setFiltroModulo(m)}
            style={{
              padding: '6px 14px', borderRadius: '99px', fontFamily: 'inherit',
              border: filtroModulo === m ? '1px solid #FFFFFF' : '1px solid #2A2A2A',
              background: filtroModulo === m ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: filtroModulo === m ? '#FFFFFF' : '#555',
              fontSize: '12px', cursor: 'pointer',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '30px 140px 100px 1fr 160px',
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span></span><span>Módulo</span><span>Ação</span><span>Registro</span><span>Data/hora</span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum registro encontrado (ou seu usuário não tem permissão pra ver a auditoria).
          </div>
        ) : logs.map((l, i) => (
          <div key={l.id}>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
              onClick={() => setExpandido(expandido === l.id ? null : l.id)}
              style={{
                display: 'grid', gridTemplateColumns: '30px 140px 100px 1fr 160px',
                padding: '12px 24px', alignItems: 'center', cursor: 'pointer',
                borderBottom: expandido === l.id ? 'none' : (i < logs.length - 1 ? '1px solid #1A1A1A' : 'none'),
              }}
            >
              {expandido === l.id ? <ChevronDown size={13} style={{ color: '#555' }} /> : <ChevronRightIcon size={13} style={{ color: '#555' }} />}
              <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{l.modulo}</span>
              <span style={{ fontSize: '12px', color: '#A3A3A3' }}>{ACAO_LABEL[l.acao]}</span>
              <span style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace' }}>{l.registro_id?.slice(0, 8)}</span>
              <span style={{ fontSize: '12px', color: '#444' }}>{formatDateTime(l.created_at)}</span>
            </motion.div>
            {expandido === l.id && (
              <div style={{ padding: '12px 24px 20px 54px', borderBottom: i < logs.length - 1 ? '1px solid #1A1A1A' : 'none', background: 'rgba(0,0,0,0.15)' }}>
                {l.dados_antes && (
                  <div style={{ marginBottom: '10px' }}>
                    <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Antes</p>
                    <pre style={{ fontSize: '11px', color: '#666', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(l.dados_antes, null, 2)}</pre>
                  </div>
                )}
                {l.dados_depois && (
                  <div>
                    <p style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Depois</p>
                    <pre style={{ fontSize: '11px', color: '#A3A3A3', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{JSON.stringify(l.dados_depois, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
