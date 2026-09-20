// @vitest-environment jsdom
//
// PDB-I3-DOC1 — ajuda contextual nas páginas Versões & Atualizações e Manutenção.
// Nenhuma rede: fetch e supabase são espiões que NÃO podem ser chamados.
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
const { HELP_DOCS } = await import("./helpContent.js");

let root;
let container;
let fetchSpy;
let scrollSpy;

async function renderNode(node) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(node); });
  return container;
}

const q = (sel) => document.querySelector(sel);
const qa = (sel) => Array.from(document.querySelectorAll(sel));
const click = async (el) => { await act(async () => { el.click(); }); };
const dialogo = () => q('[role="dialog"]');
const botaoAjuda = () => q('[aria-label="Ajuda da página"]');
const abrirAjuda = async () => { await click(botaoAjuda()); return dialogo(); };
const abaPorNome = (nome) => qa('[role="tab"]').find((t) => t.textContent.includes(nome));
const topico = (titulo) => qa('nav[aria-label="Tópicos da ajuda"] button[aria-current], nav[aria-label="Tópicos da ajuda"] li button').find((b) => b.textContent.includes(titulo));
const topicoAtual = () => q('nav[aria-label="Tópicos da ajuda"] [aria-current="true"]');
const teclar = async (el, key, extra = {}) => {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra })); });
};
async function digitar(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const busca = () => q('input[type="search"]');
const secoesVisiveis = () => qa("[data-section]").map((s) => s.getAttribute("data-section"));

beforeEach(() => {
  getSessionMock.mockReset();
  fetchSpy = vi.fn(() => { throw new Error("rede proibida na ajuda"); });
  globalThis.fetch = fetchSpy;
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.body.innerHTML = "";
  root = null;
  container = null;
  delete globalThis.fetch;
  delete Element.prototype.scrollIntoView;
  vi.restoreAllMocks();
});

const PAGINAS = [
  ["Versões & Atualizações", () => renderNode(<AmbientesAdmin />), HELP_DOCS.versoes],
  ["Manutenção", () => renderNode(<MaintenanceAdmin />), HELP_DOCS.manutencao],
];

describe.each(PAGINAS)("ajuda contextual — %s", (_nome, montar, doc) => {
  it("exibe o botão de ajuda com nome acessível no cabeçalho", async () => {
    await montar();
    const botao = botaoAjuda();
    expect(botao).toBeTruthy();
    expect(botao.tagName).toBe("BUTTON");
    expect(botao.getAttribute("type")).toBe("button");
    expect(botao.getAttribute("aria-haspopup")).toBe("dialog");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.closest("header")).toBeTruthy();
    expect(botao.textContent).toContain("Ajuda");
    expect(dialogo()).toBeNull();
  });

  it("abre e fecha: dialog acessível, título ligado por aria-labelledby, botão Fechar", async () => {
    await montar();
    const d = await abrirAjuda();
    expect(d).toBeTruthy();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(d.getAttribute("aria-labelledby")).textContent).toBe(doc.title);
    expect(botaoAjuda().getAttribute("aria-expanded")).toBe("true");
    await click(q('[aria-label="Fechar ajuda"]'));
    expect(dialogo()).toBeNull();
  });

  it("foco entra no drawer, Esc fecha e o foco volta para o botão Ajuda", async () => {
    await montar();
    await abrirAjuda();
    expect(dialogo().contains(document.activeElement)).toBe(true);
    await teclar(document.activeElement, "Escape");
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(botaoAjuda());
  });

  it("fechar pelo botão ou pelo fundo também devolve o foco ao botão Ajuda", async () => {
    await montar();
    await abrirAjuda();
    await click(q('[aria-label="Fechar ajuda"]'));
    expect(document.activeElement).toBe(botaoAjuda());
    await abrirAjuda();
    await click(q('[data-testid="admin-help-overlay"]'));
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(botaoAjuda());
  });

  it("prende o foco no drawer (Tab e Shift+Tab)", async () => {
    await montar();
    await abrirAjuda();
    const focaveis = qa('[role="dialog"] button, [role="dialog"] input, [role="dialog"] summary');
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    expect(primeiro.getAttribute("aria-label")).toBe("Fechar ajuda");
    await act(async () => { ultimo.focus(); });
    await teclar(ultimo, "Tab");
    expect(document.activeElement).toBe(primeiro);
    await teclar(primeiro, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("campo de busca tem label \"Pesquisar na ajuda\"", async () => {
    await montar();
    await abrirAjuda();
    const campo = busca();
    const label = q(`label[for="${campo.id}"]`);
    expect(label.textContent).toBe("Pesquisar na ajuda");
  });

  it("mostra todos os tópicos sem busca e filtra ao pesquisar", async () => {
    await montar();
    await abrirAjuda();
    expect(secoesVisiveis()).toEqual(doc.sections.map((s) => s.id));
    await digitar(busca(), "backup");
    const visiveis = secoesVisiveis();
    expect(visiveis.length).toBeGreaterThan(0);
    expect(visiveis.length).toBeLessThan(doc.sections.length);
    expect(visiveis.some((id) => id === "backup" || id === "revisar-execucao")).toBe(true);
    expect(qa('nav[aria-label="Tópicos da ajuda"] li')).toHaveLength(visiveis.length);
    expect(q('[data-testid="help-result-count"]').textContent).toBe(`${visiveis.length} de ${doc.sections.length} tópicos`);
  });

  it("busca sem resultado mostra o estado vazio", async () => {
    await montar();
    await abrirAjuda();
    await digitar(busca(), "termo-que-nao-existe-xyz");
    expect(q('[data-testid="help-empty"]').textContent).toBe("Nenhum tópico encontrado para esta busca.");
    expect(secoesVisiveis()).toEqual([]);
    await click(q('[aria-label="Limpar busca"]'));
    expect(q('[data-testid="help-empty"]')).toBeNull();
    expect(secoesVisiveis()).toHaveLength(doc.sections.length);
  });

  it("a busca funciona sem acento e destaca a seção cujo título casa", async () => {
    await montar();
    await abrirAjuda();
    await digitar(busca(), "glossario");
    expect(q('[data-section="glossario"]').getAttribute("data-title-match")).toBe("true");
  });

  it("navegação rápida leva à seção, marca o tópico atual e move o foco", async () => {
    await montar();
    await abrirAjuda();
    const alvo = doc.sections.find((s) => s.id === "glossario");
    await click(topico(alvo.title));
    const secao = q('[data-section="glossario"]');
    expect(document.activeElement).toBe(secao);
    expect(scrollSpy).toHaveBeenCalled();
    expect(topicoAtual().textContent).toBe(alvo.title);
  });

  it("os tópicos são botões alcançáveis por teclado (sem tabindex negativo)", async () => {
    await montar();
    await abrirAjuda();
    const botoes = qa('nav[aria-label="Tópicos da ajuda"] li button');
    expect(botoes).toHaveLength(doc.sections.length);
    for (const b of botoes) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("tabindex")).not.toBe("-1");
    }
  });

  it("no celular a lista de tópicos é um acordeão recolhido que abre/fecha e recolhe ao escolher", async () => {
    await montar();
    await abrirAjuda();
    const alternar = qa('nav[aria-label="Tópicos da ajuda"] > button')[0];
    const lista = document.getElementById(alternar.getAttribute("aria-controls"));
    expect(alternar.getAttribute("aria-expanded")).toBe("false");
    expect(lista.className).toMatch(/\bhidden\b/);
    await click(alternar);
    expect(alternar.getAttribute("aria-expanded")).toBe("true");
    expect(lista.className).not.toMatch(/\bhidden\b/);
    await click(lista.querySelector("button"));
    expect(alternar.getAttribute("aria-expanded")).toBe("false");
  });

  it("nenhuma requisição ao abrir, pesquisar, navegar entre tópicos e fechar", async () => {
    await montar();
    const antes = fetchSpy.mock.calls.length;
    await abrirAjuda();
    await digitar(busca(), "reversão");
    await digitar(busca(), "");
    await click(topico("Glossário"));
    await click(q('[aria-label="Fechar ajuda"]'));
    expect(fetchSpy.mock.calls.length).toBe(antes);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("o drawer é largo no desktop e ocupa a tela no celular, sem overflow horizontal próprio", async () => {
    await montar();
    await abrirAjuda();
    const classes = q('[data-testid="admin-help-drawer"]').className;
    expect(classes).toContain("w-full");
    expect(classes).toContain("max-w-5xl");
    expect(classes).toContain("overflow-hidden");
    expect(q('[data-testid="admin-help-content"]').className).toContain("overflow-y-auto");
  });
});

describe("ajuda contextual — Versões & Atualizações", () => {
  it("abre em Ambientes na Visão geral", async () => {
    await renderNode(<AmbientesAdmin />);
    await abrirAjuda();
    expect(topicoAtual().textContent).toBe("Ambientes: Homologação e Produção");
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("abre em Versionamento na aba Versões & Releases", async () => {
    await renderNode(<AmbientesAdmin />);
    await click(abaPorNome("Versões & Releases"));
    await abrirAjuda();
    expect(topicoAtual().textContent).toBe("Versionamento (MAJOR.MINOR.PATCH)");
  });

  it("abre em Histórico na aba Histórico", async () => {
    await renderNode(<AmbientesAdmin />);
    await click(abaPorNome("Histórico"));
    await abrirAjuda();
    expect(topicoAtual().textContent).toBe("Histórico");
  });

  it("explica versão × release, reversão e que dados de HML não são copiados", async () => {
    await renderNode(<AmbientesAdmin />);
    await abrirAjuda();
    const texto = q('[data-testid="admin-help-content"]').textContent;
    for (const trecho of ["MAJOR.MINOR.PATCH", "Release 001", "Avaliar reversão", "NÃO deve restaurar nem apagar", "NÃO copia automaticamente", "pedidos", "clientes", "produtos", "vendas"]) {
      expect(texto, trecho).toContain(trecho);
    }
  });

  it("o atalho \"Acompanhar manutenção\" continua funcionando ao lado da ajuda", async () => {
    const onAcompanhar = vi.fn();
    await renderNode(<AmbientesAdmin onAcompanharManutencao={onAcompanhar} />);
    const atalho = qa("header button").find((b) => b.textContent.includes("Acompanhar manutenção"));
    expect(atalho).toBeTruthy();
    await click(atalho);
    expect(onAcompanhar).toHaveBeenCalledTimes(1);
    expect(botaoAjuda()).toBeTruthy();
  });
});

describe("ajuda contextual — Manutenção", () => {
  it("abre em Fluxo de manutenção na Visão operacional", async () => {
    await renderNode(<MaintenanceAdmin />);
    await abrirAjuda();
    expect(topicoAtual().textContent).toBe("Fluxo de manutenção (fases)");
  });

  it("explica fases, RELEASING, backup L1/L2/L3, RECOVERY_REQUIRED e glossário", async () => {
    await renderNode(<MaintenanceAdmin />);
    await abrirAjuda();
    const texto = q('[data-testid="admin-help-content"]').textContent;
    for (const fase of ["NOTICE", "FENCING", "DRAINING", "QUIESCENT", "BACKING_UP", "MIGRATING", "SMOKE", "Normalizado", "RELEASING", "APP_RELEASE"]) {
      expect(texto, fase).toContain(fase);
    }
    for (const nivel of ["L1 · Evidência do provedor", "L2 · Integridade do backup", "L3 · Rehearsal"]) expect(texto, nivel).toContain(nivel);
    expect(texto).toContain("RECOVERY_REQUIRED");
    expect(texto).toContain("reconciliação técnica");
    expect(q('[data-section="glossario"]')).toBeTruthy();
    for (const termo of ["Heartbeat", "Lease", "Write Fence", "Smoke Test"]) expect(q('[data-section="glossario"]').textContent).toContain(termo);
  });

  it("pesquisar por termos de exemplo devolve tópicos relevantes", async () => {
    await renderNode(<MaintenanceAdmin />);
    await abrirAjuda();
    await digitar(busca(), "write fence");
    expect(secoesVisiveis()).toContain("write-fence");
    await digitar(busca(), "recovery");
    expect(secoesVisiveis()).toContain("recovery-required");
    await digitar(busca(), "sessão");
    expect(secoesVisiveis()).toContain("sessoes");
    await digitar(busca(), "executor");
    expect(secoesVisiveis()).toContain("executor");
  });

  it("o selo de prévia e o atalho de volta continuam presentes com a ajuda", async () => {
    const onVoltar = vi.fn();
    await renderNode(<MaintenanceAdmin onVoltarParaVersoes={onVoltar} />);
    expect(q('[data-testid="preview-badge"]')).toBeTruthy();
    const voltar = qa("header button").find((b) => b.textContent.includes("Voltar para Versões & Atualizações"));
    await click(voltar);
    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(botaoAjuda()).toBeTruthy();
  });
});
