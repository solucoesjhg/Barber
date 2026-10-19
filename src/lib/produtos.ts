// Colunas de produtos que a API deixa ler. preco_custo fica de fora
// (privilégio de coluna no banco): quem pode ver o custo recebe pela
// RPC custos_produtos(). "select('*')" em produtos dá erro de permissão.
export const COLUNAS_PRODUTO =
  'id, nome, categoria, preco_venda, estoque_atual, estoque_minimo, estoque_maximo, ativo, sku, unidade, comissao_percentual, empresa_id, foto_url'
