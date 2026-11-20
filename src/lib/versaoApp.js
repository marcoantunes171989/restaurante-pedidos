// Versão do sistema que está rodando NESTA aba x versão publicada agora.
// Uma aba do caixa aberta o dia todo continua com o código antigo na memória (o navegador só troca ao recarregar): correções
// publicadas depois (ex.: emissão da nota) não chegam até alguém recarregar. Aqui a aba descobre isso sozinha.

/** Versão (commit de 7 caracteres) carimbada no build desta aba; "local" fora do build. */
export function versaoRodando() {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "local";
}

/** Lê a versão publicada no /sw.js (sempre sem cache). Devolve null se não conseguir ler. */
export async function versaoPublicada(fetchFn = (...a) => globalThis.fetch(...a)) {
  try {
    const r = await fetchFn("/sw.js", { cache: "no-store" });
    const t = await r.text();
    const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(t);
    return m && m[1] && m[1] !== "__APP_VERSION__" ? m[1] : null;
  } catch { return null; }
}

/** Há versão mais nova publicada do que a desta aba? ("local" nunca acusa, para não incomodar em desenvolvimento.) */
export function versaoDesatualizada(rodando, publicada) {
  return !!rodando && rodando !== "local" && !!publicada && rodando !== publicada;
}
