import { detectarPlataforma, ehStandalone } from "../pwaDetection.js";

/**
 * Extrai informações técnicas do ambiente para auditoria de sessão.
 * Função pura + leitura opcional de navigator (quando disponível).
 */
export function coletarInfoDispositivo(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  const raw = ua || "";
  const lower = raw.toLowerCase();
  const plat = detectarPlataforma(raw);

  let deviceType = "Desktop";
  if (/mobile|iphone|android.*mobile/.test(lower)) deviceType = "Smartphone";
  else if (/ipad|tablet|android(?!.*mobile)/.test(lower)) deviceType = "Tablet";
  else if (/macintosh|mac os x/.test(lower) && (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0) > 1) {
    deviceType = "Tablet";
  }

  const osMap = {
    windows: "Windows",
    mac: "macOS",
    ios: "iOS",
    android: "Android",
    outro: /linux/.test(lower) ? "Linux" : "Outro",
  };
  const browserMap = {
    chrome: "Chrome",
    edge: "Edge",
    firefox: "Firefox",
    safari: "Safari",
    samsung: "Samsung Internet",
    outro: "Outro",
  };

  let browserVersion = "";
  const m =
    raw.match(/Edg\/([\d.]+)/) ||
    raw.match(/Chrome\/([\d.]+)/) ||
    raw.match(/Firefox\/([\d.]+)/) ||
    raw.match(/Version\/([\d.]+).*Safari/) ||
    raw.match(/CriOS\/([\d.]+)/);
  if (m) browserVersion = m[1];

  const isPwa = typeof window !== "undefined" ? ehStandalone() : false;

  return {
    deviceType,
    deviceName: deviceType,
    os: osMap[plat.so] || "Outro",
    browser: browserMap[plat.navegador] || "Outro",
    browserVersion,
    isPwa,
    userAgent: raw.slice(0, 500),
  };
}

export function rotuloDispositivo(sessao) {
  const parts = [sessao?.os, sessao?.browser].filter(Boolean);
  if (sessao?.isPwa) parts.push("PWA");
  return parts.length ? parts.join(" • ") : (sessao?.deviceType || "—");
}

export function mascararIp(ip) {
  if (!ip || ip === "—" || ip === "unknown") return "—";
  const v4 = String(ip).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return `${v4[1]}.${v4[2]}.xxx.xxx`;
  // IPv6: mascara o final
  if (String(ip).includes(":")) {
    const segs = String(ip).split(":");
    return segs.slice(0, 3).join(":") + ":xxxx";
  }
  return ip;
}

export function formatarLocalizacao(sessao) {
  const parts = [sessao?.city, sessao?.state, sessao?.country].filter(Boolean);
  return parts.length ? parts.join(" / ") : "—";
}
