// ════════════════════════════════════════════════════════════
//  Tema das telas do cliente (escuro / claro) — Pedido Prime
//  Persiste em localStorage e aplica data-theme no <html>.
//  Os menus laterais (admin e categorias do tablet) ficam sempre
//  escuros — não dependem deste tema.
// ════════════════════════════════════════════════════════════
const CHAVE = "pp-tema";

export function obterTema() {
  // Padrão OFICIAL: claro (mesmo padrão do painel administrativo).
  // Só retorna "dark" se o usuário tiver explicitamente escolhido escuro.
  try { return localStorage.getItem(CHAVE) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

export function aplicarTema(tema) {
  const t = tema === "light" ? "light" : "dark";
  try { localStorage.setItem(CHAVE, t); } catch {}
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", t);
    // Notifica componentes React que escutam a troca em tempo real
    window.dispatchEvent(new CustomEvent("pp-tema", { detail: t }));
  }
  return t;
}

// Aplica o tema salvo no carregamento da página
export function inicializarTema() {
  if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", obterTema());
}
