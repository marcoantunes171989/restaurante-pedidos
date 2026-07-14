// Scroll suave até uma âncora de seção (id).
export function goTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
