import { useState } from 'react'

export type Tema = 'dark' | 'light'

const CHAVE = 'barber-tema'

/** Tema salvo neste navegador (o index.html já aplica antes de pintar a tela). */
export function temaAtual(): Tema {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

function aplicar(tema: Tema) {
  if (tema === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem(CHAVE, tema) } catch { /* navegador sem storage: vale só nesta aba */ }
}

export function useTema() {
  const [tema, setTema] = useState<Tema>(temaAtual)
  function alternar() {
    const novo: Tema = tema === 'light' ? 'dark' : 'light'
    aplicar(novo)
    setTema(novo)
  }
  return { tema, alternar }
}
