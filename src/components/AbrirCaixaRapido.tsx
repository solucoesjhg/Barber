import { useEffect, useId, useState } from 'react'
import { Unlock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sugestaoAberturaCaixa, rotuloFechamento } from '../lib/aberturaCaixa'

/** O erro do banco é de caixa fechado ("Nenhum caixa aberto..."). */
export const ehErroSemCaixa = (msg: string) => /nenhum caixa aberto/i.test(msg)

/**
 * Atalho para quando a venda esbarra no caixa fechado: abre o caixa ali
 * mesmo (já sugerindo o dinheiro que ficou na gaveta no último fechamento) e segue com a venda, sem sair
 * da tela.
 */
export default function AbrirCaixaRapido({ onAberto }: {
  /** Chamado com o caixa já aberto: a tela conclui a venda. */
  onAberto: () => void
}) {
  const [valor, setValor] = useState('')
  const [dica, setDica] = useState('')
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState('')
  const idValor = useId()

  useEffect(() => {
    sugestaoAberturaCaixa().then(s => {
      if (!s) return
      setValor(v => v === '' ? String(s.valor) : v)
      setDica(`Ficou na gaveta ${rotuloFechamento(s.fechadoEm)}`)
    })
  }, [])

  async function abrir() {
    if (abrindo) return
    setAbrindo(true); setErro('')
    const { error } = await supabase.rpc('abrir_caixa', { p_valor_inicial: Number(String(valor).replace(',', '.')) || 0 })
    setAbrindo(false)
    // Caixa já aberto (por outra pessoa ou em outra aba) também libera a venda.
    if (error && !/já tem um caixa aberto|já está aberto/i.test(error.message)) { setErro(error.message); return }
    onAberto()
  }

  return (
    <div className="aviso-info" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
      <span>O caixa da loja está fechado. Abra aqui e a venda é registrada em seguida.</span>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 120px' }}>
          <label className="label" htmlFor={idValor}>Valor inicial (troco)</label>
          <input
            id={idValor} className="input" type="number" min={0} step={0.01} placeholder="0,00" value={valor}
            onChange={e => setValor(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); abrir() } }}
          />
          {dica && <span className="subtexto" style={{ display: 'block', marginTop: '4px' }}>{dica}</span>}
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={abrir} disabled={abrindo} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '40px' }}>
          <Unlock size={13} /> {abrindo ? 'Abrindo...' : 'Abrir caixa e concluir a venda'}
        </button>
      </div>
      {erro && <span style={{ color: 'var(--c-fff)' }}>{erro}</span>}
    </div>
  )
}
