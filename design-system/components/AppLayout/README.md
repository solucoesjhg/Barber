# AppLayout

Estrutura do app: Sidebar, AppHeader e a área de conteúdo com .page. Escrito a partir de `src/components/layout/AppLayout.tsx`.

```js
h(BarberOS.AppLayout, { sidebar: { items, groups, active, user, logoSrc, onNavigate }, header: { pageName: 'Clientes' } },
  h(BarberOS.PageHeader, { title: 'Clientes' }), …)
```

## Comportamento
Controla abrir/fechar a sidebar: aberta no desktop, fechada abaixo de 768px (ou `defaultSidebarOpen`). O conteúdo fica num `.page` (padding `space-page`, 16px no mobile, largura máxima 1400px).

## Mobile
Veja as prévias **MobileApp** e **MobileMenu**, em 390px.
