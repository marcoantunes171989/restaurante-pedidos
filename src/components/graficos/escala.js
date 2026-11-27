/** Matemática dos gráficos: eixos, rótulos e curvas. Sem React. */

/** Marcas "redondas" de 0 até cobrir o máximo (1, 2, 2,5 ou 5 × 10ⁿ). */
export function ticks(max, quantidade = 4) {
  if (!(max > 0)) return [0, 1];
  const bruto = max / quantidade;
  const base = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * base).find((p) => p >= bruto);
  const n = Math.ceil(max / passo - 1e-9);
  return Array.from({ length: n + 1 }, (_, i) => Number((i * passo).toPrecision(12)));
}

/** Valor curto para eixos: 950 → "950", 12500 → "12,5 mil". */
export function compacto(v) {
  const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${fmt(v / 1e6)} mi`;
  if (abs >= 1e3) return `${fmt(v / 1e3)} mil`;
  return fmt(v);
}

/** Índices dos rótulos do eixo X que cabem na largura sem se sobrepor. */
export function indicesDeRotulo(total, largura, minimoPx = 44) {
  if (total <= 0) return [];
  const cabem = Math.max(1, Math.floor(largura / minimoPx));
  const passo = Math.max(1, Math.ceil(total / cabem));
  return Array.from({ length: total }, (_, i) => i).filter((i) => i % passo === 0);
}

/**
 * Curva cúbica monótona (Fritsch–Carlson): suaviza sem criar picos ou vales
 * que não existem nos dados.
 */
export function caminhoSuave(pontos) {
  const n = pontos.length;
  if (!n) return "";
  if (n === 1) return `M${pontos[0][0]},${pontos[0][1]}`;
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pontos[i + 1][0] - pontos[i][0]);
    m.push(dx[i] ? (pontos[i + 1][1] - pontos[i][1]) / dx[i] : 0);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i += 1) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i += 1) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const h = Math.hypot(t[i] / m[i], t[i + 1] / m[i]);
      if (h > 3) {
        t[i] *= 3 / h;
        t[i + 1] *= 3 / h;
      }
    }
  }
  const f = (v) => Number(v.toFixed(2));
  let d = `M${f(pontos[0][0])},${f(pontos[0][1])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const [x0, y0] = pontos[i];
    const [x1, y1] = pontos[i + 1];
    const terco = dx[i] / 3;
    d += ` C${f(x0 + terco)},${f(y0 + t[i] * terco)} ${f(x1 - terco)},${f(y1 - t[i + 1] * terco)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

/** Degrau (0 a 4) da rampa de cor para um valor em relação ao máximo. */
export function degrauDeCor(valor, max, degraus = 5) {
  if (!(valor > 0) || !(max > 0)) return -1;
  return Math.min(degraus - 1, Math.ceil((valor / max) * degraus) - 1);
}
