BarberOS é um ERP para barbearias com visual **minimalista premium monocromático**: preto, cinzas e branco, sem cores vibrantes. A hierarquia vem de opacidade, bordas finas e da serifa dos títulos, não de cor.

## Conteúdo e tom

- Escreva em português do Brasil, direto e curto. Trate o usuário de forma informal e neutra ("Peça para um administrador te vincular em Usuários.").
- Botões de ação começam com verbo ou "Novo/Nova" em Title Case: "Novo Cliente", "Novo Agendamento", "Salvar", "Cancelar".
- Em modais, mostre o atalho de teclado no próprio rótulo: "Salvar (F10)", "Cancelar (Esc)".
- Rótulos de campo e cabeçalhos de tabela são escritos normalmente e ficam em caixa alta pelo CSS (`.label`, `.table th`, `.badge`).
- Estados de carregamento e vazios são frases curtas com ponto final: "Carregando...", "Sem vendas no mês.".
- Valores em real com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` (R$ 1.280,00); datas em dd/mm/aaaa e data-hora como "07/10/2026 às 14:30".
- Contadores sob o título usam ponto médio: "12 ativos · 48 cadastrados".
- Sem emoji em lugar nenhum.

## Cor

- Fundo da página em `bg`; cards e modais em `surface`; inputs em `surface-2`. A sidebar fica um tom acima do fundo, em `sidebar-bg`.
- Texto principal em `text` (branco). Texto secundário, labels e células de tabela em `text-muted`.
- `text-dim`, `text-faint` e `text-ghost` são usados no código para placeholders, sublegendas e estados vazios, mas ficam abaixo de 4,5:1 sobre `bg`. Use-os só para informação dispensável; para qualquer texto que o usuário precise ler, use `text-muted`.
- Bordas: `border` por padrão, `border-strong` em hover e foco. Divisórias do chrome (sidebar, cabeçalho) em `chrome-border`.
- Estados de status (pendente, confirmado, concluído, cancelado) se distinguem por opacidade, borda e borda tracejada, nunca por cor. Veja Badge.
- `success` e `danger` existem apenas na tela de login (ponto online e mensagem de erro). Não introduza cor em outras telas.
- Ênfase máxima é inverter: fundo `text` (branco) com texto `bg`, como no botão primário.

## Tipografia

- Títulos (h1–h3) em Playfair Display 600 (`serif`): `display` para a saudação do Dashboard, `page-title` para o h1 de cada página, `modal-title` para modais.
- Todo o resto em DM Sans (`sans`): `body` 14px é o padrão; `body-sm` 13px para navegação e listas; `caption` 12px para textos auxiliares.
- Números de destaque em DM Sans 700 com tracking negativo (`stat-value`, `stat-value-sm`), nunca em serifa.
- `label`, `overline` e `badge` são sempre caixa alta com tracking positivo.
- As duas famílias vêm do Google Fonts (não há arquivos de fonte no repositório).

## Espaço, raio e forma

- Página: `space-page` (40px) no desktop, `space-card-sm` (16px) no mobile, largura máxima 1400px.
- Cards com padding `space-card`; modais com `space-modal`; campos empilhados a `space-stack`; label e input a `space-field`.
- Raios: `radius` (8px) para botões, inputs e itens de navegação; `radius-lg` (12px) para cards e modais; `radius-pill` para badges.
- Controles têm altura mínima `control-height` (44px); botões de ícone são quadrados de `icon-button`.
- Sombras são raras: o desenho se apoia em bordas de 1px. Use `shadow-glow` só no hover do botão primário e `shadow-card-hover` na glow-card.

## Estados e movimento

- Hover: superfícies ganham `surface` e a borda passa a `border-strong`; o botão primário sobe 1px.
- Foco: contorno `focus-ring` de 1,5px com offset de 2px em todo `:focus-visible`.
- Desabilitado: opacidade 0,35 e sem clique.
- Transições curtas (0,15–0,25s). Entradas com framer-motion: fade + subida de 8–16px, curva `cubic-bezier(0.25, 0.46, 0.45, 0.94)`, 0,2–0,38s; listas em cascata de 0,055s.

## Layout

- Estrutura do app: `Sidebar` à esquerda (220px, colapsável) + cabeçalho de `header-height` com breadcrumb "BarberOS › Página", busca e notificações + conteúdo em `.page`.
- Cada página abre com `PageHeader`: título serifado, contador abaixo e a ação principal à direita.
- Monte telas com os componentes React em `window.BarberOS` (`AppLayout`, `PageHeader`, `StatGrid` + `StatCard`, `Table`, `Modal`, `Field`, `Button`, `Badge`). Eles já trazem o comportamento mobile; não reescreva os estilos inline.

## Mobile

- O ponto de quebra é **768px**, o mesmo do app. Abaixo dele:
- `Sidebar` vira gaveta sobreposta, fechada por padrão, com fundo `overlay`; fecha ao tocar fora ou ao navegar.
- `AppHeader` perde a busca e fica com padding de 14px; o botão do menu acompanha a gaveta.
- `.page` passa a ter padding de 16px; `PageHeader` quebra a linha e o título cai para 20px.
- `StatGrid` fica sempre em 2 colunas (gap de 10px) e os `StatCard` encolhem o valor para 20px.
- `Table` esconde o cabeçalho e transforma cada linha num card com o rótulo de cada coluna.
- `Modal` encosta embaixo da tela, rola por dentro e empilha os botões com o primário em cima.
- As cores não mudam no celular: a mesma paleta monocromática do desktop.
- Alvos de toque com no mínimo 44px (`control-height`); botões de ícone com 36px.

## Iconografia

- Ícones da biblioteca lucide-react, traço fino: `strokeWidth` 1.75 por padrão, 2.2 no item ativo da navegação, 2.5 no "+" dos botões primários.
- Tamanhos de 12 a 16px: 14px em botões, 15px na navegação, 16px em stat cards.
- Ícones em `text-muted` ou `text-faint`; nunca coloridos.

## Logo

- Use `assets/Logos/barberos-logo.png`, monograma branco sobre fundo transparente. Aplique apenas sobre `bg`, `sidebar-bg` ou `surface`.
- Na sidebar o logo tem 32px, ao lado do nome "BarberOS" em `body-sm` 600 e do selo "ERP".

---

**Não sincronizado** (solucoesjhg/barber@4fab183): o repositório não tem biblioteca de componentes React, então os 14 componentes de `components/bundle.js` foram escritos à mão a partir das classes de `src/index.css` e dos estilos inline de `Sidebar.tsx`, `AppLayout.tsx`, `Dashboard.tsx`, `Clientes.tsx`, `ContasPagar.tsx` e `ContaFinanceiraModal.tsx`, sem framer-motion (as animações de entrada não estão no bundle). Adições para mobile que não existem no código: o fundo da gaveta (`.mobile-sidebar-backdrop` não tinha tamanho), o modal encostado embaixo com botões empilhados, e o ajuste de padding/valor do StatCard. Ficaram de fora: as regras responsivas específicas de PDV e Agenda, o estilo próprio da tela de Login, `src/App.css` (resto do template Vite) e `public/favicon.svg`, `public/icons.svg`, `src/assets/*` (arquivos do template, não da marca). Sem arquivos de fonte: DM Sans e Playfair Display vêm do Google Fonts.
