import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './landing/LandingPage.jsx'
import InstallPrompt from './InstallPrompt.jsx'

// ── PWA: registra o service worker (instalação + auto-atualização) ──
// Só em produção (Vercel/HTTPS) para não interferir no dev/HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Verifica novas versões periodicamente (sincroniza com o instalador)
      setInterval(() => reg.update(), 60 * 60 * 1000)
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing
        sw && sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) reg.waiting?.postMessage('SKIP_WAITING')
        })
      })
    }).catch(() => {})
  })
}

// Roteamento simples por pathname (sem dependências externas):
//  - "/" ou "/landing"  → Landing page pública
//  - "/login", "/app", "/sistema" (e subrotas) → Sistema (App existente)
function Root() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (to) => {
    if (to === window.location.pathname) return
    window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }

  const ehSistema = /^\/(login|app|sistema)(\/|$)/.test(path)
  return ehSistema ? <App /> : <LandingPage navigate={navigate} />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
    <InstallPrompt />
  </StrictMode>,
)
