import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './landing/LandingPage.jsx'
import InstallPrompt from './InstallPrompt.jsx'

// ═══════════════════════════════════════════════════════════
//  PWA Update Manager
//  Garante que o app esteja sempre na versão mais recente,
//  mesmo quando o aparelho ficou offline durante um deploy.
// ═══════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS  = 5 * 60 * 1000   // verifica a cada 5 min
const RETRY_INTERVAL_MS  = 30 * 1000        // retry após falha: 30s
const MAX_RETRIES        = 5               // máximo de tentativas por sessão

let swReg     = null   // referência ao ServiceWorkerRegistration
let retryCount = 0
let retryTimer = null

// Envia mensagem ao SW ativo
function msgSW(type, payload = {}) {
  if (navigator.serviceWorker?.controller)
    navigator.serviceWorker.controller.postMessage({ type, ...payload })
}

// Tenta aplicar um SW waiting (novo app instalado mas aguardando)
function aplicarWaiting(reg) {
  if (!reg?.waiting) return
  reg.waiting.postMessage({ type: 'SKIP_WAITING' })
}

// Verifica update; em caso de falha, agenda retry
async function checkUpdate(reg) {
  if (!reg) return
  try {
    await reg.update()
    retryCount = 0
    clearTimeout(retryTimer)
  } catch {
    if (retryCount < MAX_RETRIES) {
      retryCount++
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => checkUpdate(reg), RETRY_INTERVAL_MS)
    }
  }
}

// Registra Background Sync para disparar check quando voltar online
async function registrarBgSync(reg) {
  try {
    if ('SyncManager' in window) await reg.sync.register('check-update')
  } catch { /* não suportado ou permissão negada — ok */ }
  // Periodic Background Sync (Chrome/Edge desktop)
  try {
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' })
      if (status.state === 'granted')
        await reg.periodicSync.register('hourly-update', { minInterval: 60 * 60 * 1000 })
    }
  } catch { /* opcional */ }
}

// ── Ponto de entrada do PWA ──────────────────────────────────
async function iniciarSW(onUpdate) {
  if (!('serviceWorker' in navigator)) return

  try {
    swReg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })

    // Se já há um SW waiting ao abrir (voltou online com deploy pendente)
    if (swReg.waiting) {
      aplicarWaiting(swReg)
    }

    // Novo SW encontrado durante a sessão
    swReg.addEventListener('updatefound', () => {
      const next = swReg.installing
      if (!next) return
      next.addEventListener('statechange', () => {
        if (next.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // Há um controlador anterior → aplica imediatamente e notifica
            aplicarWaiting(swReg)
            onUpdate()
          }
        }
      })
    })

    // SW notificou que foi ativado (mensagem SW_UPDATED)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data) return
      if (e.data.type === 'SW_UPDATED' || e.data.type === 'SYNC_UPDATE_CHECKED') {
        onUpdate()
      }
    })

    // Verificação periódica
    await checkUpdate(swReg)
    setInterval(() => checkUpdate(swReg), CHECK_INTERVAL_MS)

    // Ao voltar online: verifica update imediatamente
    window.addEventListener('online', () => {
      msgSW('CHECK_UPDATE')
      checkUpdate(swReg)
      registrarBgSync(swReg)
    })

    // Ao entrar em visibilidade: verifica update (ex.: tablet ficou em standby)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkUpdate(swReg)
    })

    await registrarBgSync(swReg)

  } catch (err) {
    // Falha no registro → retry
    if (retryCount < MAX_RETRIES) {
      retryCount++
      retryTimer = setTimeout(() => iniciarSW(onUpdate), RETRY_INTERVAL_MS)
    }
  }
}

// ── Banner "Nova versão disponível" ──────────────────────────
function UpdateBanner({ onReload }) {
  const [visivel, setVisivel] = useState(true)
  if (!visivel) return null
  return (
    <div
      role="alert"
      className="fixed bottom-20 left-1/2 z-[300] -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="flex items-center gap-3 rounded-3xl border border-blue-400/30 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl">
        <span className="text-2xl">🔄</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Nova versão disponível</p>
          <p className="text-xs text-slate-400">Atualize para ter as últimas novidades.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setVisivel(false)}
            className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/10 transition"
          >
            Depois
          </button>
          <button
            onClick={onReload}
            className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-black text-white hover:bg-blue-400 transition active:scale-95"
          >
            Atualizar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Roteamento simples (sem react-router) ────────────────────
function Root() {
  const [path, setPath]       = useState(window.location.pathname)
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Registra SW só em produção
  useEffect(() => {
    if (import.meta.env.PROD) {
      iniciarSW(() => setShowUpdate(true))
    }
  }, [])

  const navigate = useCallback((to) => {
    if (to === window.location.pathname) return
    window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }, [])

  const handleReload = useCallback(() => {
    window.location.reload()
  }, [])

  const ehSistema = /^\/(login|app|sistema)(\/|$)/.test(path)
  return (
    <>
      {ehSistema ? <App /> : <LandingPage navigate={navigate} />}
      {showUpdate && <UpdateBanner onReload={handleReload} />}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <InstallPrompt />
  </StrictMode>,
)
