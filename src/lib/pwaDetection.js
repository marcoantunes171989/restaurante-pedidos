// ════════════════════════════════════════════════════════════
//  Detecção do ambiente PWA — Pedido Prime.
//
//  Funções PURAS (sem listeners, sem efeito colateral) — testáveis
//  isoladamente (ver pwaDetection.test.js) e reaproveitadas pelo hook
//  usePwaEnvironment.js, que é quem escuta os eventos do navegador e
//  decide QUANDO chamá-las.
//
//  Projeto é JS puro (sem TypeScript em nenhum outro arquivo) — o
//  "tipo" abaixo é só documentação via JSDoc, não checado em build.
// ════════════════════════════════════════════════════════════

/**
 * @typedef {"checking"|"running-as-app"|"installed-detected"|"installable-native"|"ios-manual-install"|"manual-install"|"unknown"} PwaEnvironmentStatus
 */

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

/**
 * Decide o PwaEnvironmentStatus a partir dos sinais já coletados —
 * função pura, sem tocar em window/navigator diretamente, pra poder
 * testar cada combinação sem precisar simular o navegador inteiro.
 *
 * @param {{ standalone: boolean, apiInstalado: boolean|null, apiDisponivel: boolean, temPromptNativo: boolean, so: string }} sinais
 * @returns {PwaEnvironmentStatus}
 */
export function avaliarStatus({ standalone, apiInstalado, apiDisponivel, temPromptNativo, so }) {
  if (standalone) return "running-as-app";
  if (apiInstalado === true) return "installed-detected";
  if (temPromptNativo) return "installable-native";
  if (so === "ios") return "ios-manual-install";
  // API existe e respondeu "não instalado" com confiança (Chrome/Edge
  // Windows/Android/Mac) — mas sem beforeinstallprompt (ex.: já
  // descartado pelo Chrome nesta sessão, ou critérios de engajamento
  // ainda não atingidos): orientação manual pelo menu do navegador,
  // não "unknown" (a API deu uma resposta real, só não veio o prompt).
  if (apiDisponivel && apiInstalado === false) return "manual-install";
  return "unknown";
}
