/**
 * Telefone, CPF e CNPJ sempre no mesmo formato: (11) 99999-9999,
 * 000.000.000-00 e 00.000.000/0000-00. As funções servem para o campo
 * (formatam enquanto digita) e para mostrar o que já estava gravado.
 */
const digitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '')

export function mascaraTelefone(v: string | null | undefined): string {
  let d = digitos(v)
  // +55 colado na frente (copiado do WhatsApp): fica só DDD + número.
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  const ddd = d.slice(0, 2), num = d.slice(2)
  if (num.length <= 4) return `(${ddd}) ${num}`
  // 9 dígitos (celular) vira 5+4; 8 (fixo), 4+4.
  const corte = num.length > 8 ? 5 : 4
  return `(${ddd}) ${num.slice(0, corte)}-${num.slice(corte)}`
}

export function mascaraCpf(v: string | null | undefined): string {
  const d = digitos(v).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

export function mascaraCnpj(v: string | null | undefined): string {
  const d = digitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** CPF até 11 dígitos; passou disso, CNPJ. */
export function mascaraCpfCnpj(v: string | null | undefined): string {
  return digitos(v).length > 11 ? mascaraCnpj(v) : mascaraCpf(v)
}

/** Para mostrar um valor gravado (vazio continua vazio). */
export const exibirTelefone = (v: string | null | undefined) => (digitos(v) ? mascaraTelefone(v) : v ?? '')
export const exibirDocumento = (v: string | null | undefined) => (digitos(v) ? mascaraCpfCnpj(v) : v ?? '')
