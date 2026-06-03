import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './landing/LandingPage.jsx'

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
  </StrictMode>,
)
