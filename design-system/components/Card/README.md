# Card

Contêiner de superfície: card, card-sm e glow-card clicável. `<BarberOS.Card variant="glow" onClick={…}>…</BarberOS.Card>`. Classes de `src/index.css`.

## Variantes
- `default` (`.card`): fundo `surface`, borda `border`, raio `radius-lg`, padding `space-card`.
- `sm` (`.card-sm`): raio `radius`, padding `space-card-sm`.
- `glow` (`.card .glow-card`): clicável, leva a outra tela. Sobe 2px no hover e ganha um brilho que segue o mouse (o componente já atualiza `--mx`/`--my`).

## Não faça
Borda lateral colorida, gradiente de cor.
