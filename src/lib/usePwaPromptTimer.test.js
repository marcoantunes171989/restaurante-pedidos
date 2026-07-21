// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { usePwaPromptTimer, PWA_PROMPT_DELAY_MS } from "./usePwaPromptTimer";

// Harness mínimo (sem @testing-library — não é dependência deste projeto):
// expõe o retorno do hook a cada render via um ref externo, sincronizado
// dentro de um efeito (nunca durante o render, para não violar a pureza
// exigida pelo react-hooks/globals).
const estadoRef = { visivel: null, dispensar: null };
function Harness({ status }) {
  const { visivel, dispensar } = usePwaPromptTimer(status);
  useEffect(() => {
    estadoRef.visivel = visivel;
    estadoRef.dispensar = dispensar;
  });
  return null;
}

let container, root;
function montar(status) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(createElement(Harness, { status })); });
}
function rerenderizar(status) {
  act(() => { root.render(createElement(Harness, { status })); });
}
function desmontar() {
  act(() => { root.unmount(); });
  container.remove();
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { if (root) desmontar(); root = null; vi.useRealTimers(); });

describe("usePwaPromptTimer — temporização de 30s", () => {
  it("não exibe antes dos 30s", () => {
    montar("installable-native");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS - 1000); });
    expect(estadoRef.visivel).toBe(false);
  });

  it("exibe exatamente depois dos 30s (status elegível, sem bloqueio)", () => {
    montar("installable-native");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS); });
    expect(estadoRef.visivel).toBe(true);
  });

  it("não exibe quando status é running-as-app, mesmo após 30s", () => {
    montar("running-as-app");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS + 5000); });
    expect(estadoRef.visivel).toBe(false);
  });

  it("não exibe quando status permanece 'checking'", () => {
    montar("checking");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS + 5000); });
    expect(estadoRef.visivel).toBe(false);
  });

  it("respeita document.visibilityState: aba oculta aos 30s não abre até ficar visível", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    montar("installable-native");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS); });
    expect(estadoRef.visivel).toBe(false);

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(estadoRef.visivel).toBe(true);
  });
});

describe("usePwaPromptTimer — momento crítico (outro diálogo aberto)", () => {
  it("não exibe enquanto existir [role=dialog] em tela; exibe assim que ele for removido", () => {
    const dialogoCritico = document.createElement("div");
    dialogoCritico.setAttribute("role", "dialog");
    document.body.appendChild(dialogoCritico);

    montar("installable-native");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS); });
    expect(estadoRef.visivel).toBe(false); // bloqueado pelo diálogo crítico

    dialogoCritico.remove();
    act(() => { vi.advanceTimersByTime(1600); }); // próxima tentativa (RETRY_MS)
    expect(estadoRef.visivel).toBe(true);
  });
});

describe("usePwaPromptTimer — regra do botão “Não”", () => {
  it("dispensar() fecha e impede nova abertura mesmo com novos renders (SPA)", () => {
    montar("installable-native");
    act(() => { vi.advanceTimersByTime(PWA_PROMPT_DELAY_MS); });
    expect(estadoRef.visivel).toBe(true);

    act(() => { estadoRef.dispensar(); });
    expect(estadoRef.visivel).toBe(false);

    // Simula navegação interna da SPA (o Provider não desmonta, só re-renderiza)
    rerenderizar("installable-native");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(estadoRef.visivel).toBe(false);
  });
});
