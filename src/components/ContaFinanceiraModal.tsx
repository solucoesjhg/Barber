import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ModalFormulario, { Campo, FormGrade } from './ui/ModalFormulario'
import type { ContaFinanceira } from '../types'

export default function ContaFinanceiraModal({ conta, onClose, onSaved }: {
  conta: ContaFinanceira | null
  onClose: () => void
  onSaved: () => void
}) {
  const [nome, setNome] = useState(conta?.nome ?? '')
  const [tipo, setTipo] = useState<'caixa' | 'banco'>(conta?.tipo ?? 'banco')
  const [saldoInicial, setSaldoInicial] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!nome.trim()) { setError('Informe o nome da conta.'); return }
    setSaving(true); setError('')

    if (conta) {
      const { error: err } = await supabase.from('contas_financeiras').update({ nome: nome.trim(), tipo }).eq('id', conta.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('contas_financeiras').insert({ nome: nome.trim(), tipo }).select('id').single()
      if (err) { setError(err.message); setSaving(false); return }
      const novaId = (data as { id: string }).id
      if (saldoInicial.trim() && Number(saldoInicial) > 0) {
        const { error: capErr } = await supabase.rpc('registrar_capital_inicial', {
          p_conta_financeira_id: novaId, p_valor: Number(saldoInicial),
        })
        if (capErr) { setError(`Conta criada, mas o saldo inicial falhou: ${capErr.message}`); setSaving(false); onSaved(); return }
      }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <ModalFormulario
      tamanho="pequeno"
      icone={<Landmark size={18} />}
      titulo={conta ? 'Editar Conta' : 'Nova Conta Financeira'}
      descricao={conta ? conta.nome : 'Banco ou caixa onde fica o dinheiro da loja.'}
      onClose={onClose}
      onSalvar={handleSave}
      salvando={saving}
      erro={error}
    >
      <FormGrade colunas={2}>
        <Campo rotulo="Nome *">
          <input className="input" placeholder="Ex: Banco Itaú" value={nome} onChange={e => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Tipo">
          <select className="input" value={tipo} onChange={e => setTipo(e.target.value as 'caixa' | 'banco')}>
            <option value="banco">Banco</option>
            <option value="caixa">Caixa</option>
          </select>
        </Campo>
        {!conta && (
          <Campo rotulo="Saldo inicial (opcional)">
            <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} />
          </Campo>
        )}
      </FormGrade>
    </ModalFormulario>
  )
}
