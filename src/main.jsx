import { StrictMode, useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './landing/LandingPage.jsx'
import InstallPrompt from './InstallPrompt.jsx'

// ═══════════════════════════════════════════════════════════
//  PWA Update Manager — Pedido Prime
//
//  Regras principais:
//  1. Banner SÓ aparece quando há versão NOVA real (SW diferente do atual).
//     - Nunca aparece na primeira instalação (sem controller anterior).
//     - Nunca aparece se o app já está na versão mais recente.
//  2. "Atualizar": aplica o SW waiting → limpa caches → recarrega.
//  3. Retry automático se o update falhar (rede instável).
//  4. Verifica ao abrir, a cada 5 min, ao voltar online e ao sair do standby.
// ═══════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 5 * 60 * 1000   // 5 minutos
const RETRY_INTERVAL_MS = 30 * 1000        // 30s entre retries
const MAX_RETRIES       = 5

let swReg      = null
let retryCount = 0
let retryTimer = null

// Verifica se há SW waiting (nova versão real baixada mas não aplicada ainda)
function temNovaVersao() {
  return !!(swReg?.waiting)
}

// Aplica SW waiting: pede skipWaiting para ele assumir o controle
function aplicarWaiting(reg) {
  const sw = reg?.waiting
  if (!sw) return
  sw.postMessage({ type: 'SKIP_WAITING' })
}

// Verifica update no servidor; em falha, agenda retry
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

// Background Sync: ao voltar online dispara checkUpdate
async function registrarBgSync(reg) {
  try { if ('SyncManager' in window) await reg.sync.register('check-update') } catch {}
  try {
    if ('periodicSync' in reg) {
      const perm = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(()=>({state:'denied'}))
      if (perm.state === 'granted')
        await reg.periodicSync.register('hourly-update', { minInterval: 60 * 60 * 1000 })
    }
  } catch {}
}

// Aplica nova versão: skipWaiting + limpa cache + reload
async function aplicarAtualizacao() {
  aplicarWaiting(swReg)
  // Aguarda um tick para o SW assumir controle antes de limpar o cache
  await new Promise(r => setTimeout(r, 120))
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch {}
  window.location.reload()
}

// ── Inicializa o SW e expõe callback onNovaVersao ────────────
async function iniciarSW(onNovaVersao) {
  if (!('serviceWorker' in navigator)) return

  // Flag: havia um SW controlando a página ANTES deste registro?
  // Se não havia (primeira instalação), o SW que ativar NÃO é uma "atualização".
  const hadPreviousController = !!navigator.serviceWorker.controller

  try {
    swReg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })

    // ── Caso 1: há SW waiting ao carregar (estava offline, voltou com deploy pendente)
    if (swReg.waiting && hadPreviousController) {
      // Não aplica automaticamente — avisa o usuário para ele decidir
      onNovaVersao()
    }

    // ── Caso 2: novo SW encontrado durante a sessão
    swReg.addEventListener('updatefound', () => {
      const sw = swReg.installing
      if (!sw) return
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // Há um controlador anterior → é uma atualização real
          onNovaVersao()
        }
      })
    })

    // ── Caso 3: SW recém-ativado notifica (mas só conta se havia controller antes)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data) return
      if ((e.data.type === 'SW_UPDATED' || e.data.type === 'SYNC_UPDATE_CHECKED')
          && hadPreviousController) {
        onNovaVersao()
      }
    })

    // ── Ao trocar de SW controlador (controllerchange): recarrega automaticamente
    // Isso acontece após aplicarWaiting → garante que todos usem a versão nova
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })

    // ── Verificações periódicas ──
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
      retryCount++
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => iniciarSW(onNovaVersao), RETRY_INTERVAL_MS)
    }
  }
}

// ── Banner "Nova versão disponível" ─────────────────────────
function UpdateBanner({ onAtualizar }) {
  const [visivel, setVisivel] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  if (!visivel) return null

  async function handleAtualizar() {
    setAtualizando(true)
    await aplicarAtualizacao()
    // Se reload não acontecer em 3s, exibe estado de erro
    setTimeout(() => setAtualizando(false), 3000)
  }

  return (
    <div role="alert"
      className="fixed bottom-20 left-1/2 z-[300] -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm">
      <div className="flex items-center gap-3 rounded-3xl border border-blue-400/30 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl">
        <span className={`text-2xl ${atualizando ? 'animate-spin' : ''}`}>🔄</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Nova versão disponível</p>
          <p className="text-xs text-slate-400">
            {atualizando ? 'Aplicando atualização...' : 'Atualize para ter as últimas novidades.'}
          </p>
        </div>
        {!atualizando && (
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setVisivel(false)}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/10 transition">
              Depois
            </button>
            <button onClick={handleAtualizar}
              className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-black text-white hover:bg-blue-400 transition active:scale-95">
              Atualizar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Roteamento simples (sem react-router) ────────────────────
function Root() {
  const [path, setPath]           = useState(window.location.pathname)
  const [showUpdate, setShowUpdate] = useState(false)
  const notifiedRef               = useRef(false) // evita notificar duas vezes

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    iniciarSW(() => {
      if (notifiedRef.current) return // garante exibição única por sessão
      notifiedRef.current = true
      setShowUpdate(true)
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
      {showUpdate && <UpdateBanner onAtualizar={aplicarAtualizacao} />}
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <InstallPrompt />
  </StrictMode>,
)
