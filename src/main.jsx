import { StrictMode, useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './landing/LandingPage.jsx'
import PwaBanner from './PwaBanner.jsx'   // único componente de banner PWA

// ══════════════════════════════════════════════════════════════
//  SW Manager — registra, monitora atualizações e aplica quando
//  a página pede (via callback onAtualizar passado ao PwaBanner)
// ══════════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 5 * 60 * 1000
const RETRY_INTERVAL_MS = 30 * 1000
const MAX_RETRIES       = 5

let swReg      = null
let retryCount = 0
let retryTimer = null

async function checkUpdate(reg) {
  if (!reg) return
  try { await reg.update(); retryCount = 0; clearTimeout(retryTimer) }
  catch {
    if (retryCount < MAX_RETRIES) {
      retryCount++
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => checkUpdate(reg), RETRY_INTERVAL_MS)
    }
  }
}

async function registrarBgSync(reg) {
  try { if ('SyncManager' in window) await reg.sync.register('check-update') } catch {}
  try {
    if ('periodicSync' in reg) {
      const p = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => ({ state: 'denied' }))
      if (p.state === 'granted') await reg.periodicSync.register('hourly-update', { minInterval: 3600000 })
    }
  } catch {}
}

// Aplica o SW waiting + aguarda controllerchange + recarrega
async function aplicarAtualizacao() {
  if (!swReg?.waiting) return
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
      resolve()
    }, { once: true })
    swReg.waiting.postMessage({ type: 'SKIP_WAITING' })
    setTimeout(() => { window.location.reload(); resolve() }, 3000) // fallback
  })
}

// Registra o SW e chama onSwWaiting quando há versão nova aguardando
async function iniciarSW(onSwWaiting) {
  if (!('serviceWorker' in navigator)) return
  try {
    swReg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })

    // Ao recarregar: SW já estava waiting (deploy ocorreu com app offline)
    if (swReg.waiting) onSwWaiting()

    // Novo SW entra em "waiting" durante a sessão
    swReg.addEventListener('updatefound', () => {
      const sw = swReg.installing
      if (!sw) return
      sw.addEventListener('statechange', () => {
        // "installed" = SW baixado e pronto, aguardando skipWaiting
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          onSwWaiting()
        }
      })
    })

    // Quando o SW ativado notifica (ex: voltou de BgSync)
    navigator.serviceWorker.addEventListener('message', (e) => {
      // SW_ATIVADO = uma nova versão acabou de assumir → recarrega silenciosamente
      if (e.data?.type === 'SW_ATIVADO') window.location.reload()
    })

    // Ao navegar para outra URL, aplica SW waiting silenciosamente
    // (assim a próxima página já usa a nova versão sem interrupção)
    window.addEventListener('pagehide', () => {
      swReg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })

    await checkUpdate(swReg)
    setInterval(() => checkUpdate(swReg), CHECK_INTERVAL_MS)

    window.addEventListener('online', () => {
      navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_UPDATE' })
      checkUpdate(swReg)
      registrarBgSync(swReg)
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkUpdate(swReg)
    })

    await registrarBgSync(swReg)
  } catch {
    if (retryCount < MAX_RETRIES) {
      retryCount++; clearTimeout(retryTimer)
      retryTimer = setTimeout(() => iniciarSW(onSwWaiting), RETRY_INTERVAL_MS)
    }
  }
}

// ── Roteamento simples ────────────────────────────────────────
function Root() {
  const [path, setPath]     = useState(window.location.pathname)
  const [swWaiting, setSwWaiting] = useState(false)
  const notifiedRef         = useRef(false)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    iniciarSW(() => {
      if (notifiedRef.current) return
      notifiedRef.current = true
      setSwWaiting(true)
    })
  }, [])

  const navigate = useCallback((to) => {
    if (to === window.location.pathname) return
    window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }, [])

  const ehSistema = /^\/(login|app|sistema)(\/|$)/.test(path)

  return (
    <>
      {ehSistema ? <App /> : <LandingPage navigate={navigate} />}
      <PwaBanner
        hasUpdate={swWaiting}
        onAtualizar={aplicarAtualizacao}
      />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
