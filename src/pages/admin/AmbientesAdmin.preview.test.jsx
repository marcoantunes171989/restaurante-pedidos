// @vitest-environment jsdom
//
// PDB-I3-FE1 — Ambientes & Releases: aba "Visão geral" (prévia com fixture).
// Nenhuma rede: fetch e supabase são espiões que NÃO podem ser chamados.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getSessionMock = vi.fn();
vi.mock("../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: (...args) => getSessionMock(...args) } },
}));

const { default: AmbientesAdmin } = await import("./AmbientesAdmin.jsx");
const { default: ReleaseActions } = await import("./ambientes/ReleaseActions.jsx");
const { RELEASE_ENVIRONMENTS_FIXTURE } = await import("./ambientes/releaseFixture.js");
const { buildReleaseEnvironmentsPageViewModel } = await import("./ambientes/releaseViewModels.js");

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
const renderTela = (props = {}) => renderNode(<AmbientesAdmin {...props} />);

const q = (sel) => container.querySelector(sel);
const qa = (sel) => Array.from(container.querySelectorAll(sel));
const botao = (texto) => qa("button").find((b) => b.textContent.includes(texto));
const click = async (el) => { await act(async () => { el.click(); }); };
const dialogo = () => document.querySelector('[role="dialog"]');

function snapshot(patch) { return Object.freeze({ ...RELEASE_ENVIRONMENTS_FIXTURE, ...patch }); }
function dataSourceEstatico(snap, extra = {}) {
  return { kind: "fixture", getSnapshot: () => snap, subscribe: () => () => {}, ...extra };
}

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

describe("página — render e cabeçalho", () => {
  it("renderiza título, subtítulo, fonte e referência visual", async () => {
    await renderTela();
    expect(q("h1").textContent).toContain("Ambientes & Releases");
    expect(container.textContent).toContain("Acompanhe versões, validações e o processo de atualização entre Homologação e Produção.");
    expect(container.textContent).toContain("Fonte: Prévia (dados de exemplo)");
    expect(container.textContent).toMatch(/Referência visual:\s*19\/09\/2026/);
  });

  it("identifica a prévia sem apresentar fixture como dado live", async () => {
    await renderTela();
    const aviso = q('[data-testid="preview-notice"]');
    expect(aviso.textContent).toContain("Prévia da funcionalidade");
    expect(aviso.textContent).toContain("Interface em integração");
    expect(q('[data-source="fixture"]')).toBeTruthy();
    expect(container.textContent).not.toContain("Dados atualizados");
    expect(container.textContent).not.toContain("Ao vivo");
  });

  it("não há botão Atualizar na prévia (nenhum refresh de rede falso)", async () => {
    await renderTela();
    expect(botao("Atualizar")).toBeUndefined();
  });

  it("fixture não executa rede nem consulta sessão", async () => {
    await renderTela();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});

describe("cards de ambiente", () => {
  it("HML e PROD lado a lado (grid responsivo) com os fatos do view-model", async () => {
    await renderTela();
    const cards = qa("article[data-environment]");
    expect(cards.map((c) => c.dataset.environment)).toEqual(["homologacao", "producao"]);
    expect(cards[0].parentElement.className).toMatch(/grid-cols-1/);
    expect(cards[0].parentElement.className).toMatch(/lg:grid-cols-2/);

    const [hml, prod] = cards;
    expect(hml.textContent).toContain("Homologação");
    expect(hml.textContent).toContain("homologacao");
    expect(hml.textContent).toContain("3fe4ae0");
    expect(hml.querySelector('[data-testid="baseline-homologacao"]').textContent).toBe("159");
    expect(hml.textContent).toContain("Baseline auditado");
    expect(hml.textContent).toContain("Integração em preparação");
    expect(hml.textContent).toContain("160, 161 e 162");

    expect(prod.textContent).toContain("Produção");
    expect(prod.textContent).toContain("main");
    expect(prod.textContent).toContain("5abe71b");
  });

  it("baseline de PROD desconhecido: 'Baseline não verificado', sem migration inventada", async () => {
    await renderTela();
    const prod = q('article[data-environment="producao"]');
    expect(prod.querySelector('[data-testid="baseline-producao"]').textContent).toBe("Desconhecido");
    expect(prod.textContent).toContain("Baseline não verificado");
    expect(prod.textContent).not.toMatch(/\b16[012]\b/);
  });
});

describe("migrations", () => {
  it("lista 160/161/162 como 'em preparação', nunca 'prontas'", async () => {
    await renderTela();
    expect(q('[data-testid="migration-headline"]').textContent).toBe("3 migrations em preparação");
    const linhas = qa("li[data-migration]");
    expect(linhas.map((l) => l.dataset.migration)).toEqual([
      "160_db_release_orchestrator_foundation.sql",
      "161_canonical_session_admission.sql",
      "162_db_release_runtime_hardening.sql",
    ]);
    expect(container.textContent).not.toMatch(/prontas?\s+para/i);
  });

  it("todas exibem 'Execução automática bloqueada' e nunca auto-apply permitido", async () => {
    await renderTela();
    linhasComTexto("Execução automática bloqueada", 3);
    expect(container.textContent).not.toContain("Aplicação automática permitida");
    expect(container.textContent).not.toMatch(/\berro\b/i);
  });

  it("identidade abreviada na tabela; completa e copiável nos detalhes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await renderTela();
    const completo = "c9389b97d596c91e8630f6f3bf9f1b753e6f61d2660cafbf8e85aa683b0a4b04";
    expect(container.textContent).toContain("c9389b9");
    expect(container.textContent).not.toContain(completo);

    const toggle = botao("Ver detalhes") || qa("button").find((b) => /Ver detalhes de 160/.test(b.getAttribute("aria-label") || ""));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain(completo);
    expect(container.textContent).toContain("7f2784b5720aece674d953b32da351db21085421");

    await click(qa("button").find((b) => b.getAttribute("aria-label") === "Copiar SHA256"));
    expect(writeText).toHaveBeenCalledWith(completo);
    expect(container.textContent).toContain("Copiado");
  });

  it("clipboard indisponível não quebra a tela", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("negado")) }, configurable: true });
    await renderTela();
    await click(qa("button").find((b) => /Ver detalhes de 160/.test(b.getAttribute("aria-label") || "")));
    await click(qa("button").find((b) => b.getAttribute("aria-label") === "Copiar Git blob"));
    expect(container.textContent).toContain("Não foi possível copiar");
  });

  it("0 migrations: estado vazio sem quebrar o layout", async () => {
    await renderTela({ dataSource: dataSourceEstatico(snapshot({ migrations: [] })) });
    expect(q('[data-testid="migration-empty"]')).toBeTruthy();
    expect(q('[data-testid="migration-headline"]').textContent).toBe("Nenhuma migration em preparação");
    expect(qa("li[data-migration]")).toHaveLength(0);
    expect(q("h1")).toBeTruthy();
  });

  it("layout sem scroll horizontal: tabela vira cards abaixo de xl", async () => {
    await renderTela();
    const linha = q("li[data-migration] > div");
    expect(linha.className).toMatch(/grid-cols-2/);
    expect(linha.className).toMatch(/xl:grid-cols-\[/);
    expect(container.innerHTML).not.toMatch(/overflow-x-(auto|scroll)/);
  });
});

function linhasComTexto(texto, quantidade) {
  const achadas = qa("li[data-migration]").filter((l) => l.textContent.includes(texto));
  expect(achadas).toHaveLength(quantidade);
}

describe("readiness", () => {
  it("mostra os 6 tipos de status com texto (não só cor) — via view-model", async () => {
    const snap = snapshot({
      gates: [
        { id: "A", title: "A", status: "VERIFIED" }, { id: "B", title: "B", status: "PENDING" },
        { id: "C", title: "C", status: "BLOCKED" }, { id: "D", title: "D", status: "UNKNOWN" },
        { id: "E", title: "E", status: "STALE" }, { id: "F", title: "F", status: "FAILED" },
      ],
    });
    await renderTela({ dataSource: dataSourceEstatico(snap) });
    const rotulo = (id) => q(`li[data-gate="${id}"]`).textContent;
    expect(rotulo("A")).toContain("Verificado");
    expect(rotulo("B")).toContain("Pendente");
    expect(rotulo("C")).toContain("Bloqueado");
    expect(rotulo("D")).toContain("Não verificado");
    expect(rotulo("E")).toContain("Desatualizado");
    expect(rotulo("F")).toContain("Falhou");
  });

  it("resumo calculado: 3 verificadas, 5 pendentes, 2 bloqueadas", async () => {
    await renderTela();
    const resumo = (s) => q(`[data-summary="${s}"]`).textContent.replace(/\s+/g, " ").trim();
    expect(resumo("VERIFIED")).toBe("3 verificadas");
    expect(resumo("PENDING")).toBe("5 pendentes");
    expect(resumo("BLOCKED")).toBe("2 bloqueadas");
    expect(resumo("UNKNOWN")).toBe("1 não verificada");
    expect(q('[data-testid="readiness-headline"]').textContent).toBe("Há validações bloqueadas");
  });

  it("não exibe READY global", async () => {
    await renderTela();
    expect(container.textContent).not.toMatch(/READY|Pronta? para (Produção|promoção)/);
  });

  it("PROD_BASELINE desconhecido e WRITE_FENCE bloqueado", async () => {
    await renderTela();
    expect(q('li[data-gate="PROD_BASELINE"]').dataset.status).toBe("UNKNOWN");
    const wf = q('li[data-gate="WRITE_FENCE"]');
    expect(wf.dataset.status).toBe("BLOCKED");
    expect(wf.textContent).toContain("Cobertura de escrita");
    expect(wf.textContent).toContain("Existem caminhos de escrita que ainda precisam ser protegidos antes da execução em Produção.");
    expect(wf.textContent).not.toContain("13 caminhos"); // detalhe técnico fica recolhido
  });

  it("clicar no gate bloqueado mostra o motivo (aria-expanded)", async () => {
    await renderTela();
    const wf = q('li[data-gate="WRITE_FENCE"]');
    const toggle = wf.querySelector("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const motivo = wf.querySelector('[data-testid="reason-WRITE_FENCE"]');
    expect(motivo.textContent).toContain("Por que está bloqueado");
    expect(motivo.textContent).toContain("13 caminhos de escrita direta");
    await click(toggle);
    expect(wf.querySelector('[data-testid="reason-WRITE_FENCE"]')).toBeNull();
  });

  it("gate sem motivo não é expansível", async () => {
    await renderTela();
    expect(q('li[data-gate="SESSIONS_ZERO"] button')).toBeNull();
  });
});

describe("plano, segurança e fluxo", () => {
  it("card do plano: origem, destino, contagem de migrations e prévia", async () => {
    await renderTela();
    const plano = q('section[aria-label="Plano de atualização"]');
    expect(plano.textContent).toContain("Prévia");
    expect(plano.textContent).toContain("Homologação");
    expect(plano.textContent).toContain("Produção");
    expect(plano.textContent).toMatch(/Migrations\s*3/);
    expect(plano.textContent).toContain("Pendente"); // aprovação
    expect(plano.textContent).toContain("Não agendado");
  });

  it("explica o que é atualizado e o que nunca é copiado", async () => {
    await renderTela();
    const bloco = q('section[aria-label="Escopo da atualização"]');
    ["estrutura do banco", "funções", "índices", "constraints", "migrations versionadas"].forEach((t) => expect(bloco.textContent).toContain(t));
    ["pedidos", "clientes", "produtos", "vendas", "dados operacionais de HML"].forEach((t) => expect(bloco.textContent).toContain(t));
    expect(bloco.textContent).toContain("Não serão copiados");
  });

  it("fluxo: 8 etapas; backup/atualização/produção não aparecem concluídos", async () => {
    await renderTela();
    const passos = qa("li[data-step]");
    expect(passos.map((p) => p.dataset.step)).toEqual([
      "desenvolvimento", "homologacao", "validacao", "plano", "backup", "atualizacao", "smoke", "producao",
    ]);
    ["backup", "atualizacao", "smoke", "producao"].forEach((id) => {
      const p = q(`li[data-step="${id}"]`);
      expect(p.dataset.state).toBe("pending");
      expect(p.textContent).not.toContain("Concluído");
    });
    expect(q('li[data-step="validacao"]').getAttribute("aria-current")).toBe("step");
    expect(q('[data-testid="flow-progress"]').textContent).toBe("2 de 8 etapas concluídas");
  });
});

describe("ações e capabilities", () => {
  it("Executar e Agendar visíveis porém indisponíveis, com o motivo", async () => {
    await renderTela();
    const exec = botao("Executar atualização");
    const agenda = botao("Agendar atualização");
    expect(exec).toBeTruthy();
    expect(agenda).toBeTruthy();
    expect(exec.disabled).toBe(true);
    expect(agenda.disabled).toBe(true);
    expect(container.textContent).toContain("Disponível após concluir as validações obrigatórias.");
    const ajuda = q("#acoes-ajuda");
    expect(exec.getAttribute("aria-describedby")).toBe(ajuda.id);
    expect(agenda.getAttribute("aria-describedby")).toBe(ajuda.id);
  });

  it("clicar nos botões indisponíveis não faz nada (sem rede, sem drawer)", async () => {
    await renderTela();
    await click(botao("Executar atualização"));
    await click(botao("Agendar atualização"));
    expect(dialogo()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("não há progresso/sucesso falso de execução", async () => {
    await renderTela();
    expect(container.textContent).not.toMatch(/executando|em execução|backup (concluído|realizado)|sucesso|atualização concluída/i);
    expect(q('[role="progressbar"]')).toBeNull();
  });

  describe("ReleaseActions isolado — autoridade vem de capabilities", () => {
    const vm = buildReleaseEnvironmentsPageViewModel(RELEASE_ENVIRONMENTS_FIXTURE);
    const props = (caps, extra = {}) => ({
      capabilities: { ...vm.capabilities, ...caps },
      readiness: vm.readiness, plan: vm.plan, migrations: vm.migrations, flow: vm.flow, safety: vm.safety, ...extra,
    });

    it("canExecute=true sem handler continua desabilitado (fail-closed)", async () => {
      await renderNode(<ReleaseActions {...props({ canExecute: true, canSchedule: true })} />);
      expect(botao("Executar atualização").disabled).toBe(true);
      expect(botao("Agendar atualização").disabled).toBe(true);
    });

    it("handler sem capability continua desabilitado", async () => {
      const onExecute = vi.fn();
      await renderNode(<ReleaseActions {...props({ canExecute: false }, { onExecute })} />);
      expect(botao("Executar atualização").disabled).toBe(true);
      await click(botao("Executar atualização"));
      expect(onExecute).not.toHaveBeenCalled();
    });

    it("capability + handler explícito habilita (caminho futuro)", async () => {
      const onExecute = vi.fn();
      const onSchedule = vi.fn();
      await renderNode(<ReleaseActions {...props({ canExecute: true, canSchedule: true }, { onExecute, onSchedule })} />);
      expect(botao("Executar atualização").disabled).toBe(false);
      await click(botao("Executar atualização"));
      await click(botao("Agendar atualização"));
      expect(onExecute).toHaveBeenCalledTimes(1);
      expect(onSchedule).toHaveBeenCalledTimes(1);
      expect(q("#acoes-ajuda")).toBeNull();
    });

    it("sem canViewPlan/canViewReadiness os botões de leitura ficam desabilitados", async () => {
      await renderNode(<ReleaseActions {...props({ canViewPlan: false, canViewReadiness: false })} />);
      expect(botao("Ver plano").disabled).toBe(true);
      expect(botao("Ver pendências").disabled).toBe(true);
    });
  });
});

describe("Ver pendências e Ver plano (locais, sem mutation)", () => {
  it("Ver pendências abre drawer acessível com bloqueadores e status", async () => {
    await renderTela();
    const gatilho = botao("Ver pendências");
    gatilho.focus();
    await click(gatilho);

    const d = dialogo();
    expect(d).toBeTruthy();
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-labelledby")).toBeTruthy();
    expect(d.textContent).toContain("Pendências da atualização");
    expect(d.textContent).toContain("8 de 11 validações");
    expect(d.querySelector('section[aria-label="Bloqueadores"]').textContent).toContain("Cobertura de escrita");
    expect(d.querySelector('section[aria-label="Bloqueadores"]').textContent).toContain("Segurança estrutural");
    expect(d.textContent).toContain("13 caminhos de escrita direta"); // motivo já visível
    expect(d.textContent).toContain("Baseline de Produção");
    expect(d.textContent).not.toContain("Banco de Homologação auditado na versão 159."); // VERIFIED fora
    expect(document.activeElement).toBe(d.querySelector('button[aria-label="Fechar"]'));
    expect(fetchSpy).not.toHaveBeenCalled();

    await act(async () => { d.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(dialogo()).toBeNull();
    expect(document.activeElement).toBe(gatilho); // foco devolvido
  });

  it("drawer fecha pelo botão Fechar e pelo fundo", async () => {
    await renderTela();
    await click(botao("Ver pendências"));
    await click(dialogo().querySelector('button[aria-label="Fechar"]'));
    expect(dialogo()).toBeNull();

    await click(botao("Ver pendências"));
    await click(dialogo().parentElement); // backdrop
    expect(dialogo()).toBeNull();
  });

  it("Tab fica preso dentro do drawer", async () => {
    await renderTela();
    await click(botao("Ver pendências"));
    const d = dialogo();
    const focaveis = [...d.querySelectorAll("button")];
    focaveis[focaveis.length - 1].focus();
    await act(async () => { d.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(focaveis[0]);
  });

  it("Ver plano mostra migrations, fluxo esperado e aviso de prévia", async () => {
    await renderTela();
    await click(botao("Ver plano"));
    const d = dialogo();
    expect(d.textContent).toContain("Plano de atualização");
    expect(d.textContent).toContain("Prévia: este plano ainda não foi criado.");
    expect(d.textContent).toContain("Migrations do plano (3)");
    expect(d.textContent).toContain("160_db_release_orchestrator_foundation.sql");
    expect(d.textContent).toContain("162_db_release_runtime_hardening.sql");
    expect(d.textContent).toContain("Execução automática bloqueada");
    expect(d.textContent).toContain("Fluxo esperado");
    expect(d.textContent).toContain("Smoke");
    expect(d.textContent).toContain("Não serão copiados");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("estados loading/erro e troca de data source", () => {
  it("loading: skeleton, sem cards", async () => {
    await renderTela({ dataSource: dataSourceEstatico(snapshot({ status: "loading" })) });
    expect(q('[data-state="loading"]').getAttribute("role")).toBe("status");
    expect(qa("article[data-environment]")).toHaveLength(0);
  });

  it("erro: mensagem reutilizável; sem retry quando o data source não oferece", async () => {
    await renderTela({ dataSource: dataSourceEstatico(snapshot({ status: "error" })) });
    const erro = q('[data-state="error"]');
    expect(erro.getAttribute("role")).toBe("alert");
    expect(erro.textContent).toContain("Não foi possível carregar o estado dos ambientes.");
    expect(botao("Tentar novamente")).toBeUndefined();
  });

  it("erro com retry do data source mostra 'Tentar novamente'", async () => {
    const retry = vi.fn();
    await renderTela({ dataSource: dataSourceEstatico(snapshot({ status: "error" }), { retry }) });
    await click(botao("Tentar novamente"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a fixture principal nunca mostra o erro", async () => {
    await renderTela();
    expect(q('[data-state="error"]')).toBeNull();
    expect(container.textContent).not.toContain("Não foi possível carregar o estado dos ambientes.");
  });

  it("data source malformado vira erro (fail-closed)", async () => {
    await renderTela({ dataSource: {} });
    expect(q('[data-state="error"]')).toBeTruthy();
  });

  it("data source live (assinável) troca fixture por live SEM mudar componentes", async () => {
    let atual = snapshot({ status: "loading" });
    const ouvintes = new Set();
    const live = {
      kind: "live",
      getSnapshot: () => atual,
      subscribe: (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    };
    await renderTela({ dataSource: live });
    expect(q('[data-state="loading"]')).toBeTruthy();

    atual = snapshot({
      source: { kind: "live", label: "Estado ao vivo" },
      connectionState: "live",
      lastUpdatedAt: "2026-10-01T12:00:00.000Z",
      currentPhase: "SMOKE",
    });
    await act(async () => { ouvintes.forEach((fn) => fn()); });

    expect(qa("article[data-environment]")).toHaveLength(2);
    expect(q('[data-testid="preview-notice"]')).toBeNull(); // não é mais prévia
    expect(container.textContent).toContain("Fonte: Ao vivo");
    expect(container.textContent).toMatch(/Última atualização:\s*01\/10\/2026/);
  });
});

describe("abas — painel ao vivo é opt-in", () => {
  it("aba padrão é a Visão geral e expõe roles/aria de tabs", async () => {
    await renderTela();
    const abas = qa('[role="tab"]');
    expect(abas.map((a) => a.textContent)).toEqual(["Visão geral", "Versões e deploys"]);
    expect(abas[0].getAttribute("aria-selected")).toBe("true");
    expect(abas[0].tabIndex).toBe(0);
    expect(abas[1].tabIndex).toBe(-1);
    const painel = q('[role="tabpanel"]');
    expect(painel.getAttribute("aria-labelledby")).toBe(abas[0].id);
  });

  it("setas do teclado alternam as abas", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderTela();
    const lista = q('[role="tablist"]');
    await act(async () => { lista.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(qa('[role="tab"]')[1].getAttribute("aria-selected")).toBe("true");
    await act(async () => { lista.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
    expect(qa('[role="tab"]')[0].getAttribute("aria-selected")).toBe("true");
  });

  it("só abrir 'Versões e deploys' aciona a consulta (sessão) do painel legado", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    await renderTela();
    expect(getSessionMock).not.toHaveBeenCalled();
    await click(qa('[role="tab"]')[1]);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Sessão indisponível.");
    expect(fetchSpy).not.toHaveBeenCalled(); // sem token não há rede
    expect(q("h1").textContent).toContain("Ambientes & Releases");
  });
});
