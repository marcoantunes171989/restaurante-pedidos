// ════════════════════════════════════════════════════════════
//  PDB-I3-FE3 — Navegação do módulo "Versões & Atualizações".
//
//  Uma só função administrativa reúne Ambientes, Versões, Releases,
//  Atualizações, Manutenção e Histórico. O menu lateral já é agrupado
//  (grupo → itens), então o módulo vira um GRUPO com duas telas — sem refatorar
//  o sistema de navegação, sem React Router e sem mudar ids/rotas/permissões:
//
//    /admin/ambientes   → central (Visão geral · Versões & Releases · Deploys · Histórico)
//    /admin/manutencao  → visão operacional do processo de atualização
//
//  Ambas continuam exclusivas do administrador geral (superAdmin) — a regra
//  vive em App.jsx (aplicarRota + render) e NÃO é alterada aqui.
// ════════════════════════════════════════════════════════════

export const ADMIN_VERSOES_NAV = Object.freeze({
  modulo: "Versões & Atualizações",
  grupo: "Versões & Atualizações",
  descricao: "Gerencie ambientes, versões, releases e atualizações do Pedido Prime.",
  central: Object.freeze({ id: "ambientes", rota: "/admin/ambientes", label: "Ambientes & Releases" }),
  manutencao: Object.freeze({ id: "manutencao", rota: "/admin/manutencao", label: "Manutenção" }),
  acompanharManutencao: "Acompanhar manutenção",
  voltarParaCentral: "Voltar para Versões & Atualizações",
});

/** Ids das seções do painel que pertencem ao módulo (mesmos ids de sempre). */
export const ADMIN_VERSOES_SECTION_IDS = Object.freeze([
  ADMIN_VERSOES_NAV.central.id,
  ADMIN_VERSOES_NAV.manutencao.id,
]);
