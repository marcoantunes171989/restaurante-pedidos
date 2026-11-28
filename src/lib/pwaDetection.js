// ════════════════════════════════════════════════════════════
//  Detecção do ambiente PWA — Pedido Prime.
//
//  Funções PURAS (sem listeners, sem efeito colateral) — testáveis
//  isoladamente (ver pwaDetection.test.js) e reaproveitadas por quem
//  precisa saber plataforma/standalone (ex.: notificacoes.js,
//  accessControl/deviceInfo.js).
//
//  Projeto é JS puro (sem TypeScript em nenhum outro arquivo) — o
//  "tipo" abaixo é só documentação via JSDoc, não checado em build.
// ════════════════════════════════════════════════════════════

// ── Executando como aplicativo (display-mode) ──────────────────
// Qualquer um destes sinais já é suficiente — não dependemos de um só.
export function ehStandalone() {
  const mm = (q) => { try { return window.matchMedia?.(q)?.matches === true; } catch { return false; } };
  if (mm("(display-mode: standalone)")) return true;
  if (mm("(display-mode: fullscreen)")) return true;
  if (mm("(display-mode: minimal-ui)")) return true;
  if (mm("(display-mode: window-controls-overlay)")) return true;
  // Ecossistema Apple: navigator.standalone só existe no Safari/iOS.
  if (typeof navigator !== "undefined" && typeof navigator.standalone === "boolean") return navigator.standalone;
  // Android TWA/apps que abrem via intent costumam chegar com esse referrer.
  if (typeof document !== "undefined" && document.referrer?.startsWith("android-app://")) return true;
  return false;
}

// ── Plataforma (só pra adaptar textos/instruções — nunca decide
//    sozinha se está instalado) ──────────────────────────────────
export function detectarPlataforma(ua = (typeof navigator !== "undefined" ? navigator.userAgent : "")) {
  ua = ua || "";
  const maxTouch = (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0) || 0;
  const plataformaNav = (typeof navigator !== "undefined" ? navigator.platform : "") || "";

  const isIOS = /iP(hone|ad|od)/.test(ua) || (plataformaNav === "MacIntel" && maxTouch > 1);
  const isAndroid = /Android/.test(ua);
  const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
  const isWindows = /Windows/.test(ua);

  const so = isIOS ? "ios" : isAndroid ? "android" : isMac ? "mac" : isWindows ? "windows" : "outro";

  const isEdge = /Edg\//.test(ua);
  const isSamsung = /SamsungBrowser/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);
  const isChrome = !isEdge && !isSamsung && /Chrome|CriOS/.test(ua);
  const isSafari = !isChrome && !isEdge && !isFirefox && !isSamsung && /Safari/.test(ua);

  const navegador = isEdge ? "edge" : isSamsung ? "samsung" : isFirefox ? "firefox" : isChrome ? "chrome" : isSafari ? "safari" : "outro";

  return { so, navegador };
}
