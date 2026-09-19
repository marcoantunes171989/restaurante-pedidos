// @vitest-environment jsdom
//
// PDB-I3-FE3 — Versões & Atualizações: experiência de demonstração (somente
// front-end). Nenhuma rede: fetch e supabase são espiões que NÃO podem ser
// chamados nas abas de prévia. Nenhuma ação real existe — todas as ações
// críticas finais permanecem desabilitadas.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getSessionMock = vi.fn();
vi.mock("../../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const { default: AmbientesAdmin } = await import("../AmbientesAdmin.jsx");
const { default: MaintenanceAdmin } = await import("../MaintenanceAdmin.jsx");
const { default: ReversalModal } = await import("./ReversalModal.jsx");
const { default: ExecutionReviewModal } = await import("./ExecutionReviewModal.jsx");
const { default: ScheduleModal } = await import("./ScheduleModal.jsx");
const { default: ReleaseActions } = await import("../ambientes/ReleaseActions.jsx");
const { VERSION_FIXTURE } = await import("./versionFixture.js");
const { normalizeVersionSnapshot } = await import("./versionAdapter.js");
const { buildVersionsPageViewModel, buildExecutionReviewViewModel, buildScheduleFormViewModel } = await import("./versionViewModels.js");
const { RELEASE_ENVIRONMENTS_FIXTURE } = await import("../ambientes/releaseFixture.js");
const { buildReleaseEnvironmentsPageViewModel } = await import("../ambientes/releaseViewModels.js");
const { MAINTENANCE_FIXTURE } = await import("../manutencao/maintenanceFixture.js");
const { buildMaintenancePageViewModel } = await import("../manutencao/maintenanceViewModels.js");

const dir = dirname(fileURLToPath(import.meta.url));
let root;
let container;
let fetchSpy;

async function renderNode(node) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(node); });
  return container;
}
const q = (sel, ctx = container) => ctx.querySelector(sel);
const qa = (sel, ctx = container) => Array.from(ctx.querySelectorAll(sel));
const dialogo = () => document.querySelector('[role="dialog"]');
// Nome acessível: aria-label quando existe (botões com contexto), senão o texto.
const botao = (texto, ctx = document) => qa("button", ctx).find((b) => (b.getAttribute("aria-label") || b.textContent).includes(texto));
const botaoExato = (texto, ctx = document) => qa("button", ctx).find((b) => b.textContent.trim() === texto);
const click = async (el) => { await act(async () => { el.click(); }); };
const teclar = async (el, key, extra = {}) => { await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...extra })); }); };
const aba = (nome) => qa('[role="tab"]').find((t) => t.textContent === nome);
const abrirAba = async (nome) => { await click(aba(nome)); };
const campo = (rotulo, ctx = document) => {
  const label = qa("label", ctx).find((l) => l.textContent.includes(rotulo));
  return label ? document.getElementById(label.htmlFor) : null;
};
const digitar = async (el, valor) => {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
};
const sair = async (el) => { await act(async () => { el.focus(); el.blur(); }); };

const snapshot = (patch) => normalizeVersionSnapshot({ ...VERSION_FIXTURE, ...patch });
const fonteEstatica = (snap) => ({ kind: "fixture", getSnapshot: () => snap, subscribe: () => () => {} });
const renderCentral = (props = {}) => renderNode(<AmbientesAdmin {...props} />);

beforeEach(() => {
  getSessionMock.mockReset();
  fetchSpy = vi.fn(() => { throw new Error("rede proibida na prévia"); });
  globalThis.fetch = fetchSpy;
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
describe("central — cabeçalho, abas e navegação", () => {
  it("cabeçalho 'Versões & Atualizações' com subtítulo do módulo", async () => {
    await renderCentral();
    expect(q("h1").textContent).toContain("Versões & Atualizações");
    expect(container.textContent).toContain("Gerencie ambientes, versões, releases e atualizações do Pedido Prime.");
    expect(q('[data-module="versoes-atualizacoes"]')).toBeTruthy();
  });

  it("abas: Visão geral · Versões & Releases · Deploys · Histórico (sem 'Versões' duplicada)", async () => {
    await renderCentral();
    const abas = qa('[role="tab"]');
    expect(abas.map((a) => a.textContent)).toEqual(["Visão geral", "Versões & Releases", "Deploys", "Histórico"]);
    expect(q('[role="tablist"]').getAttribute("aria-label")).toBe("Seções de Versões & Atualizações");
    expect(abas.filter((a) => /Versões/.test(a.textContent))).toHaveLength(1);
  });

  it("'Ambientes' continua sendo uma seção dentro da Visão geral", async () => {
    await renderCentral();
    expect(qa("article[data-environment]").map((a) => a.dataset.environment)).toEqual(["homologacao", "producao"]);
  });

  it("teclado: setas/Home/End percorrem as 4 abas com roving tabindex", async () => {
    await renderCentral();
    const lista = q('[role="tablist"]');
    await teclar(lista, "ArrowRight");
    expect(aba("Versões & Releases").getAttribute("aria-selected")).toBe("true");
    expect(aba("Versões & Releases").tabIndex).toBe(0);
    expect(aba("Visão geral").tabIndex).toBe(-1);
    await teclar(lista, "End");
    expect(aba("Histórico").getAttribute("aria-selected")).toBe("true");
    await teclar(lista, "ArrowRight");
    expect(aba("Visão geral").getAttribute("aria-selected")).toBe("true");
    await teclar(lista, "ArrowLeft");
    expect(aba("Histórico").getAttribute("aria-selected")).toBe("true");
    expect(q('[role="tabpanel"]').getAttribute("aria-labelledby")).toBe(aba("Histórico").id);
  });

  it("atalho 'Acompanhar manutenção' só navega (handler local) e não usa rede", async () => {
    const onIr = vi.fn();
    await renderCentral({ onAcompanharManutencao: onIr });
    const b = botaoExato("Acompanhar manutenção", container);
    expect(b).toBeTruthy();
    await click(b);
    expect(onIr).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem handler de navegação não há atalho (nada morto na tela)", async () => {
    await renderCentral();
    expect(botao("Acompanhar manutenção", container)).toBeUndefined();
  });

  it("Deploys (legado) preserva o painel ao vivo e só ele consulta a rede", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderCentral();
    for (const nome of ["Versões & Releases", "Histórico", "Visão geral"]) await abrirAba(nome);
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    await abrirAba("Deploys");
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Sessão indisponível.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("permanecer nas prévias não dispara rede nem sessão", async () => {
    await renderCentral();
    await abrirAba("Versões & Releases");
    await click(botao("Ver detalhes"));
    await teclar(dialogo(), "Escape");
    await abrirAba("Histórico");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe("aba Versões & Releases", () => {
  beforeEach(async () => {
    await renderCentral();
    await abrirAba("Versões & Releases");
  });

  it("sem fonte canônica: 'Versão do produto ainda não configurada' (nenhuma versão inventada)", () => {
    const rotulo = q('[data-testid="product-version-label"]');
    expect(rotulo.textContent).toBe("Versão do produto ainda não configurada");
    expect(rotulo.dataset.configured).toBe("false");
    expect(q('[data-testid="product-version"]').textContent).not.toMatch(/\b1\.0\.0\b|\b0\.0\.0\b/);
  });

  it("modelo de versionamento: MAJOR.MINOR.PATCH, semântica curta, release sequencial e build opcional", () => {
    const politica = q('[data-testid="version-policy"]');
    expect(politica.textContent).toContain("Modelo de versionamento");
    expect(q('[data-testid="version-format"]').textContent).toBe("MAJOR.MINOR.PATCH");
    expect(politica.textContent).toContain("1.0.0 · 1.1.0 · 1.1.1 · 2.0.0");
    expect(q('[data-part="MAJOR"]').textContent).toContain("Mudança estrutural ou incompatível relevante.");
    expect(q('[data-part="MINOR"]').textContent).toContain("Nova funcionalidade compatível.");
    expect(q('[data-part="PATCH"]').textContent).toContain("Correção ou ajuste compatível.");
    expect(politica.textContent).toMatch(/Sequencial por versão/);
    expect(politica.textContent).toMatch(/Build:.*opcional/);
    expect(politica.textContent).not.toMatch(/\b\d+\.\d+\.\d+\.\d+\b/); // sem quarta casa
  });

  it("legenda dos 9 estados de release, com texto (não só cor)", () => {
    const itens = qa("[data-status-legend]", q('[data-testid="status-legend"]'));
    expect(itens.map((i) => i.dataset.statusLegend)).toEqual([
      "DRAFT", "VALIDATED", "APPROVED", "SCHEDULED", "RUNNING", "SUCCEEDED", "FAILED", "SUPERSEDED", "ROLLED_BACK",
    ]);
    itens.forEach((i) => {
      expect(i.textContent.trim().length).toBeGreaterThan(2);
      expect(i.querySelector("svg")).toBeTruthy();
    });
  });

  it("registros claramente marcados como EXEMPLO / PRÉVIA (seção e cada linha)", () => {
    expect(q('[data-testid="example-section-badge"]').textContent).toBe("EXEMPLO / PRÉVIA");
    expect(q('[data-testid="example-notice"]').textContent).toMatch(/não são releases reais/i);
    const linhas = qa("li[data-release]");
    expect(linhas).toHaveLength(6);
    linhas.forEach((l) => expect(l.querySelector('[data-testid="example-badge"]').textContent).toBe("Exemplo"));
    expect(q('[data-testid="preview-notice"]').textContent).toContain("Prévia da funcionalidade");
  });

  it("uma versão com várias releases: v1.4.2 → Release 003, 002, 001; v1.4.1 → 004, 003", () => {
    const v142 = q('section[data-version="1.4.2"]');
    expect(qa("h4", v142).map((h) => h.textContent)).toEqual(["v1.4.2 · Release 003", "v1.4.2 · Release 002", "v1.4.2 · Release 001"]);
    const v141 = q('section[data-version="1.4.1"]');
    expect(qa("h4", v141).map((h) => h.textContent)).toEqual(["v1.4.1 · Release 004", "v1.4.1 · Release 003"]);
    expect(qa("section[data-version] h3").map((h) => h.textContent)).toEqual(["v1.5.0", "v1.4.2", "v1.4.1"]);
    expect(v142.textContent).toContain("3 releases");
  });

  it("cada release mostra commit, banco, data, migrations, notas e status (texto + ícone)", () => {
    const linha = q('li[data-release="exemplo-1.4.2-003"]');
    expect(linha.textContent).toContain("e5f6a75");
    expect(linha.textContent).toContain("157");
    expect(linha.textContent).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(linha.textContent).toContain("3 migrations");
    expect(linha.textContent).toContain("Publicada");
    expect(q('[data-testid="release-notes-excerpt"]', linha).textContent).toContain("Correção de arredondamento");
    expect(q('li[data-release="exemplo-1.4.2-002"]').textContent).toContain("Falhou");
    expect(q('li[data-release="exemplo-1.4.2-001"]').textContent).toContain("Revertida");
    expect(q('li[data-release="exemplo-1.5.0-001"]').textContent).toContain("Rascunho");
    expect(q('li[data-release="exemplo-1.5.0-001"]').textContent).toContain("Desconhecido"); // baseline não informado
    linha.querySelectorAll("span.rounded-full").forEach((b) => expect(b.querySelector("svg") || b.textContent).toBeTruthy());
  });

  it("layout responsivo: dados em 2 colunas no celular e 4 no md, sem tabela larga", () => {
    const dl = q("li[data-release] dl");
    expect(dl.className).toMatch(/grid-cols-2/);
    expect(dl.className).toMatch(/md:grid-cols-4/);
    expect(q("table")).toBeNull();
  });

  it("detalhes da release: todos os campos pedidos, drawer acessível", async () => {
    const abrir = botao("Ver detalhes");
    abrir.focus();
    await click(abrir);
    const d = dialogo();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-labelledby")).toBe(q("h2", d).id);
    // a primeira release renderizada é a da versão mais nova (v1.5.0 · Release 001)
    expect(q("h2", d).textContent).toBe("v1.5.0 · Release 001");
    ["Versão", "Release", "ID da release", "Commit (SHA)", "Build", "Baseline do banco", "Origem", "Destino", "Criada em", "Publicada em", "Publicada por", "Release anterior"]
      .forEach((rotulo) => expect(qa("dt", d).map((t) => t.textContent)).toContain(rotulo));
    expect(d.textContent).toContain("Migrations (0)");
    expect(q('[data-testid="release-notes"]', d).textContent).toContain("Rascunho de uma próxima versão");
    expect(d.textContent).toContain("Somente leitura");
  });

  it("detalhes de uma release publicada: SHA, baseline, migrations, notas, anterior e ator", async () => {
    await click(botao("Ver detalhes de v1.4.2 · Release 003"));
    const d = dialogo();
    const dd = (rotulo) => qa("dt", d).find((t) => t.textContent === rotulo).nextElementSibling.textContent;
    expect(dd("Commit (SHA)")).toBe("e5f6a75");
    expect(dd("Baseline do banco")).toBe("157");
    expect(dd("Build")).toBe("Não informado");
    expect(dd("Origem")).toBe("Homologação");
    expect(dd("Destino")).toBe("Produção");
    expect(dd("Publicada por")).toBe("Administrador (exemplo)");
    expect(dd("Release anterior")).toBe("v1.4.2 · Release 002");
    expect(d.textContent).toContain("157_exemplo_nova_tabela_auditoria.sql");
    expect(q('[data-testid="example-badge"]', d).textContent).toBe("EXEMPLO / PRÉVIA");
  });

  it("Esc fecha o drawer e devolve o foco ao botão que o abriu", async () => {
    const abrir = botao("Ver detalhes de v1.4.2 · Release 003");
    abrir.focus();
    await click(abrir);
    expect(dialogo()).toBeTruthy();
    expect(document.activeElement).toBe(botao("Fechar"));
    await teclar(document.activeElement, "Escape");
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it("foco preso: Tab no último elemento volta ao primeiro; Shift+Tab no primeiro vai ao último", async () => {
    await click(botao("Ver detalhes de v1.4.2 · Release 003"));
    const focaveis = qa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', dialogo());
    const ultimo = focaveis[focaveis.length - 1];
    ultimo.focus();
    await teclar(ultimo, "Tab");
    expect(document.activeElement).toBe(focaveis[0]);
    await teclar(focaveis[0], "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("sem releases: estado vazio explicativo", async () => {
    root.unmount();
    container.remove();
    await renderCentral({ versionDataSource: fonteEstatica(snapshot({ releases: [] })) });
    await abrirAba("Versões & Releases");
    expect(q('[data-testid="releases-empty"]').textContent).toContain("Nenhuma release registrada.");
    expect(qa("li[data-release]")).toHaveLength(0);
  });

  it("dados de versão em erro: mensagem segura, sem quebrar a central", async () => {
    root.unmount();
    container.remove();
    await renderCentral({ versionDataSource: fonteEstatica(normalizeVersionSnapshot(null)) });
    await abrirAba("Versões & Releases");
    expect(q('[role="alert"]').textContent).toContain("Não foi possível carregar as versões e releases.");
    expect(q("h1").textContent).toContain("Versões & Atualizações");
  });
});

// ─────────────────────────────────────────────────────────────
describe("aba Histórico", () => {
  beforeEach(async () => {
    await renderCentral();
    await abrirAba("Histórico");
  });

  it("sequência imutável, agrupada por versão (mais nova primeiro), marcada como exemplo", () => {
    expect(q('[data-testid="history-order-note"]').textContent).toMatch(/imutável/i);
    expect(q('[data-testid="example-section-badge"]').textContent).toBe("EXEMPLO / PRÉVIA");
    expect(qa("section[data-history-version]").map((s) => s.dataset.historyVersion)).toEqual(["1.5.0", "1.4.2", "1.4.1"]);
    const v142 = q('section[data-history-version="1.4.2"]');
    expect(qa("li[data-entry]", v142).map((li) => li.dataset.type)).toEqual([
      "RELEASE_PUBLISHED", "RELEASE_FAILED", "REVERSAL", "RELEASE_PUBLISHED", "VERSION_CREATED",
    ]);
    expect(qa("li[data-entry]", v142)[0].textContent).toContain("Release 003");
    expect(qa("li[data-entry]", q('section[data-history-version="1.4.1"]')).map((li) => li.dataset.type)).toEqual([
      "RELEASE_PUBLISHED", "RELEASE_PUBLISHED", "VERSION_CREATED",
    ]);
  });

  it("nenhum controle de edição ou exclusão (histórico imutável)", () => {
    expect(qa("button").map((b) => b.textContent.trim()).filter((t) => /editar|excluir|remover|apagar/i.test(t))).toEqual([]);
  });

  it("cada evento traz data, ator, duração, commit, banco, destino, release anterior e notas", () => {
    const e = q('li[data-entry="h-08"]');
    expect(e.textContent).toContain("Release publicada");
    expect(e.textContent).toContain("Publicada");
    expect(e.textContent).toMatch(/Registrado em: \d{2}\/\d{2}\/\d{4}/);
    expect(e.textContent).toContain("Ator: Administrador (exemplo)");
    expect(e.textContent).toContain("Duração: 14 min 30 s");
    expect(e.textContent).toContain("Commit: e5f6a75");
    expect(e.textContent).toContain("Banco: 157");
    expect(e.textContent).toContain("Destino: Produção");
    expect(e.textContent).toContain("Release anterior: v1.4.2 · Release 002");
  });

  it("relação de reversão exibida: 'Reversão da Release 001 (v1.4.2)'", () => {
    const rev = q('li[data-type="REVERSAL"]');
    expect(q('[data-testid="rollback-relation"]', rev).textContent).toBe("Reversão da Release 001 (v1.4.2)");
    expect(rev.textContent).toContain("Revertida");
    expect(rev.textContent).toContain("O banco não foi restaurado");
    expect(rev.textContent).not.toMatch(/conclu[ií]d/i);
  });

  it("'Ver release' abre os detalhes da release do evento", async () => {
    await click(botao("Ver release de v1.4.2 Release 003"));
    expect(q("h2", dialogo()).textContent).toBe("v1.4.2 · Release 003");
  });

  it("'Avaliar reversão' só habilitado quando há destino anterior publicado", () => {
    expect(botao("Avaliar reversão de v1.4.2 Release 003").disabled).toBe(false);
    expect(botao("Avaliar reversão de v1.4.1 Release 003").disabled).toBe(true); // primeira release
  });

  it("histórico vazio: estado vazio com explicação", async () => {
    root.unmount();
    container.remove();
    await renderCentral({ versionDataSource: fonteEstatica(snapshot({ history: [] })) });
    await abrirAba("Histórico");
    const vazio = q('[data-testid="history-empty"]');
    expect(vazio.textContent).toContain("Nenhum registro no histórico.");
    expect(vazio.textContent).toMatch(/aparecerão aqui/);
    expect(qa("li[data-entry]")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe("avaliar reversão (modal de análise)", () => {
  beforeEach(async () => {
    await renderCentral();
    await abrirAba("Histórico");
  });
  const abrirModal = async (rotulo = "Avaliar reversão de v1.4.2 Release 003") => {
    const b = botao(rotulo);
    b.focus();
    await click(b);
    return { modal: dialogo(), gatilho: b };
  };

  it("abre como diálogo modal nomeado, com resumo associado (aria-describedby)", async () => {
    const { modal } = await abrirModal();
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(q("h2", modal).textContent).toBe("Avaliar reversão — v1.4.2 · Release 003");
    const resumo = document.getElementById(modal.getAttribute("aria-describedby"));
    expect(resumo).toBeTruthy();
    expect(resumo.textContent).toContain("Reverter é uma operação que precisa ser analisada");
  });

  it("botão é 'Avaliar reversão' — nunca 'Reverter agora'", () => {
    expect(botao("Avaliar reversão")).toBeTruthy();
    expect(container.textContent).not.toMatch(/Reverter agora/i);
  });

  it("explica reversão da aplicação × recuperação do banco e a preservação de dados", async () => {
    const { modal } = await abrirModal();
    const conceitos = q('[data-testid="reversal-concepts"]', modal);
    expect(conceitos.textContent).toContain("Reversão da aplicação");
    expect(conceitos.textContent).toContain("Retorna o código para uma release anterior compatível.");
    expect(conceitos.textContent).toContain("Recuperação do banco");
    expect(conceitos.textContent).toContain("É um processo separado e de alto controle.");
    expect(conceitos.textContent).toMatch(/não apaga nem restaura o banco de dados automaticamente/);
    expect(q('[data-testid="data-preservation"]', modal).textContent).toBe("Os dados de Produção não são automaticamente descartados ou substituídos ao retornar uma release.");
    expect(q('[data-testid="data-preservation"]', modal).getAttribute("role")).toBe("note");
    expect(modal.textContent).not.toMatch(/restaura(r|mos)? (o )?banco automaticamente(?!.*não)/);
  });

  it("alvo só entre as releases do exemplo: publicadas e anteriores à origem", async () => {
    const { modal } = await abrirModal();
    const select = campo("Release de destino", modal);
    expect(qa("option", select).map((o) => o.textContent)).toEqual([
      "Selecione a release de destino",
      "v1.4.1 · Release 004 — Substituída",
      "v1.4.1 · Release 003 — Substituída",
    ]);
  });

  it("sem destino: resumo vazio; com destino: avalia código, banco, compatibilidade, risco, backup, aprovação e motivo", async () => {
    const { modal } = await abrirModal();
    const resumo = q('[data-testid="reversal-summary"]', modal);
    expect(q('[data-row="destino"]', resumo).textContent).toContain("Selecione uma release de destino.");
    expect(q('[data-row="risco-dados"]', resumo).textContent).toContain("Não avaliado");
    expect(q('[data-row="origem"]', resumo).textContent).toContain("v1.4.2 · Release 003");

    await digitar(campo("Release de destino", modal), "exemplo-1.4.1-004");
    await digitar(campo("Motivo da reversão", modal), "Erro na emissão de pedidos");
    expect(q('[data-row="destino"]', resumo).textContent).toContain("v1.4.1 · Release 004");
    expect(q('[data-row="codigo"] dd', resumo).textContent).toBe("e5f6a75 → b2c3d42");
    expect(q('[data-row="banco"] dd', resumo).textContent).toBe("baseline 157 → 156");
    expect(q('[data-row="compatibilidade"]', resumo).textContent).toContain("Compatível");
    expect(q('[data-row="compatibilidade"]', resumo).textContent).toContain("Estrutura do banco alterada");
    expect(q('[data-row="risco-dados"]', resumo).textContent).toContain("Alto");
    expect(q('[data-row="backup"]', resumo).textContent).toContain("Obrigatório");
    expect(q('[data-row="recuperacao"]', resumo).textContent).toContain("Plano específico ou migration corretiva");
    expect(q('[data-row="aprovacao"]', resumo).textContent).toContain("Aprovação humana pendente");
    expect(q('[data-row="motivo"] dd', resumo).textContent).toBe("Erro na emissão de pedidos");
  });

  it("alerta de risco semântico (role=alert, texto 'Risco alto', ícone) e plano de recuperação exigido", async () => {
    const { modal } = await abrirModal();
    expect(q("[role=alert][data-alert]", modal)).toBeNull(); // só há a nota informativa antes de escolher
    await digitar(campo("Release de destino", modal), "exemplo-1.4.1-004");
    const alerta = q('[data-alert="schema-changed"]', modal);
    expect(alerta.getAttribute("role")).toBe("alert");
    expect(alerta.textContent).toContain("Risco alto:");
    expect(alerta.textContent).toContain("Alterações incompatíveis de banco exigem plano específico de recuperação ou migration corretiva.");
    expect(alerta.querySelector("svg")).toBeTruthy();
    expect(alerta.className).toMatch(/border-2/); // tom 'critical' (borda dupla), não só cor
  });

  it("'Executar reversão' desabilitado, com motivo visível associado (aria-describedby)", async () => {
    const { modal } = await abrirModal();
    const exec = botaoExato("Executar reversão", modal);
    expect(exec.disabled).toBe(true);
    const motivo = document.getElementById(exec.getAttribute("aria-describedby"));
    expect(motivo.textContent).toMatch(/Indisponível/);
    expect(motivo.textContent).toMatch(/apenas avalia/);
    await click(exec);
    expect(dialogo()).toBeTruthy(); // nada acontece
  });

  it("capabilities: avaliar permitido, executar não; sem handler nem com capability true habilita", async () => {
    const versions = buildVersionsPageViewModel(snapshot());
    expect(versions.capabilities).toEqual({ canEvaluateReversal: true, canExecuteReversal: false });
    root.unmount();
    container.remove();
    const liberada = { ...versions, capabilities: { canEvaluateReversal: true, canExecuteReversal: true } };
    await renderNode(<ReversalModal versions={liberada} sourceReleaseId="exemplo-1.4.2-003" onFechar={() => {}} />);
    expect(botaoExato("Executar reversão").disabled).toBe(true); // capability true, sem handler explícito
    root.unmount();
    container.remove();
    const onExecute = vi.fn();
    await renderNode(<ReversalModal versions={versions} sourceReleaseId="exemplo-1.4.2-003" onFechar={() => {}} onExecute={onExecute} />);
    await click(botaoExato("Executar reversão"));
    expect(onExecute).not.toHaveBeenCalled(); // handler sem capability
  });

  it("sem rollback falso: nada muda, sem timer, sem 'concluído', sem rede", async () => {
    vi.useFakeTimers();
    try {
      const antes = qa("li[data-entry]").map((li) => li.textContent).join("|");
      const { modal } = await abrirModal();
      await digitar(campo("Release de destino", modal), "exemplo-1.4.1-004");
      await digitar(campo("Motivo da reversão", modal), "Motivo de teste da análise");
      await click(campo("Estou ciente", modal));
      await click(botaoExato("Executar reversão", modal));
      await act(async () => { vi.advanceTimersByTime(60000); });
      expect(modal.textContent).not.toMatch(/revers[ãa]o conclu[ií]da|rollback conclu[ií]do|revertid[ao] com sucesso/i);
      expect(vi.getTimerCount()).toBe(0);
      await click(botaoExato("Fechar", modal));
      expect(dialogo()).toBeNull();
      expect(qa("li[data-entry]").map((li) => li.textContent).join("|")).toBe(antes);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("formulário acessível: campos rotulados, obrigatórios e erros locais com role=alert", async () => {
    const { modal } = await abrirModal();
    const destino = campo("Release de destino", modal);
    const motivo = campo("Motivo da reversão", modal);
    const ciente = campo("Estou ciente", modal);
    [destino, motivo, ciente].forEach((c) => {
      expect(c).toBeTruthy();
      expect(c.getAttribute("aria-required")).toBe("true");
    });
    expect(modal.querySelector('[role="alert"][id$="-erro"]')).toBeNull();
    await sair(motivo);
    const erro = document.getElementById(motivo.getAttribute("aria-describedby").split(" ")[0]);
    expect(erro.getAttribute("role")).toBe("alert");
    expect(erro.textContent).toMatch(/Descreva o motivo/);
    expect(motivo.getAttribute("aria-invalid")).toBe("true");
    await digitar(motivo, "Motivo suficientemente longo");
    expect(motivo.getAttribute("aria-invalid")).toBeNull();
  });

  it("Esc fecha e o foco volta ao botão 'Avaliar reversão'", async () => {
    const { gatilho } = await abrirModal();
    await teclar(document.activeElement, "Escape");
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("modal cabe no celular: tela cheia (sm: centralizado), conteúdo rolável e rodapé fixo", async () => {
    const { modal } = await abrirModal();
    expect(modal.className).toMatch(/h-full/);
    expect(modal.className).toMatch(/sm:max-h-\[90vh\]/);
    expect(modal.parentElement.className).toMatch(/sm:items-center/);
    expect(q(".overflow-y-auto", modal)).toBeTruthy();
  });

  it("origem sem release anterior publicada: explica em vez de oferecer destino", async () => {
    root.unmount();
    container.remove();
    const versions = buildVersionsPageViewModel(snapshot());
    await renderNode(<ReversalModal versions={versions} sourceReleaseId="exemplo-1.4.1-003" onFechar={() => {}} />);
    expect(q('[data-testid="reversal-no-candidates"]', dialogo()).textContent).toContain("Não há release anterior publicada");
  });
});

// ─────────────────────────────────────────────────────────────
describe("revisar execução (preview)", () => {
  beforeEach(async () => { await renderCentral(); });
  const abrirRevisao = async () => {
    const b = botao("Revisar execução");
    b.focus();
    await click(b);
    return { modal: dialogo(), gatilho: b };
  };

  it("nova ação não mutável 'Revisar execução' ao lado do 'Executar atualização' bloqueado", () => {
    expect(botao("Revisar execução").disabled).toBe(false);
    expect(botaoExato("Executar atualização", container).disabled).toBe(true);
  });

  it("abre diálogo com resumo associado (aria-describedby) e origem HML → destino PROD", async () => {
    const { modal } = await abrirRevisao();
    expect(modal.getAttribute("aria-modal")).toBe("true");
    const resumo = document.getElementById(modal.getAttribute("aria-describedby"));
    expect(resumo.dataset.testid).toBe("execution-summary");
    expect(resumo.textContent).toContain("Origem Homologação → destino Produção");
    expect(resumo.textContent).toContain("Release alvo 3fe4ae0");
    expect(resumo.textContent).toContain("3 migrations em preparação");
    expect(resumo.textContent).toMatch(/8 de 11 validações ainda precisam de atenção, 2 com bloqueio/);
    expect(q('[data-testid="review-flow"]', modal).textContent).toBe("HomologaçãoProdução");
  });

  it("mostra SHA alvo, migrations, readiness (bloqueadores visíveis), backup, sessões, write fence, aprovação e manutenção", async () => {
    const { modal } = await abrirRevisao();
    expect(modal.textContent).toContain("Release alvo (SHA)");
    expect(modal.textContent).toContain("3fe4ae0");
    expect(modal.textContent).toContain("Nenhuma release registrada associada a este plano.");
    const bloqueios = qa("li[data-blocker]", q('[data-testid="review-blockers"]', modal));
    expect(bloqueios.map((b) => b.dataset.blocker)).toEqual(["SCHEMA_SAFETY", "WRITE_FENCE"]);
    bloqueios.forEach((b) => expect(b.textContent).toContain("Bloqueado"));
    expect(bloqueios[1].textContent).toContain("13 caminhos de escrita direta");
    expect(q('[data-cell="backup"]', modal).textContent).toContain("Não iniciado");
    expect(q('[data-cell="sessoes"]', modal).textContent).toContain("Aguardando integração");
    expect(q('[data-cell="write-fence"]', modal).textContent).toContain("Em preparação · não validado");
    expect(q('[data-cell="manutencao"]', modal).textContent).toContain("Normal");
    expect(modal.textContent).toContain("Aprovação");
    expect(modal.textContent).toContain("Pendente");
    expect(qa("li", q('[data-testid="review-migrations"]', modal)).map((li) => li.textContent)).toEqual([
      expect.stringContaining("160_db_release_orchestrator_foundation.sql"),
      expect.stringContaining("161_canonical_session_admission.sql"),
      expect.stringContaining("162_db_release_runtime_hardening.sql"),
    ]);
    expect(modal.textContent).not.toMatch(/Zero comprovado|0 sess/i);
  });

  it("'Executar atualização' do modal continua desabilitado, com motivo associado; nada acontece ao clicar", async () => {
    const { modal } = await abrirRevisao();
    const exec = botaoExato("Executar atualização", modal);
    expect(exec.disabled).toBe(true);
    expect(exec.getAttribute("aria-describedby")).toBe(q('[data-testid="execute-reason"]', modal).id);
    expect(q('[data-testid="execute-reason"]', modal).textContent).toMatch(/Indisponível/);
    await click(exec);
    expect(dialogo()).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(modal.textContent).not.toMatch(/executando|em execução|atualização conclu[ií]da|sucesso/i);
  });

  it("canExecute=true sem handler continua desabilitado; sem capability o handler não é chamado", () => {
    const overview = buildReleaseEnvironmentsPageViewModel(RELEASE_ENVIRONMENTS_FIXTURE);
    const maintenance = buildMaintenancePageViewModel(MAINTENANCE_FIXTURE);
    const review = buildExecutionReviewViewModel({ overview, maintenance, releases: null });
    return (async () => {
      root?.unmount();
      container?.remove();
      await renderNode(<ExecutionReviewModal review={{ ...review, capabilities: { ...review.capabilities, canExecute: true } }} onFechar={() => {}} />);
      expect(botaoExato("Executar atualização").disabled).toBe(true);
      root.unmount();
      container.remove();
      const onExecute = vi.fn();
      await renderNode(<ExecutionReviewModal review={review} onFechar={() => {}} onExecute={onExecute} />);
      await click(botaoExato("Executar atualização"));
      expect(onExecute).not.toHaveBeenCalled();
    })();
  });

  it("Esc fecha e devolve o foco a 'Revisar execução'", async () => {
    const { gatilho } = await abrirRevisao();
    await teclar(document.activeElement, "Escape");
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("sem rede ao abrir e fechar a revisão", async () => {
    await abrirRevisao();
    await click(botaoExato("Fechar", dialogo()));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
describe("agendar atualização (formulário de prévia)", () => {
  beforeEach(async () => { await renderCentral(); });
  const abrirAgenda = async () => {
    const b = botaoExato("Agendar atualização", container);
    b.focus();
    await click(b);
    return { modal: dialogo(), gatilho: b };
  };

  it("abrir o formulário não é mutação: diálogo com aviso de prévia, sem rede", async () => {
    const { modal } = await abrirAgenda();
    expect(q("h2", modal).textContent).toBe("Agendar atualização");
    expect(q('[data-testid="schedule-preview-badge"]', modal).textContent).toBe("Prévia da funcionalidade");
    expect(modal.textContent).toContain("abrir e preencher não agenda nada");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("campos: data, horário, fuso (exibição), release, ambiente de destino, observações e ciência de aprovação — todos rotulados", async () => {
    const { modal } = await abrirAgenda();
    const esperados = {
      Data: "date", Horário: "time", "Fuso horário (exibição)": "SELECT", Release: "SELECT", "Ambiente de destino": "SELECT", Observações: "TEXTAREA", "Estou ciente": "checkbox",
    };
    Object.entries(esperados).forEach(([rotulo, tipo]) => {
      const el = campo(rotulo, modal);
      expect(el, rotulo).toBeTruthy();
      expect(el.type === tipo || el.tagName === tipo, rotulo).toBe(true);
    });
    expect(qa("option", campo("Ambiente de destino", modal)).map((o) => o.textContent)).toEqual(["Produção"]);
    expect(qa("option", campo("Fuso horário (exibição)", modal)).map((o) => o.textContent)).toEqual(["Brasília (GMT-3)"]);
    expect(qa("option", campo("Release", modal)).map((o) => o.textContent)).toEqual([
      "Selecione a release",
      "Plano atual da central — release alvo 3fe4ae0",
      "v1.5.0 · Release 001 — Rascunho (exemplo)",
    ]);
    ["Data", "Horário", "Release", "Ambiente de destino", "Estou ciente"].forEach((r) => expect(campo(r, modal).getAttribute("aria-required")).toBe("true"));
  });

  it("'Confirmar agendamento' desabilitado (canSchedule=false) com motivo associado — mesmo com o formulário válido", async () => {
    const { modal } = await abrirAgenda();
    const confirmar = botaoExato("Confirmar agendamento", modal);
    expect(confirmar.disabled).toBe(true);
    expect(confirmar.getAttribute("aria-describedby")).toBe(q('[data-testid="schedule-reason"]', modal).id);
    await digitar(campo("Data", modal), "2026-12-31");
    await digitar(campo("Horário", modal), "22:30");
    await digitar(campo("Release", modal), "plan-current");
    await digitar(campo("Observações", modal), "Janela noturna");
    await click(campo("Estou ciente", modal));
    expect(confirmar.disabled).toBe(true);
    await click(confirmar);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(modal.textContent).not.toMatch(/agendad[oa] com sucesso|agendamento confirmado/i);
  });

  it("erros locais acessíveis ao sair de campo obrigatório vazio; somem ao corrigir", async () => {
    const { modal } = await abrirAgenda();
    const data = campo("Data", modal);
    expect(data.getAttribute("aria-invalid")).toBeNull();
    await sair(data);
    expect(data.getAttribute("aria-invalid")).toBe("true");
    const erro = document.getElementById(data.getAttribute("aria-describedby"));
    expect(erro.getAttribute("role")).toBe("alert");
    expect(erro.textContent).toBe("Informe a data do agendamento.");
    await digitar(data, "2026-12-31");
    expect(data.getAttribute("aria-invalid")).toBeNull();
    const ciente = campo("Estou ciente", modal);
    await sair(ciente);
    expect(ciente.getAttribute("aria-invalid")).toBe("true");
  });

  it("nenhum POST/fetch: preencher, fechar e reabrir não persiste nada", async () => {
    const { modal } = await abrirAgenda();
    await digitar(campo("Observações", modal), "texto");
    await click(botaoExato("Fechar", modal));
    const { modal: novo } = await abrirAgenda();
    expect(campo("Observações", novo).value).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("Esc fecha e devolve o foco a 'Agendar atualização'", async () => {
    const { gatilho } = await abrirAgenda();
    await teclar(document.activeElement, "Escape");
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });

  it("ScheduleModal isolado: canSchedule=true sem handler continua desabilitado", async () => {
    root.unmount();
    container.remove();
    const overview = buildReleaseEnvironmentsPageViewModel(RELEASE_ENVIRONMENTS_FIXTURE);
    const form = buildScheduleFormViewModel({ overview, releases: null });
    await renderNode(<ScheduleModal form={{ ...form, capabilities: { ...form.capabilities, canSchedule: true } }} onFechar={() => {}} />);
    expect(botaoExato("Confirmar agendamento").disabled).toBe(true);
  });

  it("ReleaseActions sem view-models de prévia mantém o comportamento fail-closed anterior", async () => {
    root.unmount();
    container.remove();
    const vm = buildReleaseEnvironmentsPageViewModel(RELEASE_ENVIRONMENTS_FIXTURE);
    await renderNode(<ReleaseActions capabilities={vm.capabilities} readiness={vm.readiness} plan={vm.plan} migrations={vm.migrations} flow={vm.flow} safety={vm.safety} />);
    expect(botaoExato("Agendar atualização").disabled).toBe(true);
    expect(botao("Revisar execução")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
describe("Manutenção — volta para Versões & Atualizações", () => {
  it("atalho 'Voltar para Versões & Atualizações' só navega e coexiste com o selo de prévia", async () => {
    const onVoltar = vi.fn();
    await renderNode(<MaintenanceAdmin onVoltarParaVersoes={onVoltar} />);
    expect(q("h1").textContent).toContain("Manutenção");
    expect(q('[data-testid="preview-badge"]').textContent).toBe("Prévia da funcionalidade");
    const b = botaoExato("Voltar para Versões & Atualizações", container);
    expect(b).toBeTruthy();
    await click(b);
    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(q('[data-module="versoes-atualizacoes"]')).toBeTruthy();
  });

  it("sem handler não há atalho; o painel legado 'Controle atual' segue preservado", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderNode(<MaintenanceAdmin />);
    expect(botao("Voltar para Versões & Atualizações", container)).toBeUndefined();
    expect(qa('[role="tab"]').map((t) => t.textContent)).toEqual(["Visão operacional", "Controle atual"]);
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("fases/proteções continuam visíveis para a demonstração (stepper + proteções)", async () => {
    await renderNode(<MaintenanceAdmin />);
    expect(qa('li[data-step]')).toHaveLength(9);
    expect(q('section[aria-label="Fluxo da atualização"]')).toBeTruthy();
    expect(container.textContent).toContain("Write Fence");
    expect(container.textContent).toContain("Backup");
  });
});

// ─────────────────────────────────────────────────────────────
describe("fluxo de demonstração ao cliente (sem mutation)", () => {
  it("percorre HML×PROD → migrations → readiness → versão/release → plano → revisão → agenda → histórico → reversão", async () => {
    const onManutencao = vi.fn();
    await renderCentral({ onAcompanharManutencao: onManutencao });
    // 1-5: central, comparação HML × PROD, migrations e readiness
    expect(q("h1").textContent).toContain("Versões & Atualizações");
    expect(qa("article[data-environment]")).toHaveLength(2);
    expect(q('[data-testid="migration-headline"]').textContent).toBe("3 migrations em preparação");
    expect(q('[data-testid="readiness-headline"]') || container.textContent).toBeTruthy();
    expect(container.textContent).toContain("Readiness da atualização");
    // 6: plano
    await click(botao("Ver plano"));
    expect(dialogo()).toBeTruthy();
    await teclar(document.activeElement, "Escape");
    // 7-8: revisar execução e agendar
    await click(botao("Revisar execução"));
    expect(dialogo().textContent).toContain("Origem Homologação → destino Produção");
    await click(botaoExato("Fechar", dialogo()));
    await click(botaoExato("Agendar atualização", container));
    expect(botaoExato("Confirmar agendamento", dialogo()).disabled).toBe(true);
    await click(botaoExato("Fechar", dialogo()));
    // 9: atalho para Manutenção
    await click(botaoExato("Acompanhar manutenção", container));
    expect(onManutencao).toHaveBeenCalledTimes(1);
    // 5/11: versão/release e histórico
    await abrirAba("Versões & Releases");
    expect(q('[data-testid="product-version-label"]').textContent).toBe("Versão do produto ainda não configurada");
    await abrirAba("Histórico");
    // 12: avaliar reversão
    await click(botao("Avaliar reversão de v1.4.2 Release 003"));
    expect(botaoExato("Executar reversão", dialogo()).disabled).toBe(true);
    // nada de rede em todo o percurso
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("todas as ações críticas finais estão desabilitadas", async () => {
    await renderCentral();
    expect(botaoExato("Executar atualização", container).disabled).toBe(true);
    await click(botao("Revisar execução"));
    expect(botaoExato("Executar atualização", dialogo()).disabled).toBe(true);
    await click(botaoExato("Fechar", dialogo()));
    await click(botaoExato("Agendar atualização", container));
    expect(botaoExato("Confirmar agendamento", dialogo()).disabled).toBe(true);
    await click(botaoExato("Fechar", dialogo()));
    await abrirAba("Histórico");
    await click(botao("Avaliar reversão de v1.4.2 Release 003"));
    expect(botaoExato("Executar reversão", dialogo()).disabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe("higiene do front-end — sem tempo real falso, sem rede, sem navegação própria", () => {
  const arquivos = [
    ...readdirSync(dir).filter((f) => !f.includes(".test.") && (f.endsWith(".jsx") || f.endsWith(".js"))).map((f) => resolve(dir, f)),
    resolve(dir, "../AmbientesAdmin.jsx"),
    resolve(dir, "../MaintenanceAdmin.jsx"),
  ];
  const limpo = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("nenhum setTimeout/setInterval/heartbeat/progresso falso", () => {
    arquivos.forEach((f) => expect(limpo(f), f).not.toMatch(/\bsetTimeout\b|\bsetInterval\b|requestAnimationFrame|heartbeat\s*[:=]\s*(new Date|Date\.now)/));
  });

  it("nenhuma chamada de rede/Supabase nas telas e modelos do FE3", () => {
    arquivos.forEach((f) => expect(limpo(f), f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|supabase|from ["'][^"']*\/(server|api)\//));
  });

  it("nenhum handler de mutação embutido: os modais só recebem handlers por props explícitas", () => {
    ["ReversalModal.jsx", "ExecutionReviewModal.jsx", "ScheduleModal.jsx"].forEach((f) => {
      const codigo = limpo(resolve(dir, f));
      expect(codigo, f).toMatch(/onExecute = null|onConfirm = null/);
      expect(codigo, f).not.toMatch(/method:\s*["']POST["']|\.mutate\(|\.rpc\(|\.insert\(|\.update\(/);
    });
  });

  it("paleta oficial: sem fundo escuro administrativo nem sombras pesadas nos componentes novos", () => {
    arquivos.filter((f) => f.endsWith(".jsx") && f.includes("versoes")).forEach((f) => {
      const codigo = limpo(f);
      expect(codigo, f).not.toMatch(/bg-(black|slate-[89]00|gray-[89]00)|shadow-(lg|xl|2xl)|dark:/);
    });
  });
});
