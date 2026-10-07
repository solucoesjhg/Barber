# Table

Lista em grade com cabeçalho; no celular cada linha vira um card com rótulos. Reproduz o padrão `.list-header` / `.list-row` das páginas (ex.: `src/pages/ContasPagar.tsx`).

```js
h(BarberOS.Table, {
  columns: [{ key: 'descricao', label: 'Descrição' }, { key: 'valor', label: 'Valor', width: '110px' }],
  rows: [{ id: 1, descricao: 'Aluguel', valor: 'R$ 3.200,00' }]
})
```

## Props
`columns` (`key`, `label`, `width` do grid, `align`, `render(row)`), `rows`, `loading` ("Carregando..."), `emptyText`.

## Detalhes
Fica dentro de um `.card` sem padding. Cabeçalho 10px caixa alta em `text-ghost` sobre `list-border`; linhas 13px `text-muted` com padding 14px 24px e divisória `chrome-border`; primeira coluna em `text` 500.

## Mobile (≤768px)
O cabeçalho some e cada linha vira um card `surface` com borda `border` e raio `radius-lg`, empilhados a 12px. Da segunda coluna em diante, cada valor ganha o rótulo da coluna ("Fornecedor: …") em `text-dim`.
