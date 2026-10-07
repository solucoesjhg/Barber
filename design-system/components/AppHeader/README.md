# AppHeader

Barra superior: botão do menu, breadcrumb, busca e notificações. Escrito a partir de `src/components/layout/AppLayout.tsx`.

## Props
`pageName`, `sidebarOpen`, `onToggleSidebar`, `onSearch`, `searchPlaceholder`, `hasNotifications`.

## Detalhes
Altura `header-height`, fundo `bg`, borda `chrome-border`. Breadcrumb "BarberOS › Página" em 12px. Busca e sino sobre `surface-inset` com borda `control-border`.

## Mobile
Padding lateral de 14px, a busca some, e o botão do menu acompanha a gaveta aberta (desliza 220px).
