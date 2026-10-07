# Modal

Diálogo sobre fundo escurecido para criar ou editar um registro, com Esc e F10. Escrito a partir de `src/components/ContaFinanceiraModal.tsx`.

```js
h(BarberOS.Modal, { title: 'Nova Conta Financeira', onClose, onSave, saving },
  h(BarberOS.Field, { label: 'Nome' }))
```

## Detalhes
Fundo `overlay`; clicar fora fecha. Painel `.card` com `maxWidth` (padrão 380) e padding `space-modal`. Com `onSave`, o rodapé tem "Cancelar (Esc)" e "Salvar (F10)", e os atalhos de teclado ficam ativos. `error` aparece acima do rodapé.

## Mobile
O painel encosta embaixo da tela com 12px de margem, padding 20px, rola por dentro quando é alto, e os botões empilham com "Salvar" em cima.
