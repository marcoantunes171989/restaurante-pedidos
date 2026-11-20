import { defineConfig, loadEnv } from 'vite'
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

// Só em desenvolvimento local, e só se SUPABASE_SERVICE_ROLE_KEY estiver no .env.local (arquivo ignorado pelo git): serve a rota
// /api/fiscal-emitir com o código DESTE repositório (o servidor de emissão novo), para validar a emissão no navegador antes do deploy.
function apiLocalFiscal(env) {
  return {
    name: 'api-local-fiscal',
    apply: 'serve',
    configureServer(server) {
      // Aviso no terminal ao iniciar (só diz se a chave existe; nunca mostra o valor).
      if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        console.log('\n[api-local] Emissão LOCAL INATIVA: falta SUPABASE_SERVICE_ROLE_KEY no .env.local. As chamadas /api vão para o servidor do HML (versão publicada).\n')
        return
      }
      console.log('\n[api-local] Emissão LOCAL ATIVA: /api/fiscal-emitir roda com o código deste repositório, no banco de homologação.\n')
      process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
      process.env.SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL
      server.middlewares.use('/api/fiscal-emitir', async (req, res) => {
        const partes = []
        for await (const parte of req) partes.push(parte)
        req.body = Buffer.concat(partes).toString('utf8')
        try {
          const mod = await server.ssrLoadModule('/api/fiscal-emitir.js')
          await mod.default(req, res)
        } catch (e) {
          console.error('[api-local fiscal-emitir]', e)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: false, erro: 'Falha no servidor local: ' + String(e?.message || e).slice(0, 200) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Só em desenvolvimento local: VITE_DEV_API_PROXY encaminha /api para um servidor já publicado (ex.: o de homologação).
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = env.VITE_DEV_API_PROXY
  const rotaLocal = !!env.SUPABASE_SERVICE_ROLE_KEY // com a chave local, só /api/fiscal-emitir roda aqui; o resto segue pelo proxy
  return {
  plugins: [react(), carimbarServiceWorker(), apiLocalFiscal(env)],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSAO),
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  ...(apiProxy ? { server: { proxy: { '/api': { target: apiProxy, changeOrigin: true, secure: true, bypass: (req) => (rotaLocal && req.url?.startsWith('/api/fiscal-emitir') ? req.url : undefined) } } } } : {}),
  // Valores fictícios exclusivos do Vitest.
  // Evitam depender de .env/segredos reais; src/lib/supabase.js continua fail-closed em runtime.
  test: {
    env: {
      VITE_SUPABASE_URL: 'https://pedido-prime-test.invalid',
      VITE_SUPABASE_ANON_KEY: 'pedido-prime-test-anon-key',
    },
  },
  }
})
