# StatCard

Card de indicador: ícone, valor grande, rótulo e sublegenda. Escrito a partir de `src/pages/Dashboard.tsx`. `<BarberOS.StatCard icon="calendar" value="12" label="Agendamentos" sub="hoje" onClick={…} />`.

## Variantes
- padrão: ícone 16px num quadrado `icon-tile` de `icon-button`; valor `stat-value` (26px).
- `size="sm"`: ícone 14px solto em `text-faint`; valor `stat-value-sm` (18px); rótulo 11px. Usado nos cards financeiros do mês.
Com `onClick` vira glow-card.

## O que o consumidor fornece
Ícone, valor já formatado (BRL), rótulo, sublegenda e o destino do clique. Coloque vários dentro de `StatGrid`.

## Mobile
Padding 16px e valor 20px para caber duas colunas.
