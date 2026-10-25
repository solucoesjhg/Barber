import { useState } from 'react'
import { HandCoins } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { dataLocalISO } from '../../lib/periodo'
import ModalFormulario, { Campo, FormGrade } from '../ui/ModalFormulario'
import CampoBusca from '../ui/CampoBusca'

/**
 * Vale (adiantamento) para o profissional: sai do caixa ou da conta na
 * hora e é descontado no próximo fechamento de comissão.
 */
export default function ValeModal({ profissionais, profissionalId, onClose, onSalvo }: {
  profissionais: { id: string; nome: string }[]
  profissionalId?: string
  onClose: () => void
  onSalvo: () => void
}) {
  const [form, setForm] = useState({
    profissional: profissionalId ?? '', valor: '', descricao: '', data: dataLocalISO(), doCaixa: true,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (salvando) return
    const valor = Number(form.valor.replace(',', '.'))
    if (!form.profissional) { setErro('Escolha o profissional.'); return }
    if (!(valor > 0)) { setErro('Informe o valor do vale.'); return }
    setSalvando(true); setErro('')
    const { error } = await supabase.rpc('registrar_vale', {
      p_profissional_id: form.profissional, p_valor: valor, p_descricao: form.descricao || null,
      p_data: form.data, p_do_caixa: form.doCaixa,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    onSalvo()
  }

  return (
    <ModalFormulario
      tamanho="pequeno"
      icone={<HandCoins size={18} />}
      titulo="Lançar vale"
      descricao="Adiantamento ao profissional. É descontado no próximo fechamento de comissão."
      onClose={onClose}
      onSalvar={salvar}
      salvando={salvando}
      rotuloSalvar="Lançar vale"
      erro={erro}
    >
      <FormGrade colunas={2}>
        <Campo rotulo="Profissional *" span="total">
          <CampoBusca
            titulo="Profissionais" placeholder="Digite o nome do profissional..."
            opcoes={profissionais.map(p => ({ id: p.id, nome: p.nome }))}
            valor={form.profissional} onChange={id => setForm(f => ({ ...f, profissional: id }))}
          />
        </Campo>
        <Campo rotulo="Valor (R$) *">
          <input className="input" type="number" min={0} step={0.01} inputMode="decimal" placeholder="0,00" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
        </Campo>
        <Campo rotulo="Data">
          <input className="input" type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
        </Campo>
        <Campo rotulo="Descrição" span="total">
          <input className="input" placeholder="Ex.: adiantamento da semana" value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
        </Campo>
        <div className="field span-total">
          <label className="check-rotulo">
            <input type="checkbox" checked={form.doCaixa} onChange={e => setForm(f => ({ ...f, doCaixa: e.target.checked }))} />
            Saiu do dinheiro do caixa (desmarque se foi Pix/transferência da conta)
          </label>
        </div>
      </FormGrade>
    </ModalFormulario>
  )
}
