# Sidebar

Navegação lateral: logo, itens, grupos recolhíveis e usuário no rodapé. Escrito a partir de `src/components/layout/Sidebar.tsx`.

## Props
`items`, `groups` (`{ label, icon, items }`), `footerItems`, `active` (rota), `user` (`{ name, role }`), `logoSrc`, `hidden`, `onNavigate(item)`, `onSignOut`.

## Detalhes
Largura `sidebar-width`, fundo `sidebar-bg`, divisórias `chrome-border`. Item inativo `text-dim`, hover `text-muted` sobre `hover-tint`, ativo `text` sobre `active-tint` com ponto branco. Grupos em `text-group`, abrem sozinhos quando contêm a rota ativa.

## Mobile
Vira gaveta fixa sobre o conteúdo com `shadow`, fundo `overlay` atrás (tocar fecha) e fecha sozinha ao navegar quando usada dentro de `AppLayout`.
