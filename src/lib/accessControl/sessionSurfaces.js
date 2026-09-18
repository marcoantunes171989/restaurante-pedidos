/** Superfícies autenticadas do Pedido Prime — taxonomia fechada PDB-I1B. */
export const SESSION_SURFACES = Object.freeze([
  "ADMIN",
  "PDV",
  "OPERACIONAL",
  "TABLET",
  "CARDAPIO_AUTH",
]);

const SURFACE_BY_TAB = Object.freeze({
  admin: "ADMIN",
  cashier: "PDV",
  opmobile: "OPERACIONAL",
  kitchen: "OPERACIONAL",
  panel: "OPERACIONAL",
  tablet: "TABLET",
});

export function surfaceFromAppTab(tab) {
  return SURFACE_BY_TAB[tab] || "ADMIN";
}

export function surfaceFromPathname(pathname = "") {
  const path = String(pathname || "");
  if (path.startsWith("/app/caixa")) return "PDV";
  if (path.startsWith("/operacional")) return "OPERACIONAL";
  if (path.startsWith("/app/painel") || path.startsWith("/admin/cozinha")) return "OPERACIONAL";
  if (path.startsWith("/app/tablet")) return "TABLET";
  if (/cardapio/i.test(path)) return "CARDAPIO_AUTH";
  if (path.startsWith("/admin")) return "ADMIN";
  return "ADMIN";
}

export function isSessionSurface(value) {
  return SESSION_SURFACES.includes(value);
}
