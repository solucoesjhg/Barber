import { useEffect, useMemo, useRef, useState } from 'react'
import { UserCheck, UserPlus, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { exibirTelefone, mascaraTelefone } from '../../lib/mascaras'

export interface ClienteResumo { id: string; nome: string; telefone?: string | null }

let cache: ClienteResumo[] | null = null

/**
 * Nome do cliente da venda com sugestões dos clientes cadastrados (nome
 * ou telefone). Escolher um liga a venda a ele; digitar outro nome
 * desfaz a ligação (cliente avulso). Quem não está cadastrado pode ser
 * cadastrado ali mesmo (nome e telefone).
 */
export default function ClienteBusca({ nome, clienteId, onChange, placeholder = 'Nome do cliente (opcional)', exigirCadastro = false }: {
  nome: string
  clienteId: string | null
  onChange: (nome: string, clienteId: string | null) => void
  placeholder?: string
  /** Fiado: avisa que precisa ser um cliente cadastrado. */
  exigirCadastro?: boolean
}) {
  const [cadastrando, setCadastrando] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function cadastrar() {
    const n = nome.trim()
    if (n.length < 2) { setErro('Digite o nome do cliente.'); return }
    if (telefone.replace(/\D/g, '').length < 8) { setErro('Informe o telefone (com DDD).'); return }
    setSalvando(true); setErro('')
    const { data, error } = await supabase.from('clientes').insert({ nome: n, telefone: telefone.trim() }).select('id, nome, telefone').single()
    setSalvando(false)
    if (error || !data) { setErro(error?.message ?? 'Não foi possível cadastrar.'); return }
    const novo = data as ClienteResumo
    cache = [...(cache ?? clientes), novo].sort((a, b) => a.nome.localeCompare(b.nome))
    setClientes(cache)
    setCadastrando(false); setTelefone('')
    onChange(novo.nome, novo.id)
  }
  const [clientes, setClientes] = useState<ClienteResumo[]>(cache ?? [])
  const [aberto, setAberto] = useState(false)
  const [marcado, setMarcado] = useState(0)
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cache) return
    supabase.from('clientes').select('id, nome, telefone').order('nome').limit(2000)
      .then(({ data }) => { cache = (data ?? []) as ClienteResumo[]; setClientes(cache) })
  }, [])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!caixaRef.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const termoLivre = nome.trim().length >= 2 && !clienteId
  const nomeExato = clientes.some(c => c.nome.trim().toLowerCase() === nome.trim().toLowerCase())
  const sugestoes = useMemo(() => {
    const termo = nome.trim().toLowerCase()
    if (!termo || clienteId) return []
    const digitos = termo.replace(/\D/g, '')
    return clientes.filter(c =>
      c.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(digitos)),
    ).slice(0, 8)
  }, [nome, clienteId, clientes])

  function escolher(c: ClienteResumo) {
    onChange(c.nome, c.id)
    setAberto(false)
  }

  return (
    <div ref={caixaRef} className="cliente-busca">
      <input
        className="input"
        style={{ fontSize: '13px', paddingRight: clienteId ? '34px' : undefined }}
        placeholder={placeholder}
        value={nome}
        onChange={e => { onChange(e.target.value, null); setAberto(true); setMarcado(0) }}
        onFocus={() => setAberto(true)}
        onKeyDown={e => {
          if (!aberto || sugestoes.length === 0) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado(m => Math.min(m + 1, sugestoes.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado(m => Math.max(m - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); escolher(sugestoes[marcado]) }
          else if (e.key === 'Escape') setAberto(false)
        }}
        aria-autocomplete="list"
      />
      {clienteId && (
        <span className="cliente-busca-ligado" title="Cliente cadastrado">
          <UserCheck size={13} />
          <button type="button" aria-label="Desligar do cliente cadastrado" onClick={() => onChange(nome, null)}><X size={11} /></button>
        </span>
      )}
      {exigirCadastro && !clienteId && !cadastrando && (
        <p className="subtexto" style={{ marginTop: '4px', color: '#f59e0b' }}>Precisa ser um cliente cadastrado: escolha na lista ou cadastre.</p>
      )}
      {cadastrando && !clienteId && (
        <div className="cliente-busca-cadastro">
          <p style={{ fontSize: '12px', color: 'var(--c-a3)' }}>Cadastrar <strong style={{ color: 'var(--text)' }}>{nome.trim() || 'cliente'}</strong></p>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input className="input" style={{ fontSize: '13px', flex: 1 }} placeholder="Telefone com DDD" inputMode="tel" value={telefone} onChange={e => setTelefone(mascaraTelefone(e.target.value))} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); cadastrar() } }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={cadastrar} disabled={salvando}>{salvando ? '...' : 'Salvar'}</button>
            <button type="button" className="btn btn-icon" aria-label="Cancelar cadastro" onClick={() => { setCadastrando(false); setErro('') }} style={{ width: '32px', height: '32px' }}><X size={12} /></button>
          </div>
          {erro && <p style={{ fontSize: '11px', color: '#ef4444' }}>{erro}</p>}
        </div>
      )}
      {aberto && !cadastrando && (sugestoes.length > 0 || (termoLivre && !nomeExato)) && (
        <div className="cliente-busca-lista" role="listbox">
          {sugestoes.map((c, i) => (
            <button
              key={c.id} type="button" role="option" aria-selected={i === marcado}
              className={i === marcado ? 'marcado' : undefined}
              onMouseDown={e => { e.preventDefault(); escolher(c) }}
            >
              <span className="texto-cortado">{c.nome}</span>
              {c.telefone && <span className="subtexto">{exibirTelefone(c.telefone)}</span>}
            </button>
          ))}
          {termoLivre && !nomeExato && (
            <button type="button" className="cliente-busca-novo" onMouseDown={e => { e.preventDefault(); setCadastrando(true); setAberto(false); setErro('') }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><UserPlus size={13} /> Cadastrar “{nome.trim()}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
