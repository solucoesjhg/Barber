# Field

Campo de formulário: label em caixa alta sobre um input, select ou textarea. `<BarberOS.Field label="Nome" placeholder="Ex: Banco Itaú" />`. Classes `.field`, `.label`, `.input` de `src/index.css`.

## Props
`label`, `as` (`input` | `select` | `textarea`), `options` para select (`{ value, label }`), `error`, e qualquer atributo de input (`value`, `onChange`, `type`, `id`…).

## Detalhes
Fundo `surface-2`, borda `border` (foco `border-strong`), altura `control-height`, raio `radius`. Placeholder em `text-dim` com exemplo real. Empilhe a `space-stack` (14px). Erro em `caption` `text-dim`.

## Mobile
Ocupa a largura do contêiner; 14px de fonte e 44px de altura.
