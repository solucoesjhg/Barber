# Design system BarberOS

Cópia dos arquivos do design system (tokens, CSS e componentes React) gerada a partir deste repositório.

- `README.md`: guia de marca e regras de uso (cor, tipografia, espaço, mobile).
- `tokens.json` / `tokens.css`: tokens de cor, tipo, espaço, raio, sombra e tamanho.
- `components/bundle.js` + `components/bundle.css`: componentes React em `window.BarberOS` (script clássico, usa `window.React`).
- `components/index.d.ts`: props de cada componente.
- `components/<Nome>/preview.html`: prévia de cada componente; `components/<Nome>/README.md`: guia.

O app em `src/` não importa estes arquivos; eles servem de referência e para protótipos.
