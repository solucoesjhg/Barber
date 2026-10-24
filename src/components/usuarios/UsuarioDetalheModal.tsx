import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, initials } from '../../lib/utils'
import { CARDS_DASHBOARD, PAPEL_LABEL, RELATORIOS, TELAS, nomeExibicao } from '../../lib/permissoes'
import ModalDetalhe, { Info, InfoGrade, SecaoDetalhe } from '../ui/ModalDetalhe'
import type { PermissoesUsuario, Profissional, UsuarioListado } from '../../types'

/** Uma linha do resumo de acesso: rótulo + etiquetas (ou o texto de vazio). */
function LinhaAcesso({ rotulo, itens, vazio }: { rotulo: string; itens: string[]; vazio: string }) {
  return (
    <div>
      <p className="detalhe-rotulo" style={{ marginBottom: '6px' }}>{rotulo}</p>
      {itens.length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>{vazio}</p>
      ) : (
        <div className="chip-lista">
          {itens.map(i => <span key={i} className="chip">{i}</span>)}
        </div>
      )}
    </div>
  )
}

/** O que o usuário vê e edita, a partir de permissoes_usuario(). */
function ResumoAcesso({ permissoes: p }: { permissoes: PermissoesUsuario }) {
  const vistas = TELAS.filter(t => p.telas[t.id]?.ver)
  const edita = vistas.filter(t => t.temEdicao && p.telas[t.id]?.editar)
  const soVe = vistas.filter(t => !edita.includes(t))
  // Sem a lista no banco (migração de relatórios ainda não rodada) = todos.
  const relatorios = p.relatorios ?? RELATORIOS.map(r => r.id)
  const verRelatorios = !!p.telas.relatorios?.ver

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <LinhaAcesso rotulo="Vê e edita" itens={edita.map(t => t.label)} vazio="Nenhuma tela." />
      <LinhaAcesso rotulo="Só vê" itens={soVe.map(t => t.label)} vazio="Nenhuma tela." />
      {verRelatorios && (
        <LinhaAcesso
          rotulo="Relatórios"
          itens={relatorios.length === RELATORIOS.length ? ['Todos'] : RELATORIOS.filter(r => relatorios.includes(r.id)).map(r => r.label)}
          vazio="Nenhum relatório liberado."
        />
      )}
      <InfoGrade>
        <Info rotulo="Vendas">{p.ver_vendas_outros ? 'Vê as de todos' : 'Vê só as próprias'}</Info>
        <Info rotulo="Agendamentos">{p.ver_agendamentos_outros ?? true ? 'Vê os de todos' : 'Vê só os próprios'}</Info>
        <Info rotulo="Custo dos produtos">{p.ver_custo_produtos ? 'Vê' : 'Não vê'}</Info>
        {p.telas.dashboard?.ver && <Info rotulo="Cards do Dashboard">{`${p.dashboard_cards.length} de ${CARDS_DASHBOARD.length}`}</Info>}
      </InfoGrade>
    </div>
  )
}

/**
 * Card do usuário (abre ao clicar na lista): dados de acesso e o resumo
 * das permissões. "Editar" abre o cartão de edição na própria lista.
 */
export default function UsuarioDetalheModal({ usuario: u, profissionais, podeEditar, motivoSomenteLeitura, onClose, onEditar }: {
  usuario: UsuarioListado
  profissionais: Profissional[]
  podeEditar: boolean
  motivoSomenteLeitura?: string
  onClose: () => void
  onEditar: () => void
}) {
  const [permissoes, setPermissoes] = useState<PermissoesUsuario | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    supabase.rpc('permissoes_usuario', { p_usuario_id: u.usuario_id }).then(({ data, error }) => {
      if (cancelado) return
      if (error) { setErro(error.message); return }
      setPermissoes(data as PermissoesUsuario)
    })
    return () => { cancelado = true }
  }, [u.usuario_id])

  const nome = nomeExibicao(u)
  const profissional = u.profissional_id ? profissionais.find(p => p.id === u.profissional_id) : undefined
  const personalizado = !!permissoes && !permissoes.acesso_total && (
    permissoes.especiais_personalizados || permissoes.dashboard_personalizado || !!permissoes.relatorios_personalizado
    || Object.values(permissoes.telas).some(t => t.personalizado)
  )

  return (
    <ModalDetalhe
      icone={initials(nome)}
      titulo={nome}
      subtitulo={<>
        <span>{PAPEL_LABEL[u.papel]}</span>
        <span className={`status-pill${u.ativo ? '' : ' inativo'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span>
      </>}
      onClose={onClose}
      acoes={podeEditar ? (
        <button className="btn btn-primary" onClick={onEditar}><Pencil size={13} /> Editar dados e permissões</button>
      ) : undefined}
    >
      <InfoGrade>
        <Info rotulo="E-mail de acesso" largo>{u.email}</Info>
        <Info rotulo="Papel">{PAPEL_LABEL[u.papel]}</Info>
        <Info rotulo="Profissional vinculado">{profissional?.nome}</Info>
        <Info rotulo="Cadastrado em">{formatDate(u.criado_em)}</Info>
      </InfoGrade>

      <SecaoDetalhe
        titulo="Acesso"
        acao={permissoes && !permissoes.acesso_total ? (
          <span className={`badge ${personalizado ? 'badge-pending' : 'badge-canceled'}`}>{personalizado ? 'Personalizado' : 'Padrão do papel'}</span>
        ) : undefined}
      >
        {erro ? (
          <p className="aviso-erro">{erro}</p>
        ) : !permissoes ? (
          <p style={{ fontSize: '12px', color: 'var(--c-55)' }}>Carregando...</p>
        ) : permissoes.acesso_total ? (
          <p style={{ fontSize: '12px', color: 'var(--c-a3)' }}>Administrador tem acesso total a todas as telas.</p>
        ) : (
          <ResumoAcesso permissoes={permissoes} />
        )}
      </SecaoDetalhe>

      {!podeEditar && motivoSomenteLeitura && <p className="aviso-info" style={{ marginTop: '16px' }}>{motivoSomenteLeitura}</p>}
    </ModalDetalhe>
  )
}
