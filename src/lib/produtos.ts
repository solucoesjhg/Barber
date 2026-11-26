// Colunas de produtos que a API deixa ler. preco_custo fica de fora
// (privilégio de coluna no banco): quem pode ver o custo recebe pela
// RPC custos_produtos(). "select('*')" em produtos dá erro de permissão.
export const COLUNAS_PRODUTO =
  'id, nome, categoria, preco_venda, estoque_atual, estoque_minimo, estoque_maximo, ativo, sku, unidade, comissao_percentual, empresa_id, foto_url'

/** Caminho do arquivo no bucket "produtos" a partir da URL pública da foto. */
export function caminhoFotoProduto(url: string): string | null {
  const marcador = '/storage/v1/object/public/produtos/'
  const idx = url.indexOf(marcador)
  return idx === -1 ? null : url.slice(idx + marcador.length)
}
