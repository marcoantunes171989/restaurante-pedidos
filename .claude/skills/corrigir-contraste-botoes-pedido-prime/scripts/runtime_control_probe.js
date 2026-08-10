/**
 * Sonda runtime de contraste/conteúdo para controles do Pedido Prime.
 *
 * Uso no DevTools / Playwright page.evaluate:
 *   const { probeControls } = await import('/scripts/runtime_control_probe.js');
 *   // ou cole o IIFE no console:
 *   probeControls({ selector: 'button, [role="tab"], .filter-chip' })
 *
 * Também pode ser injetado via:
 *   node -e "..." não aplica — precisa do DOM da página.
 *
 * Retorna achados de alta confiança: texto ausente, cor≈fundo, branco sobre
 * laranja, petróleo sobre petróleo, só ponto/ícone sem rótulo.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PedidoPrimeControlProbe = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PETROLEO = { r: 1, g: 46, b: 70 };
  const LARANJA = { r: 243, g: 133, b: 37 };
  const BRANCO = { r: 255, g: 255, b: 255 };

  function parseColor(input) {
    if (!input || input === "transparent" || input === "rgba(0, 0, 0, 0)") return null;
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillStyle = input;
    const computed = ctx.fillStyle;
    if (computed.startsWith("#")) {
      const hex = computed.slice(1);
      const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
        a: 1,
      };
    }
    const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  }

  function near(a, b, tol = 18) {
    if (!a || !b) return false;
    return Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
  }

  function luminance(c) {
    if (!c) return 0;
    const ch = ["r", "g", "b"].map((k) => {
      const v = c[k] / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  function contrastRatio(fg, bg) {
    if (!fg || !bg) return null;
    const L1 = luminance(fg);
    const L2 = luminance(bg);
    const hi = Math.max(L1, L2);
    const lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function visibleText(el) {
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return t;
  }

  function accessibleName(el) {
    return (
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      el.getAttribute("aria-labelledby") ||
      visibleText(el) ||
      ""
    ).trim();
  }

  function pseudoStyle(el, which) {
    try {
      const s = getComputedStyle(el, which);
      return {
        content: s.content,
        color: s.color,
        backgroundColor: s.backgroundColor,
        display: s.display,
        width: s.width,
        height: s.height,
      };
    } catch {
      return null;
    }
  }

  function describe(el) {
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const color = parseColor(cs.color);
    const bg = parseColor(cs.backgroundColor);
    const text = visibleText(el);
    const name = accessibleName(el);
    const issues = [];

    if (rect.width < 2 || rect.height < 2) {
      issues.push("dimensoes-quase-zero");
    }
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) {
      issues.push("oculto-por-estilo");
    }
    if (!text || text === ".") {
      const hasIcon = !!el.querySelector("svg, img, [class*='icon'], [aria-hidden='true']");
      if (hasIcon && !name) issues.push("so-icone-sem-nome-acessivel");
      if (!hasIcon && !name) issues.push("sem-rotulo");
      if (text === ".") issues.push("rotulo-ponto");
    }
    if (near(color, bg, 12)) issues.push("fg-igual-bg");
    if (near(bg, LARANJA) && near(color, BRANCO, 30)) issues.push("branco-sobre-laranja");
    if (near(bg, PETROLEO) && near(color, PETROLEO, 20)) issues.push("petroleo-sobre-petroleo");
    if (near(bg, LARANJA) && near(color, LARANJA, 20)) issues.push("laranja-sobre-laranja");

    const ratio = contrastRatio(color, bg && bg.a > 0.2 ? bg : null);
    if (ratio != null && ratio < 3) issues.push(`contraste-baixo:${ratio.toFixed(2)}`);

    const children = Array.from(el.querySelectorAll("*")).slice(0, 40).map((child) => {
      const ccs = getComputedStyle(child);
      const cColor = parseColor(ccs.color);
      const cBg = parseColor(ccs.backgroundColor);
      const cIssues = [];
      if (near(cColor, cBg, 12)) cIssues.push("fg-igual-bg");
      if (near(bg, LARANJA) && near(cColor, BRANCO, 30)) cIssues.push("branco-sobre-laranja-herdado");
      if (near(cBg, LARANJA) && near(cColor, BRANCO, 30)) cIssues.push("branco-sobre-laranja");
      if ((child.textContent || "").trim() === ".") cIssues.push("rotulo-ponto");
      return {
        tag: child.tagName.toLowerCase(),
        className: String(child.className || "").slice(0, 160),
        text: (child.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
        color: ccs.color,
        backgroundColor: ccs.backgroundColor,
        fontSize: ccs.fontSize,
        opacity: ccs.opacity,
        issues: cIssues,
      };
    }).filter((c) => c.issues.length || (c.text && c.text.length <= 2));

    return {
      tag: el.tagName.toLowerCase(),
      className: String(el.className || "").slice(0, 220),
      id: el.id || null,
      role: el.getAttribute("role"),
      ariaPressed: el.getAttribute("aria-pressed"),
      ariaSelected: el.getAttribute("aria-selected"),
      text: text.slice(0, 120),
      accessibleName: name.slice(0, 120),
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      fill: cs.fill,
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
      fontSize: cs.fontSize,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      contrastRatio: ratio,
      before: pseudoStyle(el, "::before"),
      after: pseudoStyle(el, "::after"),
      issues,
      childrenWithSignals: children,
    };
  }

  function probeControls(options = {}) {
    const {
      selector = 'button, [role="button"], [role="tab"], .filter-chip, a.btn-laranja, a.btn-petroleo',
      root = document,
      onlyIssues = true,
      limit = 200,
    } = options;
    const nodes = Array.from(root.querySelectorAll(selector)).slice(0, limit);
    const results = nodes.map(describe);
    const filtered = onlyIssues
      ? results.filter((r) => r.issues.length || r.childrenWithSignals.some((c) => c.issues.length))
      : results;
    return {
      scanned: nodes.length,
      conflicts: filtered.length,
      items: filtered,
      summary: filtered.reduce((acc, item) => {
        item.issues.forEach((i) => { acc[i] = (acc[i] || 0) + 1; });
        item.childrenWithSignals.forEach((c) => c.issues.forEach((i) => {
          acc[`child:${i}`] = (acc[`child:${i}`] || 0) + 1;
        }));
        return acc;
      }, {}),
    };
  }

  function probeOne(el) {
    if (!el) return null;
    return describe(el);
  }

  return { probeControls, probeOne, parseColor, contrastRatio };
});
