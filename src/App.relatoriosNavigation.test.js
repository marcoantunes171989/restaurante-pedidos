// @vitest-environment jsdom
//
// MICROGATE 03 — integração URL ↔ estado do App ↔ RelatoriosAdmin.
//
// App.jsx é o componente gigante (RestaurantePedidoApp); montá-lo inteiro
// para testar comportamento não vale o custo de infraestrutura (mesmo
// padrão adotado em App.deviceIntegrity.test.js). Por isso:
//
// - o "fio" URL → estado → URL é testado BEHAVIORALMENTE chamando direto as
//   funções puras reais que aplicarRota e o efeito central usam
//   (classificarPathname, ehIdRelatorioValido, rotaDoEstado — os mesmos
//   módulos importados por App.jsx, sem duplicar lógica no teste);
// - a integração desses módulos com o componente (onde o estado é lido/
//   escrito, o que é passado para AdminView/RelatoriosAdmin) é verificada
//   por sentinela estrutural sobre o texto-fonte real de App.jsx — os
//   mesmos que travam se alguém reordenar/remover os trechos.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classificarPathname, rotaDoEstado } from "./lib/historicoNavegacao.js";
import { ehIdRelatorioValido, RELATORIOS_IDS } from "./lib/relatoriosNav.js";

const appSource = readFileSync("src/App.jsx", "utf8");

/**
 * Reproduz exatamente a regra de aplicarRota (App.jsx) para a dimensão
 * relatorioSub, usando as MESMAS funções puras importadas pelo App —
 * não uma reimplementação paralela. Ver App.jsx: bloco `classe.tipo ===
 * "admin"` dentro de aplicarRota().
 */
function relatorioSubDaUrl(pathname) {
  const classe = classificarPathname(pathname);
  const seg = classe.tipo === "admin_raiz" ? "dashboard" : classe.secao;
  if (seg !== "relatorios") return null;
  return ehIdRelatorioValido(classe.sub) ? classe.sub : "geral";
}

describe("MICROGATE 03 — URL → relatorioSub (via classificarPathname + ehIdRelatorioValido reais)", () => {
  it("1/2. /admin/relatorios (raiz) resulta em relatorioSub = geral", () => {
    expect(relatorioSubDaUrl("/admin/relatorios")).toBe("geral");
  });

  it("3. /admin/relatorios/vendas resulta em vendas", () => {
    expect(relatorioSubDaUrl("/admin/relatorios/vendas")).toBe("vendas");
  });

  it("4. /admin/relatorios/cupom-mesa-comanda resulta em cupom", () => {
    expect(relatorioSubDaUrl("/admin/relatorios/cupom-mesa-comanda")).toBe("cupom");
  });

  it("5. /admin/relatorios/estoque resulta em estoque", () => {
    expect(relatorioSubDaUrl("/admin/relatorios/estoque")).toBe("estoque");
  });

  it("6. /admin/relatorios/clientes resulta em clientes", () => {
    expect(relatorioSubDaUrl("/admin/relatorios/clientes")).toBe("clientes");
  });

  it("7. /admin/relatorios/permanencia resulta em permanencia", () => {
    expect(relatorioSubDaUrl("/admin/relatorios/permanencia")).toBe("permanencia");
  });

  it("8. /admin/relatorios/satisfacao resulta em satisfacao", () => {
    expect(relatorioSubDaUrl("/admin/relatorios/satisfacao")).toBe("satisfacao");
  });

  it("outras seções admin não populam relatorioSub (rota raiz de Relatórios não vaza para Dashboard/CRM/etc.)", () => {
    expect(relatorioSubDaUrl("/admin/dashboard")).toBeNull();
    expect(relatorioSubDaUrl("/admin/crm")).toBeNull();
    expect(relatorioSubDaUrl("/admin")).toBeNull();
  });
});

describe("MICROGATE 03 — relatorioSub → URL (via rotaDoEstado real, 5º argumento)", () => {
  it("12/13/14. cobre os 7 ids e a raiz sempre volta para geral em id inválido", () => {
    const esperado = {
      geral: "/admin/relatorios",
      vendas: "/admin/relatorios/vendas",
      cupom: "/admin/relatorios/cupom-mesa-comanda",
      estoque: "/admin/relatorios/estoque",
      clientes: "/admin/relatorios/clientes",
      permanencia: "/admin/relatorios/permanencia",
      satisfacao: "/admin/relatorios/satisfacao",
    };
    for (const id of RELATORIOS_IDS) {
      expect(rotaDoEstado("admin", "relatorios", null, null, id)).toBe(esperado[id]);
    }
    expect(rotaDoEstado("admin", "relatorios", null, null, "id-invalido")).toBe("/admin/relatorios");
  });

  it("15. relatorioSub é ignorado fora da seção relatorios — não interfere em outras telas admin", () => {
    expect(rotaDoEstado("admin", "dashboard", null, null, "vendas")).toBe("/admin/dashboard");
    expect(rotaDoEstado("admin", "crm", null, null, "estoque")).toBe("/admin/crm");
  });

  it("relatorioSub é ignorado fora do tab admin (kitchen/opmobile/etc.)", () => {
    expect(rotaDoEstado("kitchen", "dashboard", 3, null, "vendas")).toBe("/admin/cozinha?setorId=3");
    expect(rotaDoEstado("opmobile", "dashboard", null, "pedidos", "vendas")).toBe("/operacional/pedidos");
  });
});

describe("MICROGATE 03 — wiring estrutural em App.jsx (sentinela sobre o texto-fonte real)", () => {
  it("1. App possui estado relatorioSub com default geral", () => {
    expect(appSource).toContain('const [relatorioSub, setRelatorioSub] = useState("geral");');
  });

  it("9/12. aplicarRota deriva o sub (fallback geral) e propaga ao rotaDoEstado central (URL → estado)", () => {
    const idx = appSource.indexOf("function aplicarRota(pathname, search, user)");
    const fim = appSource.indexOf("aplicarRotaRef.current = aplicarRota;");
    const corpo = appSource.slice(idx, fim);
    expect(idx).toBeGreaterThan(-1);
    expect(corpo).toContain(
      'const sub = seg === "relatorios" ? (ehIdRelatorioValido(classe.sub) ? classe.sub : "geral") : null;',
    );
    expect(corpo).toContain('if (seg === "relatorios") setRelatorioSub(sub);');
    expect(corpo).toContain('rotaDoEstado("admin", seg, null, null, sub)');
  });

  it("12. o efeito central estado → URL passa relatorioSub como 5º argumento de rotaDoEstado e nas deps", () => {
    expect(appSource).toContain(
      "const novoPath = rotaDoEstado(activeTab, adminSection, cozinhaSetorInicial, opmobileTab, relatorioSub);",
    );
    expect(appSource).toContain(
      "}, [activeTab, adminSection, cozinhaSetorInicial, opmobileTab, relatorioSub, currentUser]);",
    );
  });

  it("16/17. popstate e NotificationBell continuam usando rotaDoEstado central (com relatorioSubRef) — nenhuma History API paralela introduzida", () => {
    const idxOnPop = appSource.indexOf("const onPop = async () => {");
    const fimOnPop = appSource.indexOf('window.addEventListener("popstate", onPop);');
    const corpoOnPop = appSource.slice(idxOnPop, fimOnPop);
    expect(corpoOnPop).toContain("relatorioSubRef.current");
    expect(corpoOnPop).not.toMatch(/window\.history\.pushState/);

    const idxOnNav = appSource.indexOf("const onNav = (e) => {");
    const fimOnNav = appSource.indexOf("window.addEventListener(EVENTO_NAVEGAR_INTERNA, onNav);");
    const corpoOnNav = appSource.slice(idxOnNav, fimOnNav);
    expect(corpoOnNav).toContain("relatorioSubRef.current");
    expect(corpoOnNav).not.toMatch(/window\.history\.pushState/);
  });

  it("8. clique no item raiz 'Relatórios' (setAdminSection central) reseta relatorioSub para geral", () => {
    expect(appSource).toContain(
      'setAdminSection={(id) => { setCozinhaBloqueadaPlano(false); if (id === "relatorios") setRelatorioSub("geral"); setAdminSection(id); }}',
    );
  });

  it("9. AdminView recebe e repassa relatorioSub/onRelatorioSubChange somente a RelatoriosAdmin (alteração cirúrgica)", () => {
    const idxAdminView = appSource.indexOf("function AdminView({");
    const assinaturaAdminView = appSource.slice(idxAdminView, appSource.indexOf(") {", idxAdminView));
    expect(assinaturaAdminView).toContain("relatorioSub = \"geral\"");
    expect(assinaturaAdminView).toContain("onRelatorioSubChange = () => {}");

    expect(appSource).toContain(
      'setAdminSection={(id) => { setCozinhaBloqueadaPlano(false); if (id === "relatorios") setRelatorioSub("geral"); setAdminSection(id); }} relatorioSub={relatorioSub} onRelatorioSubChange={(id) => setRelatorioSub(ehIdRelatorioValido(id) ? id : "geral")}',
    );
    expect(appSource).toContain(
      '{ativo === "relatorios" && <RelatoriosAdmin orders={orders} products={products} lojaInfo={lojaInfo} pesquisas={filtraLoja(pesquisas)} irParaMesas={() => setAdminSection("mesas")} irParaProdutos={() => setAdminSection("products")} currentUser={currentUser} aba={relatorioSub} onAbaChange={onRelatorioSubChange} />}',
    );
  });

  it("10/11. RelatoriosAdmin NÃO possui useState local para a aba — recebe prop controlada + callback", () => {
    const idxInicio = appSource.indexOf("function RelatoriosAdmin({");
    const idxFim = appSource.indexOf("\nfunction BadgeCupom({");
    const corpo = appSource.slice(idxInicio, idxFim);
    expect(idxInicio).toBeGreaterThan(-1);
    expect(idxFim).toBeGreaterThan(idxInicio);

    // assinatura: prop renomeada (abaProp) + callback controlado, sem
    // useState(prop) (que criaria sincronização dupla — proibido pelo MG03).
    expect(corpo).toContain('aba: abaProp = "geral", onAbaChange = () => {}');
    expect(corpo).not.toMatch(/useState\(\s*abaProp\s*\)/);
    expect(corpo).not.toMatch(/const \[aba, setAba\] = useState/);
    expect(corpo).toContain('const aba = ehIdRelatorioValido(abaProp) ? abaProp : "geral";');

    // nenhum setAba local restante — todas as trocas de aba delegam ao App
    expect(corpo).not.toMatch(/setAba\(/);
    // Microgate 04: a barra de sub-abas (7 botões redundantes) foi removida;
    // restam somente os atalhos internos (Ver estoque/clientes/vendas/permanência).
    const chamadasOnAbaChange = corpo.match(/onAbaChange\(/g) || [];
    expect(chamadasOnAbaChange.length).toBeGreaterThanOrEqual(7);
  });

  it("18. login/logout não foram tocados por este microgate (nenhuma referência a relatorioSub neles)", () => {
    const idxLogout = appSource.indexOf("async function logout() {");
    const idxFimLogout = appSource.indexOf("logoutRef.current = logout;");
    const corpoLogout = appSource.slice(idxLogout, idxFimLogout);
    expect(corpoLogout).not.toContain("relatorioSub");
  });
});

// ============================================================
// MICROGATE 04 — submenu lateral de Relatórios (7 filhos) + remoção da
// barra de sub-abas redundante dentro de RelatoriosAdmin.
//
// Mesma estratégia do MG03: sentinela estrutural sobre o texto-fonte real
// de App.jsx (montar o AdminView/Sidebar inteiro não vale o custo de
// infraestrutura — mesmo padrão já adotado neste arquivo e em
// App.deviceIntegrity.test.js), combinada com os ids reais de
// RELATORIOS_IDS (fonte única de verdade, MG02) para nunca duplicar o
// contrato de ids/slugs/paths dentro do teste.
// ============================================================
describe("MICROGATE 04 — submenu lateral de Relatórios", () => {
  it("1/3. o submenu possui exatamente 7 subitens, sem ids duplicados (derivados de RELATORIOS_IDS)", () => {
    expect(RELATORIOS_IDS.length).toBe(7);
    expect(new Set(RELATORIOS_IDS).size).toBe(7);
    expect(appSource).toContain(
      "RELATORIOS_IDS.map((id) => Object.freeze({ id, label: RELATORIOS_SUBMENU_LABELS[id] }))",
    );
  });

  it("2/4-10. labels visuais corretos para cada um dos 7 ids (geral/vendas/cupom/estoque/clientes/permanencia/satisfacao)", () => {
    const esperado = {
      geral: "Visão geral",
      vendas: "Vendas",
      cupom: "Cupom / Mesa / Comanda",
      estoque: "Estoque",
      clientes: "Clientes",
      permanencia: "Permanência",
      satisfacao: "Satisfação",
    };
    const idx = appSource.indexOf("const RELATORIOS_SUBMENU_LABELS = {");
    const fim = appSource.indexOf("};", idx);
    expect(idx).toBeGreaterThan(-1);
    const bloco = appSource.slice(idx, fim);
    for (const id of RELATORIOS_IDS) {
      expect(Object.prototype.hasOwnProperty.call(esperado, id)).toBe(true);
      expect(bloco).toContain(`${id}: "${esperado[id]}"`);
    }
  });

  it("11/12. o item pai 'Relatórios' expande o submenu somente quando adminSection === 'relatorios', sem afetar os demais itens", () => {
    const idx = appSource.indexOf("function SidebarNavItems(");
    const fim = appSource.indexOf("\nfunction MobileAdminDrawer(");
    expect(idx).toBeGreaterThan(-1);
    const corpo = appSource.slice(idx, fim);
    expect(corpo).toContain('const ehRelatorios = it.id === "relatorios";');
    expect(corpo).toContain("const expandido = ehRelatorios && sel;");
    // aria-expanded só é declarado para o item Relatórios (não falso nos demais)
    expect(corpo).toContain("ariaExpanded={ehRelatorios ? expandido : undefined}");
    // clique no item pai continua usando o mesmo setAdminSection central de sempre
    expect(corpo).toContain("} else setAdminSection(it.id);");
  });

  it("13/14. o filho correspondente a relatorioSub recebe destaque (selected) e aria-current='page'", () => {
    const idxItens = appSource.indexOf("function SidebarNavItems(");
    const fimItens = appSource.indexOf("\nfunction MobileAdminDrawer(");
    const corpoItens = appSource.slice(idxItens, fimItens);
    expect(corpoItens).toContain("selected={relatorioSub === sub.id}");

    const idxSub = appSource.indexOf("const SidebarSubItem = React.memo(");
    const fimSub = appSource.indexOf("const cxSidebar = ");
    expect(idxSub).toBeGreaterThan(-1);
    const corpoSub = appSource.slice(idxSub, fimSub);
    expect(corpoSub).toContain('aria-current={selected ? "page" : undefined}');
  });

  it("15/16. desktop (aside fixo) e mobile (MobileAdminDrawer) usam o MESMO SidebarNavItems — nenhuma segunda definição do submenu", () => {
    const ocorrencias = [...appSource.matchAll(/<SidebarNavItems[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(ocorrencias.length).toBe(2);
    ocorrencias.forEach((bloco) => {
      expect(bloco).toContain("relatorioSub={relatorioSub}");
      expect(bloco).toContain("onRelatorioSubChange={onRelatorioSubChange}");
    });
  });

  it("17/19/20/21. clique no filho usa exclusivamente onRelatorioSubChange + onNavigate central — nenhuma History API paralela na Sidebar", () => {
    const idx = appSource.indexOf("function SidebarNavItems(");
    const fim = appSource.indexOf("\nfunction MobileAdminDrawer(");
    const corpo = appSource.slice(idx, fim);
    expect(corpo).toContain("onClick={() => { onRelatorioSubChange(sub.id); onNavigate?.(); }}");
    expect(corpo).not.toMatch(/window\.location/);
    expect(corpo).not.toMatch(/history\.pushState/);
    expect(corpo).not.toMatch(/replaceState/);
  });

  it("18. clicar no pai 'Relatórios' resulta em Visão geral (reaproveita o reset central do MG03)", () => {
    expect(appSource).toContain(
      'setAdminSection={(id) => { setCozinhaBloqueadaPlano(false); if (id === "relatorios") setRelatorioSub("geral"); setAdminSection(id); }}',
    );
  });

  it("22. a barra antiga de sub-abas (FilterChip) foi removida de dentro de RelatoriosAdmin", () => {
    const idxInicio = appSource.indexOf("function RelatoriosAdmin({");
    const idxFim = appSource.indexOf("\nfunction BadgeCupom({");
    expect(idxInicio).toBeGreaterThan(-1);
    expect(idxFim).toBeGreaterThan(idxInicio);
    const corpo = appSource.slice(idxInicio, idxFim);
    expect(corpo).not.toContain("Sub-abas de relatório");
    expect(corpo).not.toMatch(/FilterChip key=\{t\.id\}/);
  });

  it("23. atalhos internos (Ver todos/Ver estoque/Ver permanência/Ver clientes) continuam chamando onAbaChange", () => {
    const idxInicio = appSource.indexOf("function RelatoriosAdmin({");
    const idxFim = appSource.indexOf("\nfunction BadgeCupom({");
    const corpo = appSource.slice(idxInicio, idxFim);
    expect(corpo).toContain('onClick={() => onAbaChange("vendas")}');
    expect(corpo).toContain('onClick={() => onAbaChange("estoque")}');
    expect(corpo).toContain('onClick={() => onAbaChange("permanencia")}');
    expect(corpo).toContain('onClick={() => onAbaChange("clientes")}');
  });

  it("título contextual — cobre geral/vendas/estoque/clientes/satisfacao sem repetir o título fixo antigo", () => {
    const idxInicio = appSource.indexOf("function RelatoriosAdmin({");
    const idxFim = appSource.indexOf("\nfunction BadgeCupom({");
    const corpo = appSource.slice(idxInicio, idxFim);
    expect(corpo).toContain(
      '{aba === "geral" ? "Relatórios" : `Relatórios — ${RELATORIOS_SUBMENU_LABELS[aba]}`}',
    );
    expect(corpo).not.toContain(">Relatórios de vendas<");
    ["geral", "vendas", "estoque", "clientes", "satisfacao"].forEach((id) => {
      expect(RELATORIOS_IDS).toContain(id);
    });
  });

  it("27. RelatoriosAdmin continua sem useState próprio para a aba (reafirma o contrato do MG03 após a remoção da barra)", () => {
    const idxInicio = appSource.indexOf("function RelatoriosAdmin({");
    const idxFim = appSource.indexOf("\nfunction BadgeCupom({");
    const corpo = appSource.slice(idxInicio, idxFim);
    expect(corpo).not.toMatch(/const \[aba, setAba\] = useState/);
  });
});
