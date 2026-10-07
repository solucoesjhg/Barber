# Button

Botão de ação nas variantes primária, secundária, ghost e de ícone. `<BarberOS.Button variant="primary" icon="plus">Novo Cliente</BarberOS.Button>`. Classes `.btn .btn-<variant>` de `src/index.css`.

## Quando usar
- `primary`: a ação principal da tela ou do modal; uma por contexto. Fundo `text`, texto `bg`, altura `control-height`.
- `secondary`: alternativa (Cancelar, Pagar). Borda `border`.
- `ghost`: ação de baixo peso, texto `text-muted`.
- `icon`: quadrado de `icon-button` só com ícone; passe `title`.
- `size="sm"` (34px, 13px) para ações dentro de linhas de lista; `full` para largura total.

## O que o consumidor fornece
Rótulo em Title Case; `icon` (nome de `Icon`); `onClick`; `disabled` (opacidade 0,35). Em modais, o atalho no rótulo: "Salvar (F10)".

## Mobile
Altura mínima de 44px já atende toque. No rodapé do Modal os botões empilham com o primário em cima.

## Não faça
Botões coloridos ou dois primários lado a lado.
