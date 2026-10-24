import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { intervaloMes, periodoAnterior, rotuloIntervalo, type Intervalo } from '../lib/periodo'
import FiltroPeriodo from '../components/ui/FiltroPeriodo'

interface DreData {
  receita_servicos: number
  receita_produtos: number
  outras_receitas: number
  receita_bruta: number
  cmv: number
  comissoes: number
  /** Taxas da maquininha (ausente antes da migração 20261024000001). */
  taxas_pagamento?: number
  /** Descontos dados nas vendas (já saem da receita bruta). */
  descontos?: number
  custos_total: number
  lucro_bruto: number
  despesas_por_categoria: { categoria: string; valor: number }[]
  despesas_total: number
  resultado_operacional: number
}

function Linha({ label, value, bold, indent, pct, delta }: { label: string; value: number; bold?: boolean; indent?: boolean; pct?: number; delta?: number }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px',
      padding: '10px 0', alignItems: 'center',
      borderBottom: '1px solid var(--c-1a)',
    }}>
      <span style={{ fontSize: bold ? '13px' : '13px', fontWeight: bold ? 700 : 400, color: bold ? 'var(--c-fff)' : 'var(--c-a3)', paddingLeft: indent ? '16px' : 0 }}>
        {label}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--c-55)', textAlign: 'right' }}>{pct != null ? `${pct.toFixed(1)}%` : ''}</span>
      <span style={{ fontSize: bold ? '14px' : '13px', fontWeight: bold ? 700 : 500, color: bold ? 'var(--c-fff)' : 'var(--c-a3)', textAlign: 'right', fontFamily: 'DM Sans, sans-serif' }}>
        {formatCurrency(value)}
      </span>
      <span style={{ fontSize: '11px', textAlign: 'right', color: delta == null ? 'var(--c-33)' : delta > 0 ? 'var(--c-fff)' : delta < 0 ? 'var(--c-66)' : 'var(--c-44)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
        {delta != null && (delta > 0 ? <TrendingUp size={11} /> : delta < 0 ? <TrendingDown size={11} /> : <Minus size={11} />)}
        {delta != null && `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`}
      </span>
    </div>
  )
}

export default function DRE() {
  const [periodo, setPeriodo] = useState<Intervalo>(() => intervaloMes())
  const [dre, setDre] = useState<DreData | null>(null)
  const [dreAnterior, setDreAnterior] = useState<DreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { inicio, fim } = periodo
      const [anteriorInicio, anteriorFim] = periodoAnterior(inicio, fim)

      const [{ data: atual, error: errAtual }, { data: anterior, error: errAnterior }] = await Promise.all([
        supabase.rpc('calcular_dre', { p_inicio: inicio, p_fim: fim }),
        supabase.rpc('calcular_dre', { p_inicio: anteriorInicio, p_fim: anteriorFim }),
      ])
      if (errAtual || errAnterior || !atual) {
        setError((errAtual ?? errAnterior)?.message ?? 'Não foi possível calcular a DRE.')
        setDre(null)
        setDreAnterior(null)
        return
      }
      setDre(atual as DreData)
      setDreAnterior((anterior ?? null) as DreData | null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível calcular a DRE.')
      setDre(null)
      setDreAnterior(null)
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => { carregar() }, [carregar])

  function delta(atual: number, anterior: number) {
    if (!dreAnterior) return undefined
    if (anterior === 0) return atual === 0 ? 0 : 100
    return ((atual - anterior) / Math.abs(anterior)) * 100
  }

  return (
    <div className="page">
      <div className="page-header-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', color: 'var(--c-fff)' }}>DRE Gerencial</h1>
          <p style={{ fontSize: '13px', color: 'var(--c-55)', marginTop: '3px' }}>{rotuloIntervalo(periodo)} · comparado ao período anterior</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <FiltroPeriodo valor={periodo} onChange={v => v && setPeriodo(v)} />
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '36px' }}>
            <Printer size={13} /> Imprimir / PDF
          </button>
        </div>
      </div>

      <DreEstilos />

      {loading ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Carregando...</div>
      ) : error ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-66)', fontSize: '13px' }}>
          {error}
          <div style={{ marginTop: '16px' }}>
            <button className="btn btn-secondary btn-sm" onClick={carregar}>Tentar novamente</button>
          </div>
        </div>
      ) : !dre ? (
        <div className="card" style={{ padding: '56px', textAlign: 'center', color: 'var(--c-44)', fontSize: '13px' }}>Nenhum dado disponível.</div>
      ) : (
        <motion.div id="area-impressao" className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '24px 28px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 110px 100px',
            padding: '0 0 10px', borderBottom: '1px solid var(--c-2a)', marginBottom: '4px',
            fontSize: '10px', fontWeight: 600, color: 'var(--c-44)', textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <span>Linha</span><span style={{ textAlign: 'right' }}>% receita</span><span style={{ textAlign: 'right' }}>Valor</span><span style={{ textAlign: 'right' }}>vs. anterior</span>
          </div>

          <Linha label="Receita de Serviços" value={dre.receita_servicos} indent pct={dre.receita_bruta ? dre.receita_servicos / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.receita_servicos, dreAnterior.receita_servicos) : undefined} />
          <Linha label="Receita de Produtos" value={dre.receita_produtos} indent pct={dre.receita_bruta ? dre.receita_produtos / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.receita_produtos, dreAnterior.receita_produtos) : undefined} />
          {(dre.descontos ?? 0) > 0 && (
            <Linha label="(−) Descontos nas vendas" value={-(dre.descontos ?? 0)} indent pct={dre.receita_bruta ? (dre.descontos ?? 0) / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.descontos ?? 0, dreAnterior.descontos ?? 0) : undefined} />
          )}
          <Linha label="Outras Receitas" value={dre.outras_receitas} indent pct={dre.receita_bruta ? dre.outras_receitas / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.outras_receitas, dreAnterior.outras_receitas) : undefined} />
          <div style={{ marginTop: '4px' }}>
            <Linha label="RECEITA BRUTA" value={dre.receita_bruta} bold pct={100} delta={dreAnterior ? delta(dre.receita_bruta, dreAnterior.receita_bruta) : undefined} />
          </div>

          <div style={{ marginTop: '18px' }}>
            <Linha label="Custo dos Produtos Vendidos (CMV)" value={-dre.cmv} indent pct={dre.receita_bruta ? dre.cmv / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.cmv, dreAnterior.cmv) : undefined} />
            <Linha label="Comissões" value={-dre.comissoes} indent pct={dre.receita_bruta ? dre.comissoes / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.comissoes, dreAnterior.comissoes) : undefined} />
            <Linha label="Taxas de cartão / Pix (absorvidas)" value={-(dre.taxas_pagamento ?? 0)} indent pct={dre.receita_bruta ? (dre.taxas_pagamento ?? 0) / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.taxas_pagamento ?? 0, dreAnterior.taxas_pagamento ?? 0) : undefined} />
            <Linha label="LUCRO BRUTO" value={dre.lucro_bruto} bold pct={dre.receita_bruta ? dre.lucro_bruto / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.lucro_bruto, dreAnterior.lucro_bruto) : undefined} />
          </div>

          <div style={{ marginTop: '18px' }}>
            {dre.despesas_por_categoria.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--c-44)', padding: '8px 0' }}>Nenhuma despesa paga no período.</p>
            ) : dre.despesas_por_categoria.map(d => (
              <Linha key={d.categoria} label={d.categoria} value={-d.valor} indent pct={dre.receita_bruta ? d.valor / dre.receita_bruta * 100 : 0} />
            ))}
            <Linha label="DESPESAS OPERACIONAIS" value={-dre.despesas_total} bold pct={dre.receita_bruta ? dre.despesas_total / dre.receita_bruta * 100 : 0} delta={dreAnterior ? delta(dre.despesas_total, dreAnterior.despesas_total) : undefined} />
          </div>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '2px solid var(--c-33)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--c-fff)' }}>RESULTADO OPERACIONAL</span>
              <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--c-fff)', fontFamily: 'DM Sans, sans-serif' }}>
                {formatCurrency(dre.resultado_operacional)}
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--c-44)', marginTop: '4px', textAlign: 'right' }}>
              {dre.receita_bruta ? (dre.resultado_operacional / dre.receita_bruta * 100).toFixed(1) : '0'}% da receita bruta
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function DreEstilos() {
  return (
    <style>{`
      @media print {
        .no-print { display: none !important; }
        aside, header { display: none !important; }
        body * { visibility: hidden; }
        #area-impressao, #area-impressao * { visibility: visible; }
        #area-impressao { position: absolute; inset: 0; margin: 0; padding: 12px; }
      }
    `}</style>
  )
}
