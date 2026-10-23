import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  // Site no domínio próprio (barber.solucoesjhg.com.br), servido na raiz.
  // Para voltar a publicar em solucoesjhg.github.io/Barber, use VITE_BASE=/Barber/.
  base: loadEnv(mode, '.', 'VITE_').VITE_BASE || '/',
  plugins: [react(), tailwindcss()],
}))
