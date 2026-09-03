// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  aplicarEscritaHistorico,
  classificarPathname,
  decidirCorrecaoUrlAposRota,
  decidirEscritaHistorico,
  decidirHistoricoLogout,
  decidirNavegacaoNotificacao,
  decidirPopstate,
  ehRotaLogin,
  ehRotaProtegida,
  EVENTO_NAVEGAR_INTERNA,
  executarPopstate,
  pathRotaSegura,
  processarNavegacaoInterna,
  resolverResultadoAplicarRota,
  rotaDoEstado,
  solicitarNavegacaoInterna,
  validarRotaNavegacaoInterna,
} from "./historicoNavegacao.js";

const appSource = readFileSync("src/App.jsx", "utf8");

/** Pilha compatível com history.pushState/replaceState — inspetável além do jsdom. */
function criarPilha(pathInicial) {
  const stack = [pathInicial];
  let idx = 0;
  return {
    replaceState(_s, _t, path) { stack[idx] = path; },
    pushState(_s, _t, path) {
      stack.splice(idx + 1);
      stack.push(path);
      idx = stack.length - 1;
    },
    back() { if (idx > 0) idx -= 1; },
    forward() { if (idx < stack.length - 1) idx += 1; },
    get atual() { return stack[idx]; },
    get pathname() { return String(stack[idx] || "").split("?")[0]; },
    snapshot() { return { stack: [...stack], idx, atual: stack[idx] }; },
  };
}

function escrever(pilha, pathAtual, pathNovo, { primeiraSync = false, veioDePopstate = false } = {}) {
  const d = decidirEscritaHistorico({ pathAtual, pathNovo, primeiraSync, veioDePopstate });
  aplicarEscritaHistorico(pilha, d);
  return d;
}

describe("REL-02D-AUTH-HISTORY-A — regressão do histórico (APIs de history + decisão do App)", () => {
  it("DEFECTO demonstrado: push após /login deixa /login atrás do Dashboard", () => {
    const pilha = criarPilha("/login");
    aplicarEscritaHistorico(pilha, { metodo: "push", path: "/admin/dashboard" });
    expect(pilha.snapshot().stack).toEqual(["/login", "/admin/dashboard"]);
    pilha.back();
    expect(pilha.atual).toBe("/login");
  });

  it("login bem-sucedido substitui /login (replace) e não a deixa atrás do Dashboard", () => {
    const pilha = criarPilha("/login");
    const d = escrever(pilha, "/login", "/admin/dashboard", { primeiraSync: true });
    expect(d.metodo).toBe("replace");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
    expect(pilha.snapshot().stack).not.toContain("/login");
  });

  it("jsdom: replace após login não aumenta a pilha; push deixaria /login recuperável", () => {
    window.history.replaceState({ ppApp: true }, "", "/login");
    expect(window.location.pathname).toBe("/login");
    const len = window.history.length;
    const certo = decidirEscritaHistorico({
      pathAtual: "/login", pathNovo: "/admin/dashboard", primeiraSync: true,
    });
    expect(certo.metodo).toBe("replace");
    aplicarEscritaHistorico(window.history, certo);
    expect(window.location.pathname).toBe("/admin/dashboard");
    expect(window.history.length).toBe(len);

    const seFossePush = decidirEscritaHistorico({
      pathAtual: "/login", pathNovo: "/admin/dashboard", primeiraSync: false,
    });
    expect(seFossePush.metodo).toBe("push");
  });

  it("Dashboard → Cozinha cria navegação normal (push); Voltar retorna ao Dashboard", () => {
    const pilha = criarPilha("/login");
    escrever(pilha, "/login", "/admin/dashboard", { primeiraSync: true });
    const d = escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    expect(d.metodo).toBe("push");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
    pilha.back();
    expect(pilha.atual).toBe("/admin/dashboard");
    const pop = decidirPopstate({
      pathname: pilha.pathname, autenticado: true, rotaSegura: "/admin/dashboard",
    });
    expect(pop.encerrarSessao).toBe(false);
    expect(pop.acao).toBe("aplicar_rota");
    expect(ehRotaLogin(pilha.pathname)).toBe(false);
  });

  it("Ctrl+F5 na Cozinha não empilha entrada extra; Voltar não cai em /login", () => {
    const pilha = criarPilha("/login");
    escrever(pilha, "/login", "/admin/dashboard", { primeiraSync: true });
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    const antesF5 = pilha.snapshot();
    const f5 = escrever(pilha, "/admin/cozinha", "/admin/cozinha", { primeiraSync: true });
    expect(f5.metodo).toBe("noop");
    expect(pilha.snapshot().stack).toEqual(antesF5.stack);
    expect(pilha.atual).toBe("/admin/cozinha");
    pilha.back();
    expect(pilha.atual).toBe("/admin/dashboard");
    const pop = decidirPopstate({
      pathname: pilha.pathname, autenticado: true, rotaSegura: "/admin/dashboard",
    });
    expect(pop.encerrarSessao).toBe(false);
    expect(pop.acao).toBe("aplicar_rota");
  });

  it("Avançar depois de Voltar pode retornar à Cozinha sem loop", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    pilha.back();
    expect(pilha.atual).toBe("/admin/dashboard");
    pilha.forward();
    expect(pilha.atual).toBe("/admin/cozinha");
    const pop = decidirPopstate({
      pathname: pilha.pathname, search: "", autenticado: true, rotaSegura: "/admin/dashboard",
    });
    expect(pop.metodo).toBe("noop");
    expect(pop.acao).toBe("aplicar_rota");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
  });

  it("popstate autenticado em /login NÃO encerra sessão e substitui pela rota segura", () => {
    window.history.replaceState({ ppApp: true }, "", "/login");
    const d = decidirPopstate({
      pathname: "/login", autenticado: true, rotaSegura: "/admin/dashboard",
    });
    expect(d.encerrarSessao).toBe(false);
    expect(d.acao).toBe("restaurar_rota_segura");
    expect(d.metodo).toBe("replace");
    const len = window.history.length;
    aplicarEscritaHistorico(window.history, d);
    expect(window.location.pathname).toBe("/admin/dashboard");
    expect(window.history.length).toBe(len);
  });

  it("popstate não autenticado em rota protegida substitui por /login sem reabrir sessão", () => {
    const pilha = criarPilha("/admin/cozinha");
    const d = decidirPopstate({
      pathname: "/admin/cozinha", autenticado: false, rotaSegura: "/admin/dashboard",
    });
    expect(d.acao).toBe("forcar_login");
    expect(d.encerrarSessao).toBe(false);
    aplicarEscritaHistorico(pilha, d);
    expect(pilha.atual).toBe("/login");
    expect(pilha.snapshot().stack).toEqual(["/login"]);
  });

  it("logout substitui a rota protegida por /login; Voltar autenticado-falso não reabre painel", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    const logout = decidirHistoricoLogout(pilha.atual);
    expect(logout.metodo).toBe("replace");
    aplicarEscritaHistorico(pilha, logout);
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/login"]);
    pilha.back();
    expect(pilha.atual).toBe("/admin/dashboard");
    const pop = decidirPopstate({
      pathname: pilha.pathname, autenticado: false, rotaSegura: "/admin/dashboard",
    });
    aplicarEscritaHistorico(pilha, pop);
    expect(pilha.atual).toBe("/login");
  });

  it("usuário autenticado em /login: replace para rota autorizada, sem duplicar histórico", () => {
    const pilha = criarPilha("/login");
    const d = decidirPopstate({
      pathname: "/login", autenticado: true, rotaSegura: pathRotaSegura("admin"),
    });
    expect(d.path).toBe("/admin/dashboard");
    aplicarEscritaHistorico(pilha, d);
    expect(pilha.snapshot()).toEqual({ stack: ["/admin/dashboard"], idx: 0, atual: "/admin/dashboard" });
  });

  it("sessão inválida em /admin/cozinha vai para /login (não monta painel)", () => {
    window.history.replaceState({ ppApp: true }, "", "/admin/cozinha");
    aplicarEscritaHistorico(window.history, decidirHistoricoLogout("/admin/cozinha"));
    expect(window.location.pathname).toBe("/login");
    expect(ehRotaProtegida(window.location.pathname)).toBe(false);
  });

  it("rota segura respeita abaInicialDoUsuario (gestor/admin vs operacional)", () => {
    expect(pathRotaSegura("admin")).toBe("/admin/dashboard");
    expect(pathRotaSegura("kitchen")).toBe("/admin/cozinha");
    expect(pathRotaSegura("cashier")).toBe("/app/caixa");
    expect(pathRotaSegura("panel")).toBe("/app/painel");
    expect(pathRotaSegura("opmobile")).toBe("/operacional");
    expect(pathRotaSegura("tablet")).toBe("/app/tablet");
    expect(pathRotaSegura("blocked")).toBe("/login");
    const popGestor = decidirPopstate({
      pathname: "/login", autenticado: true, rotaSegura: pathRotaSegura("cashier"),
    });
    expect(popGestor.path).toBe("/app/caixa");
    expect(popGestor.path).not.toBe("/admin/dashboard");
  });

  it("popstate repetido não faz push e não cresce a pilha", () => {
    const pilha = criarPilha("/login");
    for (let i = 0; i < 6; i += 1) {
      const d = decidirPopstate({
        pathname: pilha.pathname, autenticado: true, rotaSegura: "/admin/dashboard",
      });
      expect(d.metodo).not.toBe("push");
      expect(d.encerrarSessao).toBe(false);
      aplicarEscritaHistorico(pilha, d);
    }
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
  });

  it("rota pública fora de / e /login no Voltar não captura globalmente nem encerra sessão", () => {
    const d = decidirPopstate({
      pathname: "/cardapio", autenticado: true, rotaSegura: "/admin/dashboard",
    });
    expect(d.acao).toBe("ignorar");
    expect(d.encerrarSessao).toBe(false);
    expect(d.metodo).toBe("noop");
    expect(d.metodo).not.toBe("push");
  });

  it("deep-link / F5: URL já correta não gera replace+push duplicado", () => {
    expect(rotaDoEstado("kitchen")).toBe("/admin/cozinha");
    const d = decidirEscritaHistorico({
      pathAtual: "/admin/cozinha",
      pathNovo: rotaDoEstado("kitchen"),
      primeiraSync: true,
    });
    expect(d.metodo).toBe("noop");
  });
});

describe("REL-02D-AUTH-HISTORY-A — wiring estrutural do App (não é prova isolada)", () => {
  it("App importa e chama a decisão pura de histórico", () => {
    expect(appSource).toContain('from "./lib/historicoNavegacao"');
    expect(appSource).toContain("decidirEscritaHistorico");
    expect(appSource).toContain("executarPopstate");
    expect(appSource).toContain("decidirCorrecaoUrlAposRota");
    expect(appSource).toContain("aplicarEscritaHistorico");
    expect(appSource).toContain("pathRotaSegura");
    expect(appSource).toContain("EVENTO_NAVEGAR_INTERNA");
    expect(appSource).toContain("validarRotaNavegacaoInterna");
    expect(appSource).toContain("processarNavegacaoInterna");
    expect(appSource).toContain("classificarPathname");
    expect(appSource).toContain("resolverResultadoAplicarRota");
  });

  it("primeira sync autenticada não duplica a rota com replace+push", () => {
    expect(appSource).not.toMatch(
      /history\.replaceState\(\{\s*ppApp:\s*true\s*\},\s*""\s*,\s*novoPath\);\s*window\.history\.pushState/,
    );
  });

  it("popstate autenticado não chama logoutRef — sessão permanece", () => {
    const idxOnPop = appSource.indexOf("const onPop = async () => {");
    const idxFim = appSource.indexOf('window.addEventListener("popstate", onPop);');
    const corpo = appSource.slice(idxOnPop, idxFim);
    expect(idxOnPop).toBeGreaterThan(-1);
    expect(corpo).not.toMatch(/await logoutRef\.current\(\)/);
    expect(corpo).toContain("executarPopstate");
    expect(corpo).toContain("abaInicialDoUsuario");
    expect(corpo).not.toMatch(/pushState/);
  });

  it("logout continua substituindo a rota protegida e limpando lojaContexto", () => {
    const inicio = appSource.indexOf("async function logout() {");
    const corpo = appSource.slice(inicio, appSource.indexOf("logoutRef.current = logout;"));
    expect(corpo).toContain("limparMarcadoresSessaoLocal()");
    expect(corpo).toContain("forcarUrlLogin()");
    expect(corpo).toContain("setLojaContexto(null)");
    expect(corpo).toContain("setCurrentUser(null)");
  });

  it("sem currentUser o App monta LoginPage — KitchenView exige usuário", () => {
    expect(appSource).toContain("if (!currentUser)");
    expect(appSource).toContain("<LoginPage");
    expect(appSource).toContain('activeTab === "kitchen" && podeMontarPainelCozinha');
  });
});

const bellSource = readFileSync("src/components/NotificationBell.jsx", "utf8");

function aplicarTela(mapa) {
  return (pathname, search = "") => {
    const key = pathname + (search || "");
    if (typeof mapa === "function") return mapa(pathname, search);
    return mapa[key] || mapa[pathname] || { aceita: true, path: key };
  };
}

describe("REL-02D-AUTH-HISTORY-C — URL, tela e sessão coerentes", () => {
  it("1-2. login substitui /login por Dashboard e não a deixa atrás", () => {
    const pilha = criarPilha("/login");
    const d = escrever(pilha, "/login", "/admin/dashboard", { primeiraSync: true });
    expect(d.metodo).toBe("replace");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
    expect(pilha.snapshot().stack).not.toContain("/login");
  });

  it("3. Dashboard → Cozinha faz push uma única vez", () => {
    const pilha = criarPilha("/admin/dashboard");
    const d = escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    expect(d.metodo).toBe("push");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
  });

  it("4. Ctrl+F5 em /admin/cozinha não duplica histórico", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    const antes = pilha.snapshot();
    expect(escrever(pilha, "/admin/cozinha", "/admin/cozinha", { primeiraSync: true }).metodo).toBe("noop");
    expect(pilha.snapshot().stack).toEqual(antes.stack);
  });

  it("5-6. Voltar da Cozinha abre Dashboard; Avançar retorna à Cozinha, sem logout", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    pilha.back();
    const voltar = executarPopstate({
      historyApi: pilha,
      pathname: pilha.pathname,
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: aplicarTela({ "/admin/dashboard": { aceita: true, path: "/admin/dashboard" } }),
    });
    expect(voltar.encerrarSessao).toBe(false);
    expect(pilha.atual).toBe("/admin/dashboard");
    pilha.forward();
    const avancar = executarPopstate({
      historyApi: pilha,
      pathname: pilha.pathname,
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: aplicarTela({ "/admin/cozinha": { aceita: true, path: "/admin/cozinha" } }),
    });
    expect(avancar.encerrarSessao).toBe(false);
    expect(avancar.metodo).toBe("noop");
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
  });

  it("7. popstate autenticado para /login corrige para rota segura", () => {
    const pilha = criarPilha("/login");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/login",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: aplicarTela({ "/admin/dashboard": { aceita: true, path: "/admin/dashboard" } }),
    });
    expect(r.acao).toBe("restaurar_rota_segura");
    expect(r.encerrarSessao).toBe(false);
    expect(r.metodo).toBe("replace");
    expect(r.metodo).not.toBe("push");
    expect(pilha.atual).toBe("/admin/dashboard");
  });

  it("8-9. popstate autenticado para \"/\" corrige URL e estado; \"/\" não fica na barra", () => {
    const pilha = criarPilha("/");
    let tela = null;
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: (p) => {
        tela = p;
        return { aceita: true, path: p };
      },
    });
    expect(r.acao).toBe("restaurar_rota_segura");
    expect(r.encerrarSessao).toBe(false);
    expect(r.metodo).toBe("replace");
    expect(tela).toBe("/admin/dashboard");
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
    expect(pilha.snapshot().stack).not.toContain("/");
  });

  it("\"/\" autenticado para perfil cozinha corrige para /admin/cozinha", () => {
    const pilha = criarPilha("/");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/",
      autenticado: true,
      rotaSegura: pathRotaSegura("kitchen"),
      aplicarRota: (p) => ({ aceita: true, path: p }),
    });
    expect(r.path).toBe("/admin/cozinha");
    expect(pilha.atual).toBe("/admin/cozinha");
  });

  it("10. rota protegida negada por permissão corrige URL por replace", () => {
    const pilha = criarPilha("/admin/cozinha");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/admin/cozinha",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: false, path: "/admin/dashboard" }),
    });
    expect(r.acao).toBe("aplicar_rota");
    expect(r.correcao.metodo).toBe("replace");
    expect(r.correcao.metodo).not.toBe("push");
    expect(r.encerrarSessao).toBe(false);
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
  });

  it("11. rota bloqueada por plano mantém URL coerente com o estado bloqueado", () => {
    const pilha = criarPilha("/admin/cozinha");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/admin/cozinha",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/cozinha", bloqueadaPlano: true }),
    });
    expect(r.correcao.metodo).toBe("noop");
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(decidirCorrecaoUrlAposRota({
      pathSolicitado: "/admin/cozinha",
      pathEfetivo: "/admin/dashboard",
    }).metodo).toBe("replace");
  });

  it("12. NotificationBell com destino permitido mantém URL e tela iguais", () => {
    const pilha = criarPilha("/admin/dashboard");
    const d = decidirNavegacaoNotificacao({
      rotaAtual: "/admin/dashboard",
      rotaDestino: "/admin/cozinha",
      destinoAceito: true,
      rotaSegura: "/admin/dashboard",
    });
    expect(d.metodo).toBe("push");
    aplicarEscritaHistorico(pilha, d);
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
  });

  it("13. NotificationBell com destino negado não deixa URL protegida na barra", () => {
    const pilha = criarPilha("/admin/dashboard");
    const d = decidirNavegacaoNotificacao({
      rotaAtual: "/admin/dashboard",
      rotaDestino: "/admin/cozinha",
      destinoAceito: false,
      rotaSegura: "/admin/dashboard",
    });
    expect(d.metodo).toBe("noop");
    aplicarEscritaHistorico(pilha, d);
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(pilha.snapshot().stack).not.toContain("/admin/cozinha");
  });

  it("NotificationBell negada a partir da Cozinha vai ao fallback sem gravar o destino", () => {
    const pilha = criarPilha("/admin/cozinha");
    const d = decidirNavegacaoNotificacao({
      rotaAtual: "/admin/cozinha",
      rotaDestino: "/app/caixa",
      destinoAceito: false,
      rotaSegura: "/admin/dashboard",
    });
    expect(d.metodo).toBe("push");
    aplicarEscritaHistorico(pilha, d);
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(pilha.snapshot().stack).not.toContain("/app/caixa");
  });

  it("14. popstate não chama logout para usuário autenticado", () => {
    const r = executarPopstate({
      historyApi: criarPilha("/admin/dashboard"),
      pathname: "/admin/dashboard",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/dashboard" }),
    });
    expect(r.encerrarSessao).toBe(false);
    expect(r.preservarSessao).toBe(true);
    const raiz = decidirPopstate({ pathname: "/", autenticado: true, rotaSegura: "/admin/dashboard" });
    expect(raiz.encerrarSessao).toBe(false);
  });

  it("15-16. logout explícito vai a /login; Voltar autenticado-falso não reabre KitchenView", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    aplicarEscritaHistorico(pilha, decidirHistoricoLogout(pilha.atual));
    expect(pilha.atual).toBe("/login");
    pilha.back();
    executarPopstate({
      historyApi: pilha,
      pathname: pilha.pathname,
      autenticado: false,
      rotaSegura: "/admin/dashboard",
    });
    expect(pilha.atual).toBe("/login");
    expect(ehRotaProtegida(pilha.pathname)).toBe(false);
  });

  it("17. deep-link válido /admin/cozinha continua funcionando", () => {
    expect(decidirEscritaHistorico({
      pathAtual: "/admin/cozinha",
      pathNovo: rotaDoEstado("kitchen"),
      primeiraSync: true,
    }).metodo).toBe("noop");
    const r = executarPopstate({
      historyApi: criarPilha("/admin/cozinha"),
      pathname: "/admin/cozinha",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/cozinha" }),
    });
    expect(r.acao).toBe("aplicar_rota");
    expect(r.correcao.metodo).toBe("noop");
  });

  it("18. deep-link inválido ou negado vai para rota segura com URL corrigida", () => {
    const pilha = criarPilha("/app/tablet");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/app/tablet",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: false, path: "/admin/dashboard" }),
    });
    expect(r.correcao.metodo).toBe("replace");
    expect(pilha.atual).toBe("/admin/dashboard");
  });

  it("19. nenhum tratamento de popstate usa pushState", () => {
    const casos = [
      { pathname: "/", autenticado: true, rotaSegura: "/admin/dashboard" },
      { pathname: "/login", autenticado: true, rotaSegura: "/app/caixa" },
      { pathname: "/admin/cozinha", autenticado: true, rotaSegura: "/admin/dashboard" },
      { pathname: "/admin/cozinha", autenticado: false, rotaSegura: "/admin/dashboard" },
      { pathname: "/cardapio", autenticado: true, rotaSegura: "/admin/dashboard" },
    ];
    for (const c of casos) {
      expect(decidirPopstate(c).metodo).not.toBe("push");
    }
    const historico = [];
    const spy = {
      replaceState(_s, _t, path) { historico.push(["replace", path]); },
      pushState(_s, _t, path) { historico.push(["push", path]); },
    };
    executarPopstate({
      historyApi: spy,
      pathname: "/",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/dashboard" }),
    });
    executarPopstate({
      historyApi: spy,
      pathname: "/admin/relatorios",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: false, path: "/admin/dashboard" }),
    });
    expect(historico.every((h) => h[0] !== "push")).toBe(true);
  });

  it("20. nenhum fluxo cria loop de replace/popstate", () => {
    const pilha = criarPilha("/");
    for (let i = 0; i < 8; i += 1) {
      const r = executarPopstate({
        historyApi: pilha,
        pathname: pilha.pathname,
        autenticado: true,
        rotaSegura: "/admin/dashboard",
        aplicarRota: (p) => ({ aceita: true, path: p }),
      });
      expect(r.metodo).not.toBe("push");
      expect(r.encerrarSessao).toBe(false);
    }
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
  });

  it("21. rota inicial segura é correta para os perfis suportados", () => {
    expect(pathRotaSegura("admin")).toBe("/admin/dashboard");
    expect(pathRotaSegura("kitchen")).toBe("/admin/cozinha");
    expect(pathRotaSegura("cashier")).toBe("/app/caixa");
    expect(pathRotaSegura("panel")).toBe("/app/painel");
    expect(pathRotaSegura("opmobile")).toBe("/operacional");
    expect(pathRotaSegura("tablet")).toBe("/app/tablet");
    expect(pathRotaSegura("blocked")).toBe("/login");
    expect(executarPopstate({
      historyApi: criarPilha("/login"),
      pathname: "/login",
      autenticado: true,
      rotaSegura: pathRotaSegura("opmobile"),
      aplicarRota: (p) => ({ aceita: true, path: p }),
    }).path).toBe("/operacional");
  });

  it("22. empresa Burger Station permanece no contrato de remount (título Cozinha)", () => {
    expect(appSource).toContain("· {lojaInfo.nome}");
    expect(appSource).toContain("hidratarLojaContextoPersistido(credOk, lojas)");
    expect(appSource).toContain("if (!currentUser || !lojaContextoHydrated || rotaInicialRef.current) return");
  });

  it("NotificationBell não dispara popstate sintético nem grava a rota crua", () => {
    expect(bellSource).toContain("solicitarNavegacaoInterna");
    expect(bellSource).not.toContain("PopStateEvent");
    expect(bellSource).not.toContain("pushState");
    expect(appSource).toContain("processarNavegacaoInterna");
    expect(appSource).toContain("validarRotaNavegacaoInterna");
  });

  it("solicitarNavegacaoInterna não escreve history — só dispara o evento do App", () => {
    const push = [];
    const origPush = window.history.pushState.bind(window.history);
    const origReplace = window.history.replaceState.bind(window.history);
    window.history.pushState = (...args) => { push.push(["push", ...args]); origPush(...args); };
    window.history.replaceState = (...args) => { push.push(["replace", ...args]); origReplace(...args); };
    const visto = [];
    const onNav = (e) => visto.push(e.detail?.rota);
    window.addEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    try {
      solicitarNavegacaoInterna("/admin/cozinha");
      expect(visto).toEqual(["/admin/cozinha"]);
      expect(push).toEqual([]);
    } finally {
      window.removeEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    }
  });

  it("correção após aplicarRota é replace quando diverge e noop quando coincide", () => {
    expect(decidirCorrecaoUrlAposRota({
      pathSolicitado: "/admin/cozinha", pathEfetivo: "/admin/dashboard",
    })).toEqual({ metodo: "replace", path: "/admin/dashboard" });
    expect(decidirCorrecaoUrlAposRota({
      pathSolicitado: "/admin/cozinha", pathEfetivo: "/admin/cozinha",
    })).toEqual({ metodo: "noop" });
  });
});

function historicoSpy() {
  const historico = [];
  return {
    historico,
    replaceState(_s, _t, path) { historico.push(["replace", path]); },
    pushState(_s, _t, path) { historico.push(["push", path]); },
  };
}

/** Espelha aplicarRota do App usando a classificarPathname real (sem React). */
function aplicarRotaComoApp(pathname, search, tela) {
  const classe = classificarPathname(pathname);
  if (classe.tipo === "admin_cozinha") {
    if (tela.bloqueioPlano) {
      tela.tab = tela.temAdmin ? "admin" : "kitchen";
      return { aceita: true, path: "/admin/cozinha", bloqueadaPlano: true };
    }
    tela.tab = "kitchen";
    return { aceita: true, path: "/admin/cozinha" };
  }
  if (classe.tipo === "admin" || classe.tipo === "admin_raiz") {
    const seg = classe.tipo === "admin_raiz" ? "dashboard" : classe.secao;
    tela.tab = "admin";
    tela.section = seg;
    return { aceita: true, path: `/admin/${seg}` };
  }
  if (classe.tipo === "operacional") {
    const sub = classe.sub || "central";
    tela.tab = "opmobile";
    tela.op = sub;
    return { aceita: true, path: sub === "central" ? "/operacional" : `/operacional/${sub}` };
  }
  if (classe.tipo === "app_raiz") {
    tela.tab = "admin";
    tela.section = "dashboard";
    return { aceita: true, path: "/admin/dashboard" };
  }
  if (classe.tipo === "app") {
    tela.tab = classe.seg;
    return { aceita: true, path: `/app/${classe.seg}` };
  }
  return { aceita: false, path: null, manterTela: true };
}

describe("REL-02D-AUTH-HISTORY-E — validação, manterTela e URL=tela", () => {
  it("1. string absoluta HTTPS é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("https://evil.example/")).toBeNull();
    expect(validarRotaNavegacaoInterna("https://evil.example/admin/cozinha")).toBeNull();
  });

  it("2. string absoluta HTTP é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("http://evil.example/")).toBeNull();
    expect(validarRotaNavegacaoInterna("http://evil.example/admin/dashboard")).toBeNull();
  });

  it("3. //evil.example é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("//evil.example/")).toBeNull();
    expect(validarRotaNavegacaoInterna("//evil.example/admin/cozinha")).toBeNull();
  });

  it("4. javascript: é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("javascript:alert(1)")).toBeNull();
    expect(validarRotaNavegacaoInterna("JAVASCRIPT:void(0)")).toBeNull();
  });

  it("5. data: é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("data:text/html,phishing")).toBeNull();
    expect(validarRotaNavegacaoInterna("blob:https://evil.example/x")).toBeNull();
  });

  it("6. string sem / inicial é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("admin/cozinha")).toBeNull();
    expect(validarRotaNavegacaoInterna("admin/dashboard")).toBeNull();
  });

  it("7. string vazia é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("")).toBeNull();
    expect(validarRotaNavegacaoInterna("   ")).toBeNull();
  });

  it("8. objeto/null/undefined são rejeitados", () => {
    expect(validarRotaNavegacaoInterna(null)).toBeNull();
    expect(validarRotaNavegacaoInterna(undefined)).toBeNull();
    expect(validarRotaNavegacaoInterna({ rota: "/admin/cozinha" })).toBeNull();
    expect(validarRotaNavegacaoInterna(["/admin/cozinha"])).toBeNull();
  });

  it("9. / é rejeitada como navegação interna emitida", () => {
    expect(validarRotaNavegacaoInterna("/")).toBeNull();
  });

  it("10. /login é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("/login")).toBeNull();
  });

  it("11. /cardapio é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("/cardapio")).toBeNull();
    expect(validarRotaNavegacaoInterna("/cardapio/loja-x")).toBeNull();
  });

  it("12. rota desconhecida é rejeitada", () => {
    expect(validarRotaNavegacaoInterna("/nao-existe")).toBeNull();
    expect(validarRotaNavegacaoInterna("/admin/nao-existe")).toBeNull();
    expect(validarRotaNavegacaoInterna("/app/qualquer-coisa")).toBeNull();
  });

  it("13. segmento extra é rejeitado", () => {
    expect(validarRotaNavegacaoInterna("/admin/dashboard/extra")).toBeNull();
    expect(validarRotaNavegacaoInterna("/operacional/pedidos/extra")).toBeNull();
    expect(validarRotaNavegacaoInterna("/admin/cozinha/invalido")).toBeNull();
    expect(validarRotaNavegacaoInterna("/app/caixa/extra")).toBeNull();
    expect(classificarPathname("/admin/dashboard/extra").tipo).toBe("desconhecida");
    expect(classificarPathname("/operacional/pedidos/extra").tipo).toBe("desconhecida");
  });

  it("14. /admin//cozinha é rejeitada (não canonicaliza barra dupla)", () => {
    expect(validarRotaNavegacaoInterna("/admin//cozinha")).toBeNull();
    expect(classificarPathname("/admin//cozinha").tipo).toBe("desconhecida");
  });

  it("15. rota autenticada conhecida é aceita", () => {
    expect(validarRotaNavegacaoInterna("/admin/dashboard")).toBe("/admin/dashboard");
    expect(validarRotaNavegacaoInterna("/app/caixa")).toBe("/app/caixa");
    expect(validarRotaNavegacaoInterna("/operacional")).toBe("/operacional");
    expect(validarRotaNavegacaoInterna("  /admin/relatorios  ")).toBe("/admin/relatorios");
  });

  it("16. /admin/cozinha exata é aceita", () => {
    expect(validarRotaNavegacaoInterna("/admin/cozinha")).toBe("/admin/cozinha");
    expect(classificarPathname("/admin/cozinha").tipo).toBe("admin_cozinha");
  });

  it("17. destino real do NotificationBell é aceito", () => {
    expect(validarRotaNavegacaoInterna("/operacional/pedidos?destacar=pedido-1")).toBe(
      "/operacional/pedidos?destacar=pedido-1",
    );
    expect(validarRotaNavegacaoInterna("/operacional/caixa?destacar=abc-uuid")).toBe(
      "/operacional/caixa?destacar=abc-uuid",
    );
    expect(validarRotaNavegacaoInterna("/operacional")).toBe("/operacional");
  });

  it("18. query permitida é preservada e normalizada", () => {
    expect(validarRotaNavegacaoInterna("/admin/cozinha?setorId=4")).toBe("/admin/cozinha?setorId=4");
    expect(validarRotaNavegacaoInterna("/operacional/pedidos?destacar=PED-1024")).toBe(
      "/operacional/pedidos?destacar=PED-1024",
    );
  });

  it("19. query inesperada é removida (pathname canônico permanece)", () => {
    expect(validarRotaNavegacaoInterna("/admin/dashboard?foo=bar")).toBe("/admin/dashboard");
    expect(validarRotaNavegacaoInterna("/operacional/pedidos?destacar=ok&evil=1")).toBe(
      "/operacional/pedidos?destacar=ok",
    );
    expect(validarRotaNavegacaoInterna("/admin/cozinha?setorId=4&foo=x")).toBe("/admin/cozinha?setorId=4");
    expect(validarRotaNavegacaoInterna("/operacional/pedidos?destacar=../x")).toBe("/operacional/pedidos");
  });

  it("20. solicitarNavegacaoInterna não emite evento para rota inválida", () => {
    const visto = [];
    const onNav = (e) => visto.push(e.detail);
    window.addEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    try {
      expect(solicitarNavegacaoInterna("https://evil.example/")).toBeNull();
      expect(solicitarNavegacaoInterna("//evil.example/")).toBeNull();
      expect(solicitarNavegacaoInterna("/login")).toBeNull();
      expect(solicitarNavegacaoInterna("")).toBeNull();
      expect(solicitarNavegacaoInterna({ rota: "/admin/cozinha" })).toBeNull();
      expect(visto).toEqual([]);
    } finally {
      window.removeEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    }
  });

  it("21. solicitarNavegacaoInterna emite uma vez para rota válida", () => {
    const visto = [];
    const onNav = (e) => visto.push(e.detail?.rota);
    window.addEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    try {
      expect(solicitarNavegacaoInterna("/admin/cozinha")).toBe("/admin/cozinha");
      expect(visto).toEqual(["/admin/cozinha"]);
    } finally {
      window.removeEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    }
  });

  it("22-26. listener rejeita evento manual inválido: sem aplicarRota, sem history, sem mudar tela", () => {
    const aplicar = vi.fn(() => ({ aceita: true, path: "/admin/dashboard" }));
    const aplicarSegura = vi.fn(() => "/admin/dashboard");
    const spy = historicoSpy();
    const tela = { tab: "kitchen" };
    const invalidos = [
      "https://evil.example/",
      "http://evil.example/",
      "//evil.example/",
      "javascript:alert(1)",
      { rota: "/admin/cozinha" },
      undefined,
      "/login",
      "/admin/dashboard/extra",
    ];
    for (const rotaBruta of invalidos) {
      const r = processarNavegacaoInterna({
        rotaBruta,
        historyApi: spy,
        pathAtual: "/admin/cozinha",
        pathAtualEfetivo: "/admin/cozinha",
        rotaSegura: "/admin/dashboard",
        aplicarRota: aplicar,
        aplicarRotaSegura: aplicarSegura,
      });
      expect(r.aceito).toBe(false);
      expect(r.aplicarRotaChamada).toBe(false);
      expect(r.encerrarSessao).toBe(false);
    }
    expect(aplicar).not.toHaveBeenCalled();
    expect(aplicarSegura).not.toHaveBeenCalled();
    expect(spy.historico).toEqual([]);
    expect(tela.tab).toBe("kitchen");
  });

  it("27-29. manterTela restaura o path da tela atual com replace, nunca push nem home silenciosa", () => {
    const tela = { tab: "kitchen" };
    const pilha = criarPilha("/admin/dashboard/extra");
    const aplicar = vi.fn(() => ({ aceita: false, path: null, manterTela: true }));
    const aplicarSegura = vi.fn(() => {
      tela.tab = "admin";
      return "/admin/dashboard";
    });
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/admin/dashboard/extra",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      pathAtualEfetivo: "/admin/cozinha",
      aplicarRota: aplicar,
      aplicarRotaSegura: aplicarSegura,
    });
    expect(aplicar).toHaveBeenCalled();
    expect(aplicarSegura).not.toHaveBeenCalled();
    expect(r.resolvido.manterTela).toBe(true);
    expect(r.correcao.metodo).toBe("replace");
    expect(r.correcao.metodo).not.toBe("push");
    expect(r.encerrarSessao).toBe(false);
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(pilha.atual).not.toBe("/admin/dashboard");
    expect(tela.tab).toBe("kitchen");
    expect(resolverResultadoAplicarRota({
      resultado: { aceita: false, path: null, manterTela: true },
      pathSolicitado: "/admin/foo",
      pathAtualEfetivo: "/admin/cozinha",
      rotaSegura: "/admin/dashboard",
    })).toMatchObject({ path: "/admin/cozinha", manterTela: true, aplicarRotaSegura: false });
  });

  it("30. popstate /app termina com URL e tela coerentes (Policy A: rota segura)", () => {
    const tela = { tab: "kitchen", section: "cozinha" };
    const pilha = criarPilha("/app");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/app",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      pathAtualEfetivo: "/admin/cozinha",
      aplicarRota: (p, s) => aplicarRotaComoApp(p, s, tela),
    });
    expect(ehRotaProtegida("/app")).toBe(true);
    expect(classificarPathname("/app").tipo).toBe("app_raiz");
    expect(tela.tab).toBe("admin");
    expect(tela.section).toBe("dashboard");
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(pilha.atual).not.toBe("/app");
    expect(r.correcao.metodo).toBe("replace");
    expect(r.correcao.metodo).not.toBe("push");
    expect(r.encerrarSessao).toBe(false);
  });

  it("31. popstate /app/ termina com URL e tela coerentes", () => {
    const tela = { tab: "kitchen" };
    const pilha = criarPilha("/app/");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/app/",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      pathAtualEfetivo: "/admin/cozinha",
      aplicarRota: (p, s) => aplicarRotaComoApp(p, s, tela),
    });
    expect(tela.tab).toBe("admin");
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(pilha.atual).not.toBe("/app/");
    expect(r.correcao.metodo).toBe("replace");
    expect(r.encerrarSessao).toBe(false);
  });

  it("32. rota negada conhecida termina com URL e tela coerentes", () => {
    const pilha = criarPilha("/app/tablet");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/app/tablet",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      pathAtualEfetivo: "/admin/dashboard",
      aplicarRota: () => ({ aceita: false, path: "/admin/dashboard" }),
    });
    expect(r.correcao.metodo).toBe("replace");
    expect(pilha.atual).toBe("/admin/dashboard");
    expect(r.encerrarSessao).toBe(false);
  });

  it("33. bloqueio de plano em /admin/cozinha permanece coerente", () => {
    const tela = { tab: "admin", bloqueioPlano: true, temAdmin: true };
    const pilha = criarPilha("/admin/cozinha");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/admin/cozinha",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      pathAtualEfetivo: "/admin/dashboard",
      aplicarRota: (p, s) => aplicarRotaComoApp(p, s, tela),
    });
    expect(r.resultado.bloqueadaPlano).toBe(true);
    expect(r.correcao.metodo).toBe("noop");
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(tela.tab).toBe("admin");
  });

  it("34. admin_bloqueado não aceita segmento extra", () => {
    expect(classificarPathname("/admin/cozinha/invalido").tipo).toBe("desconhecida");
    const tela = { tab: "kitchen", bloqueioPlano: true, temAdmin: true };
    const pilha = criarPilha("/admin/cozinha/invalido");
    const r = executarPopstate({
      historyApi: pilha,
      pathname: "/admin/cozinha/invalido",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      pathAtualEfetivo: "/admin/cozinha",
      aplicarRota: (p, s) => aplicarRotaComoApp(p, s, tela),
    });
    expect(r.resultado.manterTela).toBe(true);
    expect(r.resultado.bloqueadaPlano).toBeUndefined();
    expect(tela.tab).toBe("kitchen");
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(r.correcao.metodo).toBe("replace");
  });

  it("35. NotificationBell inválido não navega", () => {
    const aplicar = vi.fn();
    const spy = historicoSpy();
    const visto = [];
    const onNav = (e) => visto.push(e.detail?.rota);
    window.addEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    try {
      expect(solicitarNavegacaoInterna("https://evil.example/admin")).toBeNull();
      expect(solicitarNavegacaoInterna("/cardapio")).toBeNull();
      expect(visto).toEqual([]);
    } finally {
      window.removeEventListener(EVENTO_NAVEGAR_INTERNA, onNav);
    }
    const r = processarNavegacaoInterna({
      rotaBruta: "/admin/cozinha/invalido",
      historyApi: spy,
      pathAtual: "/admin/dashboard",
      pathAtualEfetivo: "/admin/dashboard",
      rotaSegura: "/admin/dashboard",
      aplicarRota: aplicar,
    });
    expect(r.aceito).toBe(false);
    expect(aplicar).not.toHaveBeenCalled();
    expect(spy.historico).toEqual([]);
    expect(bellSource).toContain("if (!n?.rota) return");
  });

  it("36. NotificationBell permitido produz apenas um push", () => {
    const pilha = criarPilha("/admin/dashboard");
    const aplicar = vi.fn(() => ({ aceita: true, path: "/admin/cozinha" }));
    const r = processarNavegacaoInterna({
      rotaBruta: "/admin/cozinha",
      historyApi: pilha,
      pathAtual: "/admin/dashboard",
      pathAtualEfetivo: "/admin/dashboard",
      rotaSegura: "/admin/dashboard",
      aplicarRota: aplicar,
    });
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(r.metodo).toBe("push");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
    expect(pilha.atual).toBe("/admin/cozinha");
  });

  it("37. Voltar/Avançar Dashboard ↔ Cozinha continua funcionando", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    pilha.back();
    expect(pilha.atual).toBe("/admin/dashboard");
    executarPopstate({
      historyApi: pilha,
      pathname: pilha.pathname,
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/dashboard" }),
    });
    pilha.forward();
    executarPopstate({
      historyApi: pilha,
      pathname: pilha.pathname,
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/cozinha" }),
    });
    expect(pilha.atual).toBe("/admin/cozinha");
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard", "/admin/cozinha"]);
  });

  it("38. Ctrl+F5 continua sem duplicar entrada", () => {
    const pilha = criarPilha("/admin/dashboard");
    escrever(pilha, "/admin/dashboard", "/admin/cozinha");
    const antes = pilha.snapshot();
    expect(escrever(pilha, "/admin/cozinha", "/admin/cozinha", { primeiraSync: true }).metodo).toBe("noop");
    expect(pilha.snapshot().stack).toEqual(antes.stack);
  });

  it("39. login continua com replace", () => {
    const pilha = criarPilha("/login");
    const d = escrever(pilha, "/login", "/admin/dashboard", { primeiraSync: true });
    expect(d.metodo).toBe("replace");
    expect(pilha.snapshot().stack).not.toContain("/login");
  });

  it("40. logout continua com replace /login", () => {
    const pilha = criarPilha("/admin/cozinha");
    const d = decidirHistoricoLogout(pilha.atual);
    expect(d.metodo).toBe("replace");
    expect(d.path).toBe("/login");
    aplicarEscritaHistorico(pilha, d);
    expect(pilha.atual).toBe("/login");
  });

  it("41. nenhum popstate usa push", () => {
    const spy = historicoSpy();
    const casos = [
      { pathname: "/app", autenticado: true, rotaSegura: "/admin/dashboard" },
      { pathname: "/app/", autenticado: true, rotaSegura: "/admin/dashboard" },
      { pathname: "/admin/dashboard/extra", autenticado: true, rotaSegura: "/admin/dashboard" },
      { pathname: "/", autenticado: true, rotaSegura: "/admin/dashboard" },
      { pathname: "/login", autenticado: true, rotaSegura: "/admin/dashboard" },
    ];
    for (const c of casos) {
      expect(decidirPopstate(c).metodo).not.toBe("push");
      executarPopstate({
        historyApi: spy,
        ...c,
        pathAtualEfetivo: "/admin/cozinha",
        aplicarRota: (p, s) => aplicarRotaComoApp(p, s, { tab: "kitchen" }),
      });
    }
    expect(spy.historico.every((h) => h[0] !== "push")).toBe(true);
  });

  it("42. nenhum caso chama logout por simples navegação", () => {
    const r = processarNavegacaoInterna({
      rotaBruta: "/admin/cozinha",
      historyApi: historicoSpy(),
      pathAtual: "/admin/dashboard",
      pathAtualEfetivo: "/admin/dashboard",
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/cozinha" }),
    });
    expect(r.encerrarSessao).toBe(false);
    expect(executarPopstate({
      historyApi: criarPilha("/app"),
      pathname: "/app",
      autenticado: true,
      rotaSegura: "/admin/dashboard",
      aplicarRota: () => ({ aceita: true, path: "/admin/dashboard" }),
    }).encerrarSessao).toBe(false);
  });

  it("43. nenhuma correção cria loop", () => {
    const pilha = criarPilha("/app");
    const tela = { tab: "kitchen" };
    for (let i = 0; i < 6; i += 1) {
      const r = executarPopstate({
        historyApi: pilha,
        pathname: pilha.pathname,
        autenticado: true,
        rotaSegura: "/admin/dashboard",
        pathAtualEfetivo: rotaDoEstado(tela.tab === "admin" ? "admin" : "kitchen"),
        aplicarRota: (p, s) => aplicarRotaComoApp(p, s, tela),
      });
      expect(r.metodo).not.toBe("push");
      expect(r.encerrarSessao).toBe(false);
    }
    expect(pilha.snapshot().stack).toEqual(["/admin/dashboard"]);
    expect(tela.tab).toBe("admin");
  });
});

