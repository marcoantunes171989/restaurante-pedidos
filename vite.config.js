import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Carimba o sw.js com o timestamp do build → o conteúdo muda a cada deploy,
// fazendo o navegador (e o PWA instalado no Windows) detectar a atualização.
function carimbarServiceWorker() {
  return {
    name: 'stamp-service-worker',
    closeBundle() {
      const swPath = resolve('dist/sw.js')
      try {
        let s = readFileSync(swPath, 'utf8')
        s = s.replace(/__BUILD_TIME__/g, String(Date.now()))
        writeFileSync(swPath, s)
      } catch (e) {
        console.warn('Não foi possível carimbar o sw.js:', e.message)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), carimbarServiceWorker()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
