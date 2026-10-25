import { useEffect, useMemo, useRef, useState } from 'react'
import { UserCheck, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export interface ClienteResumo { id: string; nome: string; telefone?: string | null }

let cache: ClienteResumo[] | null = null

/**
 * Nome do cliente da venda com sugestões dos clientes cadastrados (nome
 * ou telefone). Escolher um liga a venda a ele; digitar outro nome
 * desfaz a ligação (cliente avulso).
 */
export default function ClienteBusca({ nome, clienteId, onChange, placeholder = 'Nome do cliente (opcional)' }: {
  nome: string
  clienteId: string | null
  onChange: (nome: string, clienteId: string | null) => void
  placeholder?: string
}) {
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
      {aberto && sugestoes.length > 0 && (
        <div className="cliente-busca-lista" role="listbox">
          {sugestoes.map((c, i) => (
            <button
              key={c.id} type="button" role="option" aria-selected={i === marcado}
              className={i === marcado ? 'marcado' : undefined}
              onMouseDown={e => { e.preventDefault(); escolher(c) }}
            >
              <span className="texto-cortado">{c.nome}</span>
              {c.telefone && <span className="subtexto">{c.telefone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
