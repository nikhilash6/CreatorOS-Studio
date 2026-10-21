import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// En développement (npm run dev) le front est servi par Vite mais l'API et les
// médias vivent dans le backend Fastify : on les relaie. En production, un seul
// process sert tout (server/index.js) et ce proxy n'a plus cours.
const BACKEND = process.env.CREATOROS_BACKEND || 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/media': { target: BACKEND, changeOrigin: true },
    },
  },
})
