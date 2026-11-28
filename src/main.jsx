import { StrictMode, Component, Suspense, lazy, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { solicitarNavegacaoInterna } from './lib/historicoNavegacao'
import { guardarPromptInstalacao, limparPromptInstalacao } from './lib/pwaInstallBridge'

// Cada porta de entrada baixa só o que usa: site, sistema ou cardápio.
const App = lazy(() => import('./App.jsx'))
const LandingPage = lazy(() => import('./landing/LandingPage.jsx'))
const CardapioPublico = lazy(() => import('./CardapioPublico.jsx'))

// Espera leve enquanto o código da tela é baixado (sem depender de outros módulos).
function Abrindo() {
  return (
    <div role="status" aria-label="Carregando" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
      <span className="pp-load-ring" style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(1,46,70,0.12)', borderTopColor: '#012E46' }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  SW Manager
// ══════════════════════════════════════════════════════════════

const CHECK_INTERVAL_MS = 20 * 1000 // verifica atualização a cada 20s (rápido p/ PWA instalado)
const RETRY_INTERVAL_MS = 30 * 1000
const MAX_RETRIES       = 5

let swReg       = null
let retryCount  = 0
let retryTimer  = null
let recarregando = false // evita loop de reload quando o novo SW assume (após confirmação manual)

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

async function iniciarSW() {
  if (!('serviceWorker' in navigator)) return
  try {
    swReg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })

    const verificarAtualizacao = async () => { await checkUpdate(swReg) }

    // controllerchange: outro SW assumiu o controle (ciclo de vida padrão do
    // navegador — acontece sozinho quando todas as abas da versão antiga
    // fecham). Sem aviso/confirmação manual: só recarrega para já servir a
    // versão nova.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recarregando) return
      recarregando = true
      window.location.reload()
    })

    // Clique numa notificação push: abre a tela certa sem recarregar o app.
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data) return
      if (e.data.type === 'NOTIFICACAO_CLICADA' && typeof e.data.rota === 'string' && e.data.rota.startsWith('/')) {
        const noSistema = /^\/(login|app|sistema|admin|operacional)(\/|$)/.test(window.location.pathname)
        if (noSistema) solicitarNavegacaoInterna(e.data.rota)
        else window.location.assign(e.data.rota)
      }
    })

    await verificarAtualizacao()
    setInterval(verificarAtualizacao, CHECK_INTERVAL_MS)

    window.addEventListener('online', () => {
      navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_UPDATE' })
      verificarAtualizacao()
      registrarBgSync(swReg)
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') verificarAtualizacao()
    })
    // Ao focar a janela do app (clicar de volta no PWA) → verifica na hora
    window.addEventListener('focus', verificarAtualizacao)
    // Em cada navegação interna do app → também verifica (oportunidade rápida)
    window.addEventListener('pageshow', verificarAtualizacao)

    await registrarBgSync(swReg)
  } catch {
    if (retryCount < MAX_RETRIES) {
      retryCount++; clearTimeout(retryTimer)
      retryTimer = setTimeout(() => iniciarSW(), RETRY_INTERVAL_MS)
    }
  }
}

// ── Root ─────────────────────────────────────────────────────
function Root() {
  const [path, setPath]         = useState(window.location.pathname)
  const ehSistema               = /^\/(login|app|sistema|admin|operacional)(\/|$)/.test(path)
  const ehCardapio              = /^\/cardapio(\/|$)/.test(path)
  // Usuário autenticado nunca cai na landing pelo "voltar": qualquer rota
  // (inclusive "/") com sessão ativa renderiza o App (que mantém a tela atual).
  const sessaoAtiva             = (() => { try { return sessionStorage.getItem('pp_sessao_ativa') === '1' } catch { return false } })()

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) return
    // Cardápio público (cliente externo via link/QR): NÃO registrar service worker.
    // Cliente seguindo um link de divulgação não deve instalar PWA/cache — isso fazia
    // o navegador normal servir uma versão antiga (ex.: categoria não carregava), enquanto
    // o modo anônimo (sem SW) funcionava. Aqui ainda removemos qualquer SW/cache já preso.
    if (ehCardapio) {
      if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          const tinhaControle = regs.length > 0 && !!navigator.serviceWorker.controller
          return Promise.all(regs.map((r) => r.unregister())).then(() => {
            if (window.caches?.keys) caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {})
            // Recupera quem já estava preso a uma versão velha: recarrega UMA vez.
            try {
              if (tinhaControle && !sessionStorage.getItem('pp_cardapio_sw_limpo')) {
                sessionStorage.setItem('pp_cardapio_sw_limpo', '1')
                window.location.reload()
              }
            } catch {}
          })
        }).catch(() => {})
      }
      return
    }
    iniciarSW()
  }, [])

  // ── Ponte do prompt nativo de instalação (beforeinstallprompt) ──────────
  // Sem diálogo/sugestão de instalação em nenhuma tela — só guarda o evento
  // para o botão "Instalar o Pedido Prime" dentro de Configurações de
  // notificação (NotificationSettings.jsx, via pwaInstallBridge), que o usa
  // quando a ativação de push exige o app instalado.
  useEffect(() => {
    const onBIP = (e) => { e.preventDefault(); guardarPromptInstalacao(e) }
    const onInstalled = () => limparPromptInstalacao()
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // ── Campo focado sempre visível acima do teclado (todo o projeto) ───────────
  // Ao focar qualquer input/textarea/select, rola o campo para a área visível
  // (centralizado), evitando que o teclado do celular o esconda.
  useEffect(() => {
    const onFocus = (e) => {
      const el = e.target
      if (!el || typeof el.matches !== 'function' || !el.matches('input, textarea, select')) return
      if (el.dataset && el.dataset.noScroll === '1') return
      setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {} }, 280)
    }
    window.addEventListener('focusin', onFocus)
    return () => window.removeEventListener('focusin', onFocus)
  }, [])

  // ── Tela cheia PERSISTENTE no app instalado (desktop) ───────
  // O app deve abrir e permanecer em tela cheia em TODAS as telas, reentrando
  // após navegações/recarregamentos (no próximo gesto, sem oscilar). Só sai de
  // tela cheia se o usuário pressionar Esc.
  // Obs.: o aviso "pressione Esc para sair" é UI nativa do navegador exibida ao
  // entrar em tela cheia — não é removível por código.
  useEffect(() => {
    if (!ehStandaloneLocal()) return
    if (/Android|iPhone|iPad|iPod/.test(navigator.userAgent)) return // mobile já é tela cheia

    const KEY = 'pp_fs_usuario_saiu' // '1' = usuário saiu (Esc) → não reentrar
    const usuarioSaiu = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }
    const marcarSaiu  = (v) => { try { v ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY) } catch {} }

    // Pede tela cheia (no-op se já estiver, ou se o usuário tiver saído com Esc).
    const pedirFullscreen = () => {
      if (document.fullscreenElement || usuarioSaiu()) return
      const el = document.documentElement
      const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen
      try { fn?.call(el)?.catch?.(() => {}) } catch {}
    }

    // Qualquer gesto reentra na tela cheia se ela tiver caído (ex.: após reload).
    // A guarda document.fullscreenElement impede oscilação: já em tela cheia,
    // nada acontece.
    const onGesto = () => pedirFullscreen()

    // Saída pelo Esc → para de reentrar até o usuário voltar manualmente (F11).
    const onKeyEsc = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) marcarSaiu(true)
    }

    // Ao entrar em tela cheia (inclusive via F11 manual), limpa a marca → volta
    // a manter tela cheia nas próximas telas.
    const onFsChange = () => { if (document.fullscreenElement) marcarSaiu(false) }

    // Tenta já no carregamento (alguns navegadores aceitam logo após abrir o PWA)
    pedirFullscreen()

    window.addEventListener('pointerdown', onGesto)
    window.addEventListener('keydown', onGesto)
    window.addEventListener('keydown', onKeyEsc, true)
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)

    return () => {
      window.removeEventListener('pointerdown', onGesto)
      window.removeEventListener('keydown', onGesto)
      window.removeEventListener('keydown', onKeyEsc, true)
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  const navigate = useCallback((to) => {
    if (to === window.location.pathname) return
    window.history.pushState({}, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }, [])

  // O badge de versão é exibido apenas na TELA DE LOGIN (dentro de <App/>),
  // não na landing nem nas demais telas.
  // Cardápio digital público (cliente externo) — sem banner PWA/instância
  if (ehCardapio) return <Suspense fallback={<Abrindo />}><CardapioPublico /></Suspense>

  return (
    <Suspense fallback={<Abrindo />}>
      {(ehSistema || sessaoAtiva) ? <App /> : <LandingPage navigate={navigate} />}
    </Suspense>
  )
}

// ErrorBoundary RAIZ: qualquer erro de render do app (inclusive no <App/>) mostra
// uma mensagem com o erro + botão de recarregar — em vez de uma tela preta.
class RootErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { erro: null } }
  static getDerivedStateFromError(erro) { return { erro } }
  componentDidCatch(erro, info) { console.error('Erro fatal de render:', erro, info) }
  async recuperar() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.()
      if (reg?.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } catch { /* o recarregamento ainda funciona sem cache/SW */ }
    const url = new URL(window.location.href)
    url.searchParams.set('recuperar', Date.now().toString())
    window.location.replace(url.toString())
  }
  render() {
    if (this.state.erro) {
      return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#012E46', color: '#e2e8f0', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ maxWidth: 520, width: '100%', border: '1px solid rgba(248,113,113,.3)', background: 'rgba(239,68,68,.08)', borderRadius: 24, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 34 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '8px 0' }}>Ops! Algo deu errado ao abrir esta tela</h1>
            <p style={{ fontSize: 14, color: '#cbd5e1' }}>Tente recarregar. Se continuar, envie a mensagem abaixo ao suporte.</p>
            <pre style={{ marginTop: 12, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, color: '#fca5a5', background: 'rgba(0,0,0,.3)', borderRadius: 12, padding: 12, maxHeight: 200, overflow: 'auto' }}>{String(this.state.erro?.stack || this.state.erro?.message || this.state.erro)}</pre>
            <button onClick={() => this.recuperar()} style={{ marginTop: 16, background: '#F38525', color: '#0A1424', fontWeight: 800, border: 'none', borderRadius: 16, padding: '12px 20px', cursor: 'pointer' }}>Recarregar versão atual</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <Root />
    </RootErrorBoundary>
  </StrictMode>,
)
