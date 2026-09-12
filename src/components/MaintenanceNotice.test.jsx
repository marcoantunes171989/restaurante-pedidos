// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaintenanceNotice } from "./MaintenanceNotice";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root;
let container;

function renderizar(props) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(<MaintenanceNotice {...props} />); });
  return container;
}

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  root = null;
  container = null;
});

const NOTICE_STATE = {
  phase: "NOTICE",
  epoch: 2,
  fenceEffectiveAt: null,
  noticeStartedAt: "2026-09-12T10:00:00.000Z",
  scheduledFor: "2026-09-13T02:00:00.000Z",
  messagePublic: "Manutenção agendada para hoje à noite.",
  updatedAt: "2026-09-12T10:00:00.000Z",
  reason: "release_123",
  releaseId: "rel-abc",
  targetSha: "d88f9fa",
  version: "1.2.3",
  messageOperator: "detalhe interno só de operador",
};

const NORMAL_STATE = {
  phase: "NORMAL",
  epoch: 1,
  fenceEffectiveAt: null,
  noticeStartedAt: null,
  scheduledFor: null,
  messagePublic: null,
  updatedAt: "2026-09-12T09:00:00.000Z",
};

describe("MaintenanceNotice — semântica por fase", () => {
  it("NORMAL: nada é renderizado", () => {
    const el = renderizar({ status: "ready", state: NORMAL_STATE });
    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(el.textContent).toBe("");
  });

  it("state null (loading/erro inicial): nada é renderizado", () => {
    const el = renderizar({ status: "loading", state: null });
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it("outras fases (ex.: FENCING) não renderizam banner neste gate", () => {
    const el = renderizar({ status: "ready", state: { ...NORMAL_STATE, phase: "FENCING" } });
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it("NOTICE: renderiza o banner", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    expect(el.querySelector('[role="status"]')).not.toBeNull();
  });
});

describe("MaintenanceNotice — mensagem", () => {
  it("usa messagePublic quando presente e não vazia", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    expect(el.textContent).toContain("Manutenção agendada para hoje à noite.");
  });

  it("usa a mensagem padrão quando messagePublic é null", () => {
    const el = renderizar({ status: "ready", state: { ...NOTICE_STATE, messagePublic: null } });
    expect(el.textContent).toContain("Manutenção programada em breve. O sistema continua disponível normalmente.");
  });

  it("usa a mensagem padrão quando messagePublic é string vazia/whitespace", () => {
    const el = renderizar({ status: "ready", state: { ...NOTICE_STATE, messagePublic: "   " } });
    expect(el.textContent).toContain("Manutenção programada em breve.");
  });

  it("scheduledFor válido soma um complemento informativo amigável", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    expect(el.textContent).toContain("Previsão:");
  });

  it("scheduledFor ausente/inválido não quebra e não mostra complemento", () => {
    const el = renderizar({ status: "ready", state: { ...NOTICE_STATE, scheduledFor: null } });
    expect(el.textContent).not.toContain("Previsão:");
    expect(() => renderizar({ status: "ready", state: { ...NOTICE_STATE, scheduledFor: "não-é-data" } })).not.toThrow();
  });
});

describe("MaintenanceNotice — acessibilidade", () => {
  it('usa role="status"', () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    const banner = el.querySelector('[role="status"]');
    expect(banner).not.toBeNull();
  });

  it('usa aria-live="polite", nunca role="alert"', () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    const banner = el.querySelector('[role="status"]');
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it("não sequestra foco (nenhum autofocus / focus() chamado)", () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    renderizar({ status: "ready", state: NOTICE_STATE });
    expect(focusSpy).not.toHaveBeenCalled();
    focusSpy.mockRestore();
  });
});

describe("MaintenanceNotice — nenhum dado técnico/operador exposto", () => {
  it("não exibe reason, releaseId, targetSha, version ou messageOperator", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    expect(el.textContent).not.toContain("release_123");
    expect(el.textContent).not.toContain("rel-abc");
    expect(el.textContent).not.toContain("d88f9fa");
    expect(el.textContent).not.toContain("1.2.3");
    expect(el.textContent).not.toContain("detalhe interno só de operador");
  });
});

describe("MaintenanceNotice — nenhuma ação/fetch", () => {
  it("não possui nenhum elemento disabled", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    expect(el.querySelectorAll("[disabled]").length).toBe(0);
  });

  it("não chama fetch (componente visual puro, sem polling próprio)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderizar({ status: "ready", state: NOTICE_STATE });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("MaintenanceNotice — classes visuais/responsivas", () => {
  it("possui classes responsivas essenciais (w-full, break-words, flex-wrap)", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    const banner = el.querySelector('[role="status"]');
    expect(banner.className).toContain("w-full");
    expect(banner.className).toContain("break-words");
    expect(banner.className).toContain("flex-wrap");
  });

  it("usa fundo #012E46 e texto branco", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    const banner = el.querySelector('[role="status"]');
    expect(banner.className).toContain("bg-[#012E46]");
    expect(banner.className).toContain("text-white");
  });

  it("não possui whitespace-nowrap nem sticky próprio", () => {
    const el = renderizar({ status: "ready", state: NOTICE_STATE });
    const banner = el.querySelector('[role="status"]');
    expect(banner.className).not.toContain("whitespace-nowrap");
    expect(banner.className).not.toContain("sticky");
  });
});
