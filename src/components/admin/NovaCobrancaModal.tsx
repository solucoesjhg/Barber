import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { dataLocalISO } from '../../lib/periodo'
import { inicioDoMes } from '../../lib/mensalidades'
import ModalFormulario, { Campo, FormGrade } from '../ui/ModalFormulario'

/**
 * Lança uma cobrança para uma loja: a mensalidade de um mês (uma por
 * mês) ou uma avulsa (implantação, treinamento...). Sem empresaId, a
 * loja é escolhida na lista.
 */
export default function NovaCobrancaModal({ empresaId, empresas, valorPadrao, diaVencimento, onClose, onSalvo }: {
  empresaId?: string
  empresas?: { id: string; nome: string; valor_mensalidade?: number; dia_vencimento?: number }[]
  valorPadrao?: number
  diaVencimento?: number
  onClose: () => void
  onSalvo: () => void
}) {
  const hoje = dataLocalISO()
  const [form, setForm] = useState({
    empresa: empresaId ?? '',
    tipo: 'mensalidade' as 'mensalidade' | 'avulsa',
    mes: hoje.slice(0, 7),
    descricao: '',
    valor: valorPadrao ? String(valorPadrao) : '',
    vencimento: `${hoje.slice(0, 7)}-${String(diaVencimento ?? 10).padStart(2, '0')}`,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function escolherEmpresa(id: string) {
    const e = empresas?.find(x => x.id === id)
    setForm(f => ({
      ...f, empresa: id,
      valor: e?.valor_mensalidade ? String(e.valor_mensalidade) : f.valor,
      vencimento: `${f.mes}-${String(e?.dia_vencimento ?? 10).padStart(2, '0')}`,
    }))
  }

  async function salvar() {
    if (salvando) return
    const valor = Number(String(form.valor).replace(',', '.'))
    if (!form.empresa) { setErro('Escolha a loja.'); return }
    if (!(valor > 0)) { setErro('Informe o valor.'); return }
    if (!form.vencimento) { setErro('Informe o vencimento.'); return }
    if (form.tipo === 'avulsa' && !form.descricao.trim()) { setErro('Descreva a cobrança avulsa.'); return }
    setSalvando(true); setErro('')
    const { error } = await supabase.from('mensalidades').insert({
      empresa_id: form.empresa,
      tipo: form.tipo,
      competencia: form.tipo === 'mensalidade' ? `${form.mes}-01` : inicioDoMes(form.vencimento),
      descricao: form.tipo === 'avulsa' ? form.descricao.trim() : null,
      valor,
      vencimento: form.vencimento,
    })
    setSalvando(false)
    if (error) {
      setErro(/idx_mensalidades_uma_por_mes|duplicate/.test(error.message) ? 'Essa loja já tem a mensalidade desse mês.' : error.message)
      return
    }
    onSalvo()
  }

  return (
    <ModalFormulario
      tamanho="pequeno"
      icone={<Receipt size={18} />}
      titulo="Nova cobrança"
      descricao="Mensalidade de um mês (uma por mês para cada loja) ou cobrança avulsa."
      onClose={onClose}
      onSalvar={salvar}
      salvando={salvando}
      rotuloSalvar="Lançar"
      erro={erro}
    >
      <FormGrade colunas={2}>
        {!empresaId && (
          <Campo rotulo="Loja *" span="total">
            <select className="input" value={form.empresa} onChange={e => escolherEmpresa(e.target.value)}>
              <option value="">Escolha a loja</option>
              {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Tipo">
          <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'mensalidade' | 'avulsa' }))}>
            <option value="mensalidade">Mensalidade</option>
            <option value="avulsa">Avulsa</option>
          </select>
        </Campo>
        {form.tipo === 'mensalidade' ? (
          <Campo rotulo="Mês de referência">
            <input className="input" type="month" value={form.mes} onChange={e => setForm(f => ({ ...f, mes: e.target.value, vencimento: `${e.target.value}-${f.vencimento.slice(8, 10) || '10'}` }))} />
          </Campo>
        ) : (
          <Campo rotulo="Descrição *">
            <input className="input" placeholder="Ex.: Implantação" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
          </Campo>
        )}
        <Campo rotulo="Valor (R$) *">
          <input className="input" type="number" min={0} step={0.01} placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
        </Campo>
        <Campo rotulo="Vencimento *">
          <input className="input" type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))} />
        </Campo>
      </FormGrade>
    </ModalFormulario>
  )
}
