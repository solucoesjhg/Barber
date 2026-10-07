# PageHeader

Cabeçalho de página: título serifado, contador e a ação principal à direita. Escrito a partir de `src/pages/Clientes.tsx`. `<BarberOS.PageHeader title="Clientes" subtitle="12 ativos · 48 cadastrados" action={…Button…} />`.

## Props
`title`, `subtitle` (contador com ponto médio, `text-faint`), `eyebrow` (linha em caixa alta acima, como a data do Dashboard), `action`.

## Mobile
A linha quebra: o botão desce para baixo do título, o título cai para 20px e a margem inferior para 20px.
