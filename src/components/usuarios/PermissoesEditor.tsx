import { useState } from 'react'
import { CARDS_DASHBOARD, GRUPOS_TELAS, RELATORIOS, TELAS } from '../../lib/permissoes'
import type { CardDashboardId, PermissoesUsuario, RelatorioId, TelaId } from '../../types'

export type RascunhoPermissoes = {
  telas: Record<TelaId, { ver: boolean; editar: boolean }>
  ver_vendas_outros: boolean
  ver_custo_produtos: boolean
  dashboard_cards: CardDashboardId[]
  relatorios: RelatorioId[]
}

export function rascunhoDe(p: PermissoesUsuario): RascunhoPermissoes {
  const telas = {} as RascunhoPermissoes['telas']
  for (const t of TELAS) telas[t.id] = { ver: !!p.telas[t.id]?.ver, editar: !!p.telas[t.id]?.editar }
  return {
    telas,
    ver_vendas_outros: p.ver_vendas_outros,
    ver_custo_produtos: p.ver_custo_produtos,
    dashboard_cards: [...(p.dashboard_cards ?? [])],
    // Banco sem a migração de relatórios: todos liberados.
    relatorios: [...(p.relatorios ?? RELATORIOS.map(r => r.id))],
  }
}

function mesmaLista<T>(a: T[], b: T[]) {
  return a.length === b.length && a.every(c => b.includes(c))
}

export function cardsAlterados(a: RascunhoPermissoes, b: RascunhoPermissoes) {
  return !mesmaLista(a.dashboard_cards, b.dashboard_cards)
}

export function relatoriosAlterados(a: RascunhoPermissoes, b: RascunhoPermissoes) {
  return !mesmaLista(a.relatorios, b.relatorios)
}

export function rascunhosIguais(a: RascunhoPermissoes, b: RascunhoPermissoes) {
  return a.ver_vendas_outros === b.ver_vendas_outros
    && a.ver_custo_produtos === b.ver_custo_produtos
    && !cardsAlterados(a, b)
    && !relatoriosAlterados(a, b)
    && TELAS.every(t => a.telas[t.id].ver === b.telas[t.id].ver && a.telas[t.id].editar === b.telas[t.id].editar)
}

const ESPECIAIS: { campo: 'ver_vendas_outros' | 'ver_custo_produtos'; label: string; descricao: string }[] = [
  {
    campo: 'ver_vendas_outros',
    label: 'Ver vendas de outros usuários',
    descricao: 'Em Vendas, nos relatórios e no dashboard, vê as vendas de todos. Sem isso, vê só as que ele mesmo fez ou atendeu.',
  },
  {
    campo: 'ver_custo_produtos',
    label: 'Ver custo dos produtos',
    descricao: 'Vê o preço de custo e a margem. Necessário também para dar entrada de mercadoria.',
  },
]

type Aba = (typeof GRUPOS_TELAS)[number] | 'Dashboard' | 'Especiais'
const ABAS: Aba[] = [...GRUPOS_TELAS, 'Dashboard', 'Especiais']

function Caixa({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      className="perm-check"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
    />
  )
}

/**
 * Permissões de um usuário, separadas em abas: uma por grupo de telas
 * (ver/editar), uma para os cards do Dashboard e uma para as
 * permissões especiais. Controlado: quem usa guarda o rascunho e
 * decide quando salvar.
 */
export default function PermissoesEditor({ permissoes, rascunho, onChange, editavel }: {
  permissoes: PermissoesUsuario
  rascunho: RascunhoPermissoes
  onChange: (r: RascunhoPermissoes) => void
  editavel: boolean
}) {
  const [aba, setAba] = useState<Aba>('Geral')

  function aplicar(r: RascunhoPermissoes, tela: TelaId, campo: 'ver' | 'editar', valor: boolean): RascunhoPermissoes {
    const atual = r.telas[tela]
    // Editar exige ver; tirar o ver tira o editar junto.
    const novo = campo === 'ver'
      ? { ver: valor, editar: valor ? atual.editar : false }
      : { ver: valor ? true : atual.ver, editar: valor }
    return { ...r, telas: { ...r.telas, [tela]: novo } }
  }

  function marcarGrupo(grupo: string, campo: 'ver' | 'editar', valor: boolean) {
    let r = rascunho
    for (const t of TELAS.filter(t => t.grupo === grupo)) {
      if (campo === 'editar' && !t.temEdicao) continue
      r = aplicar(r, t.id, campo, valor)
    }
    onChange(r)
  }

  function marcarCard(card: CardDashboardId, valor: boolean) {
    const sem = rascunho.dashboard_cards.filter(c => c !== card)
    onChange({ ...rascunho, dashboard_cards: valor ? [...sem, card] : sem })
  }

  function marcarCardsGrupo(grupo: string, valor: boolean) {
    const doGrupo = CARDS_DASHBOARD.filter(c => c.grupo === grupo).map(c => c.id)
    const sem = rascunho.dashboard_cards.filter(c => !doGrupo.includes(c))
    onChange({ ...rascunho, dashboard_cards: valor ? [...sem, ...doGrupo] : sem })
  }

  function marcarRelatorio(id: RelatorioId, valor: boolean) {
    const sem = rascunho.relatorios.filter(r => r !== id)
    onChange({ ...rascunho, relatorios: valor ? [...sem, id] : sem })
  }

  // Sem relatorios em permissoes: banco ainda sem a migração (não dá pra salvar).
  const relatoriosDisponiveis = Array.isArray(permissoes.relatorios)
  const relatoriosEditavel = editavel && relatoriosDisponiveis && rascunho.telas.relatorios.ver

  // Quantos itens liberados em cada aba (mostrado ao lado do nome).
  function contagem(a: Aba): string {
    if (a === 'Dashboard') return `${rascunho.dashboard_cards.length}/${CARDS_DASHBOARD.length}`
    if (a === 'Especiais') return `${ESPECIAIS.filter(e => rascunho[e.campo]).length}/${ESPECIAIS.length}`
    const telas = TELAS.filter(t => t.grupo === a)
    return `${telas.filter(t => rascunho.telas[t.id].ver).length}/${telas.length}`
  }

  const personalizadoNaAba = (a: Aba) =>
    a === 'Dashboard' ? permissoes.dashboard_personalizado
      : a === 'Especiais' ? permissoes.especiais_personalizados
        : TELAS.some(t => t.grupo === a && permissoes.telas[t.id]?.personalizado)
          || (a === 'Relatórios' && !!permissoes.relatorios_personalizado)

  return (
    <div className="perm-editor">
      {/* Menu de abas */}
      <div className="perm-abas" role="tablist">
        {ABAS.map(a => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            className={`perm-aba${aba === a ? ' ativa' : ''}`}
            onClick={() => setAba(a)}
          >
            <span>{a}</span>
            <span className="perm-aba-contagem">{contagem(a)}</span>
            {personalizadoNaAba(a) && !permissoes.acesso_total && <span className="perm-ponto" title="Diferente do padrão do papel" />}
          </button>
        ))}
      </div>

      <div className="perm-tabela" role="tabpanel">
        {/* Telas de um grupo */}
        {(GRUPOS_TELAS as readonly string[]).includes(aba) && (() => {
          const telas = TELAS.filter(t => t.grupo === aba)
          return (
            <>
              <div className="perm-linha perm-linha-grupo">
                <span className="perm-titulo-grupo">Tela</span>
                {(['ver', 'editar'] as const).map(campo => {
                  const alvo = telas.filter(t => campo === 'ver' || t.temEdicao)
                  const todos = alvo.length > 0 && alvo.every(t => rascunho.telas[t.id][campo])
                  return (
                    <label key={campo} className="perm-coluna-titulo">
                      {alvo.length > 0 && editavel && (
                        <Caixa label={`${campo === 'ver' ? 'Ver' : 'Editar'} todas de ${aba}`} checked={todos} onChange={v => marcarGrupo(aba, campo, v)} />
                      )}
                      {campo === 'ver' ? 'Ver' : 'Editar'}
                    </label>
                  )
                })}
              </div>
              {telas.map(t => (
                <div key={t.id} className="perm-linha">
                  <div style={{ minWidth: 0 }}>
                    <p className="perm-nome">
                      {t.label}
                      {permissoes.telas[t.id]?.personalizado && !permissoes.acesso_total && (
                        <span className="perm-ponto" title="Diferente do padrão do papel" />
                      )}
                    </p>
                    <p className="perm-ajuda">{t.temEdicao ? `Editar: ${t.editarDescricao}` : 'Tela só de consulta'}</p>
                  </div>
                  <div className="perm-celula">
                    <Caixa label={`Ver ${t.label}`} checked={rascunho.telas[t.id].ver} disabled={!editavel} onChange={v => onChange(aplicar(rascunho, t.id, 'ver', v))} />
                  </div>
                  <div className="perm-celula">
                    {t.temEdicao
                      ? <Caixa label={`Editar ${t.label}`} checked={rascunho.telas[t.id].editar} disabled={!editavel} onChange={v => onChange(aplicar(rascunho, t.id, 'editar', v))} />
                      : <span className="perm-traco">—</span>}
                  </div>
                </div>
              ))}

              {/* Quais abas da tela Relatórios o usuário vê */}
              {aba === 'Relatórios' && (
                <>
                  <div className="perm-linha perm-linha-grupo perm-linha-1col">
                    <span className="perm-titulo-grupo">Relatórios liberados</span>
                    <label className="perm-coluna-titulo">
                      {relatoriosEditavel && (
                        <Caixa
                          label="Liberar todos os relatórios"
                          checked={rascunho.relatorios.length === RELATORIOS.length}
                          onChange={v => onChange({ ...rascunho, relatorios: v ? RELATORIOS.map(r => r.id) : [] })}
                        />
                      )}
                      Ver
                    </label>
                  </div>
                  {!relatoriosDisponiveis ? (
                    <p className="perm-ajuda perm-intro">
                      Escolher relatório por relatório fica disponível depois da atualização do banco de dados (migração 20261022000002). Até lá, quem vê a tela Relatórios vê todos.
                    </p>
                  ) : !rascunho.telas.relatorios.ver && (
                    <p className="perm-ajuda perm-intro">Libere a tela Relatórios acima para escolher quais relatórios este usuário vê.</p>
                  )}
                  {RELATORIOS.map(r => (
                    <div key={r.id} className="perm-linha perm-linha-1col" style={{ opacity: rascunho.telas.relatorios.ver ? 1 : 0.5 }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="perm-nome">{r.label}</p>
                        <p className="perm-ajuda">{r.ajuda}</p>
                      </div>
                      <div className="perm-celula">
                        <Caixa label={`Ver relatório ${r.label}`} checked={rascunho.relatorios.includes(r.id)} disabled={!relatoriosEditavel} onChange={v => marcarRelatorio(r.id, v)} />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )
        })()}

        {/* Cards do Dashboard */}
        {aba === 'Dashboard' && (
          <>
            <p className="perm-ajuda perm-intro">
              Cards que aparecem no Dashboard deste usuário. Os cards financeiros só mostram valores se ele também puder ver a tela de origem.
            </p>
            {(['Agenda', 'Financeiro', 'Rankings'] as const).map(grupo => {
              const cards = CARDS_DASHBOARD.filter(c => c.grupo === grupo)
              const todos = cards.every(c => rascunho.dashboard_cards.includes(c.id))
              return (
                <div key={grupo}>
                  <div className="perm-linha perm-linha-grupo perm-linha-1col">
                    <span className="perm-titulo-grupo">{grupo}</span>
                    <label className="perm-coluna-titulo">
                      {editavel && <Caixa label={`Mostrar todos de ${grupo}`} checked={todos} onChange={v => marcarCardsGrupo(grupo, v)} />}
                      Mostrar
                    </label>
                  </div>
                  {cards.map(c => (
                    <div key={c.id} className="perm-linha perm-linha-1col">
                      <div style={{ minWidth: 0 }}>
                        <p className="perm-nome">{c.label}</p>
                        <p className="perm-ajuda">{c.ajuda}</p>
                      </div>
                      <div className="perm-celula">
                        <Caixa label={`Mostrar ${c.label}`} checked={rascunho.dashboard_cards.includes(c.id)} disabled={!editavel} onChange={v => marcarCard(c.id, v)} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}

        {/* Permissões especiais */}
        {aba === 'Especiais' && ESPECIAIS.map(e => (
          <label key={e.campo} className="perm-linha perm-linha-1col" style={{ cursor: editavel ? 'pointer' : 'default' }}>
            <span style={{ minWidth: 0 }}>
              <span className="perm-nome" style={{ display: 'flex' }}>{e.label}</span>
              <span className="perm-ajuda" style={{ display: 'block' }}>{e.descricao}</span>
            </span>
            <span className="perm-celula">
              <Caixa label={e.label} checked={rascunho[e.campo]} disabled={!editavel} onChange={v => onChange({ ...rascunho, [e.campo]: v })} />
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
