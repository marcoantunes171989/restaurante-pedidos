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

// ══════════════════════════════════════════════════════════════
//  Instância única por computador (Web Locks API)
//  A primeira instância segura um lock exclusivo enquanto a aba viver.
//  Uma segunda instância no mesmo navegador/computador não consegue o lock
//  → é marcada como duplicada e bloqueada.
// ══════════════════════════════════════════════════════════════
let _instanciaPromise = null
let _soltarLock = null // libera o lock segurado por esta página
function checarInstanciaUnica() {
  if (_instanciaPromise) return _instanciaPromise
  _instanciaPromise = new Promise((resolve) => {
    if (!('locks' in navigator)) { resolve(true); return } // navegador sem suporte → permite
    navigator.locks.request('pedido-prime-instancia-unica', { mode: 'exclusive', ifAvailable: true }, (lock) => {
      if (lock) {
        resolve(true)                                  // somos a instância primária
        return new Promise((res) => { _soltarLock = res }) // segura até liberar (pagehide)
      }
      resolve(false)                   // lock já tomado → instância duplicada
      return undefined
    }).catch(() => resolve(true))      // em erro, não bloqueia
  })
  return _instanciaPromise
}
// Libera o lock ao sair/ocultar a página (navegação ou bfcache). Sem isso, ao
// ir do sistema para a landing e voltar, a página antiga (em bfcache) continua
// segurando o lock e a nova é vista como "duplicada" no mesmo computador.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (_soltarLock) { _soltarLock(); _soltarLock = null }
    _instanciaPromise = null // permite readquirir o lock ao voltar/recarregar
  })
}

function useInstanciaUnica(ativo) {
  const [estado, setEstado] = useState('checando') // 'checando' | 'ok' | 'duplicado'
  useEffect(() => {
    if (!ativo) return // só aplica no app/sistema (a landing pública pode ter várias abas)
    let cancel = false
    checarInstanciaUnica().then((primario) => { if (!cancel) setEstado(primario ? 'ok' : 'duplicado') })
    return () => { cancel = true }
  }, [ativo])
  return estado
}

// Versão do sistema (commit da Vercel) — badge discreto no topo de toda tela.
// Permite validar, no aparelho, se a atualizacao foi efetivada (comparar com a Vercel).
const APP_VERSAO = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : 'local'
function VersaoBadge() {
  return (
    <div className="fixed top-0 left-0 z-[400] px-2 py-[3px] pointer-events-none select-none">
      <span className="font-mono text-[11px] tracking-wide text-slate-500">
        Versão: {APP_VERSAO}
      </span>
    </div>
  )
}

function BloqueioInstancia() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 p-6 text-center"
      style={{ height: '100dvh' }}>
      <div className="max-w-sm space-y-4">
        <span className="text-6xl">🔒</span>
        <h1 className="text-2xl font-black text-white">Aplicativo já em execução</h1>
        <p className="text-sm leading-6 text-slate-400">
          Já existe um <b className="text-white">Pedido Prime</b> aberto neste computador.
          Para continuar aqui, feche a outra janela/aba do aplicativo.
        </p>
        <button onClick={() => window.location.reload()}
          className="mt-2 rounded-2xl bg-blue-500 px-6 py-3 text-sm font-black text-white hover:bg-blue-400 transition active:scale-95">
          🔄 Tentar novamente
        </button>
      </div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────
function Root() {
  const [path, setPath]         = useState(window.location.pathname)
  const [swAtivado, setSwAtivado] = useState(false)
  const notifiedRef             = useRef(false)
  const ehSistema               = /^\/(login|app|sistema)(\/|$)/.test(path)
  const instancia               = useInstanciaUnica(ehSistema)

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

  // Segunda instância do app no mesmo computador → bloqueia
  if (ehSistema && instancia === 'duplicado') return (<><BloqueioInstancia /><VersaoBadge /></>)

  return (
    <>
      {ehSistema ? <App /> : <LandingPage navigate={navigate} />}
      <PwaBanner swAtivado={swAtivado} />
      <VersaoBadge />
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
