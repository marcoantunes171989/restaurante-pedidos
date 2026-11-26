// ════════════════════════════════════════════════════════════
//  Código de barras CODE-128C da chave de acesso (DANFE NF-e).
//  Fonte: MOC 7.0 — Anexo II (Manual de Especificações Técnicas do DANFE e
//  Código de Barras, v7.00, out/2020): item 2 (estrutura, larguras mínimas),
//  2.1 (DV módulo 103 com o START C = 105) e Anexo III.01 (tabela de barras,
//  valores 00–99 extraídos do PDF; cada símbolo soma 11 módulos).
// ════════════════════════════════════════════════════════════

export const CODE128C_BARRAS = Object.freeze(["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  // 100 a 102 (ISO/IEC 15417: CODE B, CODE A e FNC1): não representam dígitos, mas o DV (módulo 103) vai de 0 a 102.
  "114131","311141","411131"]);
export const CODE128C_START = "211232"; // valor 105
export const CODE128C_STOP = "2331112";
const START_VALOR = 105;

/** Dígito verificador (módulo 103) — item 2.1. */
export function dvCode128c(digitos) {
  const s = String(digitos);
  if (!/^([0-9]{2})+$/.test(s)) throw new Error("CODE-128C exige quantidade par de dígitos.");
  let soma = START_VALOR;
  for (let i = 0; i < s.length / 2; i++) soma += (i + 1) * Number(s.slice(i * 2, i * 2 + 2));
  return soma % 103;
}

/** Larguras (em módulos) alternando barra/espaço, começando por barra. */
export function modulosCode128c(digitos) {
  const s = String(digitos);
  const dv = dvCode128c(s);
  const simbolos = [CODE128C_START];
  for (let i = 0; i < s.length; i += 2) simbolos.push(CODE128C_BARRAS[Number(s.slice(i, i + 2))]);
  simbolos.push(CODE128C_BARRAS[dv], CODE128C_STOP);
  return simbolos.join("").split("").map(Number);
}

/**
 * SVG do código de barras. Margem clara de 10 módulos de cada lado (item 2).
 * @param {string} digitos  chave de acesso (44 dígitos)
 * @param {object} [o] { larguraMm = 85, alturaMm = 10 } — mínimos: 6 cm de largura e 0,8 cm de altura.
 */
export function svgCode128c(digitos, { larguraMm = 85, alturaMm = 10 } = {}) {
  const m = modulosCode128c(digitos);
  const total = m.reduce((a, b) => a + b, 0) + 20;
  let x = 10;
  let barras = "";
  m.forEach((w, i) => {
    if (i % 2 === 0) barras += `<rect x="${x}" y="0" width="${w}" height="1"/>`;
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras da chave de acesso" width="${larguraMm}mm" height="${alturaMm}mm" viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="1" fill="#fff"/><g fill="#000">${barras}</g></svg>`;
}
