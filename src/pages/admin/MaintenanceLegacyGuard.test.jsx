// @vitest-environment jsdom
//
// PDB-I3-HML-PREVIEW-A2 — Client demo safety hardening (somente front-end).
//
// Garante que, durante a prévia da nova experiência, NENHUMA mutation do painel
// legado ("Controle atual") pode ser executada por engano — nem por botão, nem por
// estado visual alterado, nem chamando o handler direto — e que as ações críticas
// da nova UI continuam desabilitadas. Leitura (Atualizar, estado, fases) segue viva.
//
// Rede: `fetch` é mockado localmente; cada request é classificado como LEITURA
// (GET /api/maintenance?scope=admin, POST /api/releases {action:"status"} — este
// último é um POST de consulta) ou MUTAÇÃO (qualquer outra coisa).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getSessionMock = vi.fn();
vi.mock("../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const { default: MaintenanceAdmin } = await import("./MaintenanceAdmin.jsx");
const { default: AmbientesAdmin } = await import("./AmbientesAdmin.jsx");
const {
  LEGACY_MAINTENANCE_CAPABILITIES,
  LEGACY_MAINTENANCE_LOCK_NOTICE,
  resolveLegacyMaintenanceCapabilities,
} = await import("./manutencao/legacyMaintenanceCapabilities.js");
const { default: MaintenanceActions } = await import("./manutencao/MaintenanceActions.jsx");
const { default: PreviewNotice } = await import("./PreviewNotice.jsx");

const dir = dirname(fileURLToPath(import.meta.url));
const TOKEN = "token-a2";
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_SHA = "b".repeat(40);
const LIBERADO = { canMutateLegacyMaintenance: true };
const BLOQUEADO = { canMutateLegacyMaintenance: false };

// Todas as ações mutáveis do painel legado (por texto do botão).
const ACOES_MUTAVEIS = ["Iniciar orquestração", "Confirmar início", "Iniciar aviso de manutenção", "Confirmar aviso"];
// Ações estritamente de leitura.
const ACOES_LEITURA = ["Atualizar"];

const adminState = (o = {}) => ({
  phase: "NORMAL", version: 3, epoch: 0, releaseId: null, targetSha: null, reason: null,
  noticeStartedAt: null, scheduledFor: null, fenceEffectiveAt: null, messagePublic: null,
  updatedAt: "2026-09-11T10:00:00.000Z", ...o,
});
const boundState = (o = {}) => adminState({ releaseId: RELEASE_ID, targetSha: TARGET_SHA, ...o });
const activeRelease = () => ({
  releaseId: RELEASE_ID, status: "REQUESTED", targetSha: TARGET_SHA, baseSha: "a".repeat(40),
  requestedBy: { userId: null, email: "marco@example.com" },
});

// Backend mockado: registra e classifica cada request.
function mockBackend({ state = adminState() } = {}) {
  const reads = [];
  const mutations = [];
  globalThis.fetch = vi.fn((url, opts = {}) => {
    const u = new URL(String(url), "http://localhost");
    const method = String(opts.method || "GET").toUpperCase();
    const body = (() => { try { return JSON.parse(opts.body || "{}"); } catch { return {}; } })();
    const ok = (payload) => Promise.resolve({ ok: true, status: 200, json: async () => payload });

    if (u.pathname === "/api/maintenance" && method === "GET" && u.searchParams.get("scope") === "admin") {
      reads.push(`GET ${u.pathname}?scope=admin`);
      return ok({ ok: true, state });
    }
    if (u.pathname === "/api/releases" && method === "POST" && body.action === "status") {
      reads.push("POST /api/releases {action:status}");
      return ok({ ok: true, action: "status", activeRelease: activeRelease() });
    }
    mutations.push(`${method} ${u.pathname} ${opts.body || ""}`);
    return ok({ ok: true });
  });
  return { reads, mutations };
}

let root;
let container;
const q = (sel, ctx = container) => ctx.querySelector(sel);
const qa = (sel, ctx = container) => Array.from(ctx.querySelectorAll(sel));
// Nome acessível: aria-label quando existe (botões com contexto), senão o texto.
const botao = (texto, ctx = container) => qa("button", ctx).find((b) => (b.getAttribute("aria-label") || b.textContent).includes(texto));
const botaoExato = (texto, ctx = container) => qa("button", ctx).find((b) => b.textContent.trim() === texto);
const click = async (el) => { await act(async () => { el.click(); }); };
const flush = async (n = 4) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const abrirAba = async (nome) => { await click(qa('[role="tab"]').find((t) => t.textContent.includes(nome))); await flush(); };
const digitar = async (el, valor) => {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
// Chama o handler React DIRETO (ignora `disabled` do DOM) — simula "handler escape".
const chamarOnClickDireto = async (el) => {
  const chave = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  const onClick = el[chave]?.onClick;
  expect(typeof onClick, "o botão deve ter handler para o teste ser significativo").toBe("function");
  await act(async () => { await onClick({ preventDefault() {}, stopPropagation() {} }); });
};

async function montar(legacyCapabilities) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(legacyCapabilities === undefined ? <MaintenanceAdmin /> : <MaintenanceAdmin legacyCapabilities={legacyCapabilities} />); });
  return container;
}
const remontar = async (legacyCapabilities) => {
  await act(async () => { root.render(<MaintenanceAdmin legacyCapabilities={legacyCapabilities} />); });
  await flush();
};
async function montarControleAtual(legacyCapabilities) {
  await montar(legacyCapabilities);
  await abrirAba("Controle atual");
}

beforeEach(() => {
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: TOKEN } } });
});
afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
  delete globalThis.fetch;
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
describe("A2 — capability do painel legado (fonte única, fail-closed)", () => {
  it("padrão da prévia: canMutateLegacyMaintenance = false, congelado", () => {
    expect(LEGACY_MAINTENANCE_CAPABILITIES).toEqual({ canMutateLegacyMaintenance: false });
    expect(Object.isFrozen(LEGACY_MAINTENANCE_CAPABILITIES)).toBe(true);
  });

  it("só o booleano true libera; qualquer outra coisa bloqueia", () => {
    expect(resolveLegacyMaintenanceCapabilities(LIBERADO).canMutateLegacyMaintenance).toBe(true);
    [undefined, null, {}, "true", 1, { canMutateLegacyMaintenance: "true" }, { canMutateLegacyMaintenance: 1 }, { canMutateLegacyMaintenance: undefined }]
      .forEach((raw) => expect(resolveLegacyMaintenanceCapabilities(raw).canMutateLegacyMaintenance, String(raw)).toBe(false));
  });

  it("o bloqueio não depende de hostname nem de ambiente HML/PROD", () => {
    const codigo = ["manutencao/legacyMaintenanceCapabilities.js", "manutencao/LegacyMaintenancePanel.jsx"]
      .map((f) => readFileSync(resolve(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))
      .join("\n");
    expect(codigo).not.toMatch(/location\.(hostname|host|origin)|import\.meta\.env|process\.env|window\.location|["'](hml|homologacao|producao|prod)["']/i);
  });

  it("estrutural: toda mutation do painel legado passa pela guarda (nenhuma mutation nova sem guarda)", () => {
    const codigo = readFileSync(resolve(dir, "manutencao/LegacyMaintenancePanel.jsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // Cada POST em /api/maintenance vive num executor `executarXxx` cuja 1ª instrução é a guarda.
    const executores = [...codigo.matchAll(/async function (executar\w+)\([^)]*\) \{\s*if \(!podeMutar\) return;/g)].map((m) => m[1]);
    const todosExecutores = [...codigo.matchAll(/async function (executar\w+)\(/g)].map((m) => m[1]);
    expect(todosExecutores.sort()).toEqual(["executarNotice", "executarStart"]);
    expect(executores.sort()).toEqual(todosExecutores);
    const postsMaintenance = [...codigo.matchAll(/fetch\("\/api\/maintenance",\s*\{\s*method: "POST"/g)];
    expect(postsMaintenance).toHaveLength(todosExecutores.length);
    // Toda ação mutável renderizada consulta a capability.
    expect(codigo.match(/disabled=\{!podeMutar/g)).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────
describe("A2 — Controle atual: bloqueado por padrão", () => {
  it("START (NORMAL sem vínculo): 'Iniciar orquestração' desabilitado, com motivo associado", async () => {
    mockBackend();
    await montarControleAtual();
    await flush();
    const start = botaoExato("Iniciar orquestração");
    expect(start).toBeTruthy();
    expect(start.disabled).toBe(true);
    const aviso = q('[data-testid="legacy-lock-notice"]');
    expect(start.getAttribute("aria-describedby")).toBe(aviso.id);
  });

  it("NOTICE (NORMAL com vínculo): 'Iniciar aviso de manutenção' desabilitado, com motivo associado", async () => {
    mockBackend({ state: boundState() });
    await montarControleAtual();
    await flush();
    const notice = botaoExato("Iniciar aviso de manutenção");
    expect(notice).toBeTruthy();
    expect(notice.disabled).toBe(true);
    expect(notice.getAttribute("aria-describedby")).toBe(q('[data-testid="legacy-lock-notice"]').id);
  });

  it.each([
    ["sem vínculo (START)", () => adminState()],
    ["com vínculo (NOTICE)", () => boundState()],
  ])("toda ação mutável presente está desabilitada e clicar não gera request — %s", async (_nome, estado) => {
    const rede = mockBackend({ state: estado() });
    await montarControleAtual();
    await flush();
    const presentes = ACOES_MUTAVEIS.map((t) => botaoExato(t)).filter(Boolean);
    expect(presentes.length).toBeGreaterThan(0);
    for (const b of presentes) {
      expect(b.disabled, b.textContent).toBe(true);
      await click(b);
    }
    await flush();
    expect(rede.mutations).toEqual([]);
    // nenhum formulário de escrita chegou a abrir
    expect(q("textarea")).toBeNull();
    expect(qa("input[type=datetime-local]")).toHaveLength(0);
    expect(botaoExato("Confirmar início")).toBeUndefined();
    expect(botaoExato("Confirmar aviso")).toBeUndefined();
  });

  it("fases avançadas (NOTICE…): nenhuma ação mutável e nenhuma mutation", async () => {
    const rede = mockBackend({ state: boundState({ phase: "NOTICE" }) });
    await montarControleAtual();
    await flush();
    ACOES_MUTAVEIS.forEach((t) => expect(botaoExato(t), t).toBeUndefined());
    expect(rede.mutations).toEqual([]);
  });

  it("aviso de prévia visível, discreto e sem linguagem de erro", async () => {
    mockBackend();
    await montarControleAtual();
    await flush();
    const aviso = q('[data-testid="legacy-lock-notice"]');
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toBe("Operações de manutenção estão bloqueadas durante a prévia da nova experiência.");
    expect(aviso.textContent).toBe(LEGACY_MAINTENANCE_LOCK_NOTICE);
    expect(aviso.getAttribute("role")).toBe("note");
    expect(qa('[role="alert"]', container).filter((a) => a.textContent.includes("bloqueadas"))).toHaveLength(0);
    expect(aviso.className).not.toMatch(/9F1239|FDF0F3|F3C1CE|red-/);
    // o cabeçalho do painel não afirma mais que a aba "pode alterar" o estado real
    expect(container.textContent).not.toContain("pode alterar o estado real");
    expect(container.textContent).toContain("apenas consulta o estado real da manutenção");
  });

  it("liberada por capability explícita: sem aviso de bloqueio e ações habilitadas", async () => {
    mockBackend();
    await montarControleAtual(LIBERADO);
    await flush();
    expect(q('[data-testid="legacy-lock-notice"]')).toBeNull();
    expect(botaoExato("Iniciar orquestração").disabled).toBe(false);
    expect(container.textContent).toContain("pode alterar o estado real");
  });

  it("capability liberada preserva o contrato legado: START confirma com 1 POST", async () => {
    const rede = mockBackend();
    await montarControleAtual(LIBERADO);
    await flush();
    await click(botaoExato("Iniciar orquestração"));
    await click(botaoExato("Confirmar início"));
    await flush();
    expect(rede.mutations).toHaveLength(1);
    expect(rede.mutations[0]).toContain("POST /api/maintenance");
    expect(rede.mutations[0]).toContain('"action":"start"');
  });
});

// ─────────────────────────────────────────────────────────────
describe("A2 — handler escape: capability false impede a mutation mesmo com estado/botão/handler", () => {
  it("START: formulário aberto (estado visual alterado) + capability revogada → botão desabilitado e handler direto não faz nada", async () => {
    const rede = mockBackend();
    await montarControleAtual(LIBERADO);
    await flush();
    await click(botaoExato("Iniciar orquestração"));
    expect(botaoExato("Confirmar início")).toBeTruthy(); // formulário aberto
    await remontar(BLOQUEADO); // mesmo estado, capability revogada
    const confirmar = botaoExato("Confirmar início");
    expect(confirmar, "o botão continua renderizado").toBeTruthy();
    expect(confirmar.disabled).toBe(true);
    await click(confirmar);
    await chamarOnClickDireto(confirmar); // handler existe e é chamado à força
    await flush();
    expect(rede.mutations).toEqual([]);
    expect(confirmar.textContent).toBe("Confirmar início"); // nunca entrou em "Iniciando…"
    expect(q('[role="alert"]', container)).toBeNull();
  });

  it("NOTICE: formulário preenchido (mensagem + NOTICE) + capability revogada → nada é enviado", async () => {
    const rede = mockBackend({ state: boundState() });
    await montarControleAtual(LIBERADO);
    await flush();
    await click(botaoExato("Iniciar aviso de manutenção"));
    await digitar(q("textarea"), "Manutenção às 22h");
    await digitar(qa("input").find((i) => i.placeholder === "NOTICE"), "NOTICE");
    expect(botaoExato("Confirmar aviso").disabled).toBe(false); // com capability, habilitaria
    await remontar(BLOQUEADO);
    const confirmar = botaoExato("Confirmar aviso");
    expect(confirmar.disabled).toBe(true);
    await chamarOnClickDireto(confirmar);
    await flush();
    expect(rede.mutations).toEqual([]);
    expect(confirmar.textContent).toBe("Confirmar aviso");
  });

  it("botão desabilitado reabilitado à força no DOM ainda não dispara mutation", async () => {
    const rede = mockBackend();
    await montarControleAtual();
    await flush();
    const start = botaoExato("Iniciar orquestração");
    start.removeAttribute("disabled");
    await click(start); // abre o formulário (não é mutation)
    const confirmar = botaoExato("Confirmar início");
    if (confirmar) {
      confirmar.removeAttribute("disabled");
      await click(confirmar);
      await chamarOnClickDireto(confirmar);
    }
    await flush();
    expect(rede.mutations).toEqual([]);
  });

  it("capability ausente/nula/inválida na prop também bloqueia", async () => {
    for (const cap of [null, {}, { canMutateLegacyMaintenance: "true" }]) {
      const rede = mockBackend();
      await montarControleAtual(cap);
      await flush();
      expect(botaoExato("Iniciar orquestração").disabled, JSON.stringify(cap)).toBe(true);
      expect(rede.mutations).toEqual([]);
      act(() => root.unmount());
      container.remove();
      root = null;
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe("A2 — ações de leitura preservadas + contagem de rede", () => {
  it("abrir a aba faz só leituras; 'Atualizar' continua ativo e faz mais leituras; 0 mutation", async () => {
    const rede = mockBackend();
    await montar();
    // Visão operacional (padrão): nenhuma rede
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await abrirAba("Controle atual");
    await flush();
    const leiturasAoAbrir = rede.reads.length;
    expect(leiturasAoAbrir).toBe(2); // GET admin + POST releases {status}
    ACOES_LEITURA.forEach((t) => expect(botao(t).disabled, t).toBe(false));

    await click(botao("Atualizar"));
    await flush();
    expect(rede.reads.length).toBe(leiturasAoAbrir + 2);
    expect(rede.mutations).toEqual([]);
  });

  it("estado atual, fases do ciclo e data continuam visíveis (somente leitura)", async () => {
    mockBackend({ state: boundState({ reason: "janela 22h" }) });
    await montarControleAtual();
    await flush();
    expect(container.textContent).toContain("Estado atual");
    expect(container.textContent).toContain("Fases do ciclo");
    expect(container.textContent).toContain("janela 22h");
    expect(container.textContent).toContain("Atualizado há");
    expect(qa("h2").map((h) => h.textContent)).toEqual(expect.arrayContaining(["Estado atual", "Fases do ciclo"]));
  });

  it("interagir com TODOS os controles do 'Controle atual' (clicar em cada botão) gera 0 mutation", async () => {
    for (const state of [adminState(), boundState()]) {
      const rede = mockBackend({ state });
      await montarControleAtual();
      await flush();
      for (const b of qa("button", q('[role="tabpanel"]'))) {
        await click(b);
        await flush(2);
      }
      expect(rede.mutations, JSON.stringify(state.releaseId)).toEqual([]);
      expect(rede.reads.length).toBeGreaterThanOrEqual(2);
      act(() => root.unmount());
      container.remove();
      root = null;
      delete globalThis.fetch;
    }
  });
});

// ─────────────────────────────────────────────────────────────
describe("A2 — ações críticas da nova UI permanecem desabilitadas (0 rede)", () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = vi.fn(() => { throw new Error("rede proibida na prévia"); });
    globalThis.fetch = fetchSpy;
  });

  it("Manutenção › Visão operacional: Iniciar manutenção, Cancelar e Reconciliar desabilitados", async () => {
    await montar();
    for (const t of ["Iniciar manutenção", "Cancelar", "Reconciliar"]) {
      const b = botaoExato(t, q('[aria-label="Ações da manutenção"]'));
      expect(b, t).toBeTruthy();
      expect(b.disabled, t).toBe(true);
      await click(b);
    }
    expect(botaoExato("Ver detalhes").disabled).toBe(false); // ação não mutável
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("mesmo com todas as capabilities true, sem handler explícito nada habilita", async () => {
    const capabilities = {
      canStart: true, canCancel: true, canRetry: true, canReconcile: true, canViewDetails: true,
      help: { start: "x", cancel: "x", retry: "x", reconcile: "x", details: "x", notIntegrated: "Ação ainda não integrada." },
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<MaintenanceActions capabilities={capabilities} failure={{ isFailed: true }} details={{ sections: [], phases: [], backupLevels: [] }} />);
    });
    for (const t of ["Iniciar manutenção", "Cancelar", "Tentar novamente", "Reconciliar"]) {
      expect(botaoExato(t).disabled, t).toBe(true);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Versões & Atualizações: Executar atualização, Confirmar agendamento e Executar reversão desabilitados", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<AmbientesAdmin />); });
    const dialogo = () => document.querySelector('[role="dialog"]');

    expect(botaoExato("Executar atualização").disabled).toBe(true);
    await click(botao("Revisar execução"));
    expect(botaoExato("Executar atualização", dialogo()).disabled).toBe(true);
    await click(botaoExato("Fechar", dialogo()));
    await click(botaoExato("Agendar atualização"));
    expect(botaoExato("Confirmar agendamento", dialogo()).disabled).toBe(true);
    await click(botaoExato("Fechar", dialogo()));
    await abrirAba("Histórico");
    await click(botao("Avaliar reversão de v1.4.2 Release 003"));
    expect(botaoExato("Executar reversão", dialogo()).disabled).toBe(true);
    await click(botaoExato("Executar reversão", dialogo()));

    expect(fetchSpy).not.toHaveBeenCalled(); // 0 requests externos nas abas de prévia
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe("A2 — accent da marca (#F38525) perceptível sem violar a regra petróleo do admin", () => {
  // A regra global admin-acao-petroleo remapeia, como tokens de classe INTEIROS,
  // bg-/border-/text-[#F38525] (ações). Marcadores decorativos usam variantes que a
  // regra não casa (after:bg-…, border-l-…, ring-…/NN).
  const tokens = (el) => el.className.split(/\s+/);
  const REMAPEADOS = ["bg-[#F38525]", "border-[#F38525]", "text-[#F38525]"];

  it("aba selecionada: marcador laranja decorativo; abas e botões continuam petróleo", async () => {
    mockBackend();
    await montar();
    const selecionada = q('[role="tab"][aria-selected="true"]');
    expect(tokens(selecionada)).toContain("bg-[#012E46]");
    expect(tokens(selecionada)).toContain("after:bg-[#F38525]");
    REMAPEADOS.forEach((t) => expect(tokens(selecionada), t).not.toContain(t));
    const outra = q('[role="tab"][aria-selected="false"]');
    expect(tokens(outra).join(" ")).not.toContain("F38525");
  });

  it("PreviewNotice: borda esquerda laranja decorativa", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root.render(<PreviewNotice label="Prévia.">Dados de exemplo.</PreviewNotice>); });
    const nota = q('[data-testid="preview-notice"]');
    expect(tokens(nota)).toContain("border-l-[#F38525]");
    REMAPEADOS.forEach((t) => expect(tokens(nota), t).not.toContain(t));
  });

  it("aviso de bloqueio do legado e etapa atual do stepper usam o accent", async () => {
    mockBackend();
    await montarControleAtual();
    await flush();
    expect(tokens(q('[data-testid="legacy-lock-notice"]'))).toContain("border-l-[#F38525]");
    await abrirAba("Visão operacional");
    const atual = q('li[aria-current="step"] span.rounded-full');
    if (atual) {
      expect(tokens(atual)).toContain("ring-[#F38525]/30");
      REMAPEADOS.forEach((t) => expect(tokens(atual), t).not.toContain(t));
    }
  });

  it("botões de ação NÃO viram laranja: nenhum fill laranja sólido nos módulos de prévia", () => {
    const arquivos = ["AdminTabs.jsx", "PreviewNotice.jsx", "manutencao/MaintenanceActions.jsx", "manutencao/PhaseStepper.jsx", "versoes/ExecutionReviewModal.jsx", "versoes/ReversalModal.jsx", "versoes/ScheduleModal.jsx"];
    arquivos.forEach((f) => {
      const codigo = readFileSync(resolve(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(codigo, f).not.toMatch(/(^|[\s"'`])bg-\[#F38525\]([\s"'`]|$)/);
    });
  });
});
