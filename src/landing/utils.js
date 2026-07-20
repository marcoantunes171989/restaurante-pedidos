// Scroll suave até uma âncora de seção (id). "topo" (clique na logo) é caso
// especial: vai para o topo absoluto do container de rolagem real da SPA
// (#root, ver comentário em src/index.css) em vez de scrollIntoView no Hero.
// scrollIntoView alinha o topo do Hero com o topo do container — que fica
// exatamente à altura do cabeçalho sticky (73px) — então o cabeçalho passa a
// sobrepor as primeiras linhas do Hero (badge/título) em vez de ficar no seu
// lugar natural, dando a impressão de "pular" para uma posição errada.
export function goTo(id) {
  if (id === "topo") {
    const root = document.getElementById("root") || document.scrollingElement || document.documentElement;
    root.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
