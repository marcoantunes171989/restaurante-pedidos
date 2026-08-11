import { detectarPlataforma, ehStandalone } from "../pwaDetection.js";

/** ID estável do aparelho (localStorage) — usado em bloqueio e sessões. */
export function obterDeviceIdEstavel() {
  try {
    let id = localStorage.getItem("pp_device_id");
    if (!id) {
      id = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("pp_device_id", id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Infere marca e modelo a partir do User-Agent (best-effort).
 * Retorna { brand, model } — model pode repetir o tipo genérico quando UA é opaco.
 */
export function extrairMarcaModelo(ua = "", deviceType = "Desktop") {
  const raw = ua || "";
  const lower = raw.toLowerCase();

  if (/iphone/.test(lower)) return { brand: "Apple", model: "iPhone" };
  if (/ipad/.test(lower)) return { brand: "Apple", model: "iPad" };
  if (/ipod/.test(lower)) return { brand: "Apple", model: "iPod" };
  if (/macintosh|mac os x/.test(lower)) return { brand: "Apple", model: "Mac" };

  // Android: "... Android 14; SM-S911B Build/..." ou "... Android 13; Pixel 7 ..."
  const andMatch = raw.match(/Android\s+[^;]*;\s*([^;)]+?)(?:\s+Build|[;/)]|$)/i);
  if (andMatch) {
    let model = andMatch[1].trim()
      .replace(/\s+wv$/i, "")
      .replace(/^Linux\s+/i, "")
      .trim();
    // UA genérico (Chrome privacy / WebView)
    if (!model || /^(k|u|mobile|tablet|android)$/i.test(model)) {
      return { brand: "Android", model: deviceType === "Tablet" ? "Tablet" : "Smartphone" };
    }
    if (/^sm-|^samsung/i.test(model)) {
      const code = model.replace(/^samsung[\s-]*/i, "").trim() || model;
      return { brand: "Samsung", model: code };
    }
    if (/^pixel/i.test(model)) return { brand: "Google", model };
    if (/^(redmi|mi\s|poco|blackshark)/i.test(model)) return { brand: "Xiaomi", model };
    if (/^(moto|xt\d)/i.test(model)) return { brand: "Motorola", model };
    if (/^(lm-|lg-)/i.test(model)) return { brand: "LG", model };
    if (/^(huawei|honor|lya-|voa-)/i.test(model)) return { brand: "Huawei", model };
    if (/^(oppo|cph|rmx)/i.test(model)) return { brand: "OPPO", model };
    if (/^(vivo|v\d{4})/i.test(model)) return { brand: "vivo", model };
    if (/^oneplus|^kb\d|^le\d/i.test(model)) return { brand: "OnePlus", model };
    if (/^nokia/i.test(model)) return { brand: "Nokia", model };
    if (/^asus|^zenfone/i.test(model)) return { brand: "ASUS", model };
    return { brand: "Android", model };
  }

  if (/windows/.test(lower)) {
    if (/xbox/i.test(raw)) return { brand: "Microsoft", model: "Xbox" };
    if (/surface/i.test(raw)) return { brand: "Microsoft", model: "Surface" };
    return { brand: "PC", model: "Windows" };
  }
  if (/cros/.test(lower)) return { brand: "Google", model: "Chromebook" };
  if (/linux/.test(lower)) return { brand: "PC", model: "Linux" };

  return { brand: null, model: deviceType || "—" };
}

export function formatarMarcaModelo(sessao) {
  const nome = (sessao?.deviceName || "").trim();
  const tipo = (sessao?.deviceType || "").trim();
  if (nome && nome !== tipo && !/^(desktop|notebook|tablet|smartphone)$/i.test(nome)) {
    return nome;
  }
  if (sessao?.userAgent) {
    const { brand, model } = extrairMarcaModelo(sessao.userAgent, tipo || "Desktop");
    const label = [brand, model].filter(Boolean).join(" ").trim();
    if (label) return label;
  }
  return tipo || "—";
}

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
  const { brand, model } = extrairMarcaModelo(raw, deviceType);
  const deviceName = [brand, model].filter(Boolean).join(" ").trim() || deviceType;

  return {
    deviceId: obterDeviceIdEstavel(),
    deviceType,
    deviceName,
    deviceBrand: brand || null,
    deviceModel: model || null,
    os: osMap[plat.so] || "Outro",
    browser: browserMap[plat.navegador] || "Outro",
    browserVersion,
    isPwa,
    userAgent: raw.slice(0, 500),
  };
}

/** Rótulo curto para tabela: marca/modelo em destaque + SO • navegador. */
export function rotuloDispositivo(sessao) {
  const marcaModelo = formatarMarcaModelo(sessao);
  const soft = [sessao?.os, sessao?.browser].filter(Boolean);
  if (sessao?.isPwa) soft.push("PWA");
  const softLabel = soft.join(" • ");
  if (marcaModelo && marcaModelo !== "—") {
    return softLabel ? `${marcaModelo} · ${softLabel}` : marcaModelo;
  }
  return softLabel || (sessao?.deviceType || "—");
}

export function mascararIp(ip) {
  if (!ip || ip === "—" || ip === "unknown") return "—";
  const v4 = String(ip).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) return `${v4[1]}.${v4[2]}.xxx.xxx`;
  if (String(ip).includes(":")) {
    const segs = String(ip).split(":");
    return segs.slice(0, 3).join(":") + ":xxxx";
  }
  return ip;
}

export function formatarLocalizacao(sessao) {
  const parts = [sessao?.city, sessao?.state, sessao?.country].filter(
    (p) => p && String(p).trim() && String(p).trim() !== "—",
  );
  return parts.length ? parts.join(" / ") : "—";
}
