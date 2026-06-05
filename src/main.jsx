import { StrictMode, useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './landing/LandingPage.jsx'
import PwaBanner from './PwaBanner.jsx'

// ══════════════════════════════════════════════════════════════
//  SW Manager
// ══════════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 20 * 1000 // verifica atualização a cada 20s (rápido p/ PWA instalado)
const RETRY_INTERVAL_MS = 30 * 1000
const MAX_RETRIES       = 5

let swReg       = null
let retryCount  = 0
let retryTimer  = null
let recarregando = false // evita loop de reload quando o novo SW assume

function ehStandaloneLocal() {
  if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
  if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) return true;
  if (typeof navigator.standalone === "boolean") return navigator.standalone;
  return false;
}

async function checkUpdate(reg) {
  if (!reg) return
  try { await reg.update(); retryCount = 0; clearTimeout(retryTimer) }
  catch {
    if (retryCount < MAX_RETRIES) {
      retryCount++; clearTimeout(retryTimer)
      retryTimer = setTimeout(() => checkUpdate(reg), RETRY_INTERVAL_MS)
    }
  }
}

async function registrarBgSync(reg) {
  try { if ('SyncManager' in window) await reg.sync.register('check-update') } catch {}
  try {
    if ('periodicSync' in reg) {
      const p = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => ({ state: 'denied' }))
      if (p.state === 'granted') await reg.periodicSync.register('hourly-update', { minInterval: 3_600_000 })
    }
  } catch {}
}

async function iniciarSW(onAtivado) {
  if (!('serviceWorker' in navigator)) return
  try {
    swReg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })

    // updatefound: novo SW sendo instalado → ao ficar "installed" (com um
    // controlador já existente = atualização real), mostra o banner no app.
    swReg.addEventListener('updatefound', () => {
      const sw = swReg.installing
      if (!sw) return
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          if (ehStandaloneLocal()) onAtivado()
        }
      })
    })
    // Se já havia um SW aguardando ao abrir (deploy ocorreu com o app fechado)
    if (swReg.waiting && navigator.serviceWorker.controller && ehStandaloneLocal()) onAtivado()

    // controllerchange: o novo SW assumiu o controle.
    //  - PWA instalado (standalone): mostra o banner "Atualizar" (opção visível).
    //  - Navegador: recarrega silenciosamente (transparente).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (ehStandaloneLocal()) {
        onAtivado() // exibe o banner com o botão "Atualizar"
      } else {
        if (recarregando) return
        recarregando = true
        window.location.reload()
      }
    })

    // Mensagens do SW
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data) return
      // SW_ATIVADO (novo código) ou SW_UPDATED (compat. backward)
      // Em standalone: onAtivado() mostra banner
      // No browser: já foi tratado pelo controllerchange acima
      if (e.data.type === 'SW_ATIVADO' || e.data.type === 'SW_UPDATED') {
        if (ehStandaloneLocal()) onAtivado()
      }
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
    // Ao focar a janela do app (clicar de volta no PWA) → verifica na hora
    window.addEventListener('focus', () => checkUpdate(swReg))
    // Em cada navegação interna do app → também verifica (oportunidade rápida)
    window.addEventListener('pageshow', () => checkUpdate(swReg))

    await registrarBgSync(swReg)
  } catch {
    if (retryCount < MAX_RETRIES) {
      retryCount++; clearTimeout(retryTimer)
      retryTimer = setTimeout(() => iniciarSW(onAtivado), RETRY_INTERVAL_MS)
    }
  }
}

// ── Root ─────────────────────────────────────────────────────
function Root() {
  const [path, setPath]         = useState(window.location.pathname)
  const [swAtivado, setSwAtivado] = useState(false)
  const notifiedRef             = useRef(false)

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
      setSwAtivado(true)
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
      <PwaBanner swAtivado={swAtivado} />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
