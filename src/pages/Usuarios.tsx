import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../hooks/usePerfil'
import { formatDate } from '../lib/utils'
import type { UsuarioListado, PapelUsuario, Profissional, Empresa } from '../types'

const PAPEL_LABEL: Record<PapelUsuario, string> = {
  super_admin: 'Super Admin', administrador: 'Administrador', gerente: 'Gerente', atendente: 'Atendente', profissional: 'Profissional',
}

export default function Usuarios() {
  const { papel: meuPapel } = usePerfil()
  const souSuperAdmin = meuPapel === 'super_admin'

  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([])
  const [profissionais, setProfissionais] = useState<Profissional[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  function carregar() {
    setLoading(true)
    supabase.rpc('listar_usuarios').then(({ data, error: err }) => {
      if (err) { setError(err.message); setLoading(false); return }
      setUsuarios((data ?? []) as UsuarioListado[])
      setLoading(false)
    })
    if (souSuperAdmin) {
      supabase.from('empresas').select('*').eq('ativo', true).order('nome')
        .then(({ data }) => { if (data) setEmpresas(data as Empresa[]) })
    } else {
      supabase.from('profissionais').select('*').order('nome')
        .then(({ data }) => { if (data) setProfissionais(data as Profissional[]) })
    }
  }

  useEffect(() => { carregar() }, [souSuperAdmin])

  async function salvar(u: UsuarioListado, campo: 'papel' | 'profissional_id' | 'ativo' | 'empresa_id', valor: string | boolean) {
    const atualizado = { ...u, [campo]: valor === '' ? null : valor }
    setUsuarios(prev => prev.map(x => x.usuario_id === u.usuario_id ? atualizado : x))
    setSavingId(u.usuario_id)
    const { error: err } = await supabase.rpc('atualizar_papel_usuario', {
      p_usuario_id: u.usuario_id,
      p_papel: atualizado.papel,
      p_profissional_id: atualizado.profissional_id || null,
      p_ativo: atualizado.ativo,
      p_empresa_id: atualizado.empresa_id || null,
    })
    setSavingId(null)
    if (err) { setError(err.message); carregar(); return }
    carregar()
  }

  const colunas = souSuperAdmin
    ? '1fr 140px 200px 100px'
    : '1fr 140px 180px 80px 100px'

  return (
    <div className="page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', color: '#FFFFFF' }}>Usuários</h1>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
          {souSuperAdmin
            ? 'Vincule cada login a uma loja — papel, profissional e ativo/inativo ficam por conta da gerência de cada loja'
            : 'Papéis, profissional vinculado e ativo/inativo da sua equipe'}
        </p>
      </div>

      {error && <p style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>{error}</p>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: colunas,
          padding: '10px 24px', borderBottom: '1px solid #222',
          fontSize: '10px', fontWeight: 600, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <span>E-mail</span>
          <span>Papel</span>
          {souSuperAdmin ? <span>Loja</span> : <span>Vinculado a</span>}
          {!souSuperAdmin && <span>Ativo</span>}
          <span>Desde</span>
        </div>

        {loading ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>Carregando...</div>
        ) : usuarios.length === 0 ? (
          <div style={{ padding: '56px', textAlign: 'center', color: '#444', fontSize: '13px' }}>
            Nenhum usuário encontrado (ou você não tem permissão pra ver essa tela).
          </div>
        ) : usuarios.map((u, i) => (
          <motion.div
            key={u.usuario_id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
            style={{
              display: 'grid', gridTemplateColumns: colunas,
              padding: '12px 24px', alignItems: 'center',
              borderBottom: i < usuarios.length - 1 ? '1px solid #1A1A1A' : 'none',
              opacity: savingId === u.usuario_id ? 0.6 : 1,
            }}
          >
            <div>
              <span style={{ fontSize: '13px', color: '#FFFFFF' }}>{u.email}</span>
              {souSuperAdmin && !u.empresa_id && u.papel !== 'super_admin' && (
                <p style={{ fontSize: '10px', color: '#A3A3A3' }}>aguardando vínculo com uma loja</p>
              )}
            </div>

            {souSuperAdmin ? (
              <span style={{ fontSize: '12px', color: '#A3A3A3' }}>{PAPEL_LABEL[u.papel]}</span>
            ) : (
              <select
                className="input"
                style={{ fontSize: '12px', padding: '6px 8px' }}
                value={u.papel}
                onChange={e => salvar(u, 'papel', e.target.value)}
                disabled={u.papel === 'super_admin'}
              >
                {Object.entries(PAPEL_LABEL)
                  .filter(([k]) => k !== 'super_admin')
                  .map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            )}

            {souSuperAdmin ? (
              <select
                className="input"
                style={{ fontSize: '12px', padding: '6px 8px' }}
                value={u.empresa_id ?? ''}
                onChange={e => salvar(u, 'empresa_id', e.target.value)}
              >
                <option value="">Sem loja</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nome}</option>)}
              </select>
            ) : (
              <select
                className="input"
                style={{ fontSize: '12px', padding: '6px 8px' }}
                value={u.profissional_id ?? ''}
                onChange={e => salvar(u, 'profissional_id', e.target.value)}
              >
                <option value="">Nenhum profissional</option>
                {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}

            {!souSuperAdmin && (
              <input type="checkbox" checked={u.ativo} onChange={e => salvar(u, 'ativo', e.target.checked)} />
            )}
            <span style={{ fontSize: '12px', color: '#444' }}>{formatDate(u.criado_em)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
