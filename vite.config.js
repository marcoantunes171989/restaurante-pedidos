import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

// Versão do sistema = mesmo commit que aparece na Vercel (7 caracteres).
// Em produção (Vercel) usa VERCEL_GIT_COMMIT_SHA; localmente usa o git local.
function versaoApp() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try { return execSync('git rev-parse --short=7 HEAD').toString().trim() } catch { return 'local' }
}
const APP_VERSAO = versaoApp()

// Carimba o sw.js com o timestamp do build (muda a cada deploy → o navegador
// detecta a atualização) e com a versão (commit) para o banner mostrar qual
// versão será aplicada.
function carimbarServiceWorker() {
  return {
    name: 'stamp-service-worker',
    closeBundle() {
      const swPath = resolve('dist/sw.js')
      try {
        let s = readFileSync(swPath, 'utf8')
        s = s.replace(/__BUILD_TIME__/g, String(Date.now()))
        s = s.replace(/__APP_VERSION__/g, APP_VERSAO)
        writeFileSync(swPath, s)
      } catch (e) {
        console.warn('Não foi possível carimbar o sw.js:', e.message)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), carimbarServiceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSAO),
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})
