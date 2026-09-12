// @vitest-environment jsdom
import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMaintenanceState, MAINTENANCE_POLL_MS } from "./useMaintenanceState";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Harness mínimo (sem @testing-library): expõe o retorno do hook a cada
// render via um ref externo, sincronizado dentro de um efeito.
const estadoRef = { status: null, state: null, error: null };
function Harness() {
  const resultado = useMaintenanceState();
  useEffect(() => {
    estadoRef.status = resultado.status;
    estadoRef.state = resultado.state;
    estadoRef.error = resultado.error;
  });
  return null;
}

let container, root;
function montar() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(createElement(Harness)); });
}
function desmontar() {
  act(() => { root.unmount(); });
  container.remove();
}

const NOTICE_STATE = {
  phase: "NOTICE",
  epoch: 3,
  fenceEffectiveAt: null,
  noticeStartedAt: "2026-09-12T10:00:00.000Z",
  scheduledFor: "2026-09-13T02:00:00.000Z",
  messagePublic: "Manutenção agendada.",
  updatedAt: "2026-09-12T10:00:00.000Z",
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

function respostaOk(state) {
  return {
    ok: true,
    json: async () => ({ ok: true, state, generatedAt: new Date().toISOString() }),
  };
}

function respostaErroHttp() {
  return { ok: false, json: async () => ({ ok: false, error: "MAINTENANCE_STATE_UNAVAILABLE" }) };
}

function respostaPayloadInvalido() {
  return { ok: true, json: async () => ({ ok: true, state: { phase: "ROTA_INEXISTENTE" } }) };
}

async function fluxarPromises(n = 5) {
  for (let i = 0; i < n; i++) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  estadoRef.status = null;
  estadoRef.state = null;
  estadoRef.error = null;
});

afterEach(() => {
  if (root) desmontar();
  root = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useMaintenanceState — fetch inicial", () => {
  it("inicia em loading e usa fetch('/api/maintenance', {method:'GET', cache:'no-store'})", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE));
    vi.stubGlobal("fetch", fetchMock);

    montar();
    expect(estadoRef.status).toBe("loading");

    await fluxarPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/maintenance",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(estadoRef.status).toBe("ready");
  });

  it("NORMAL: status=ready, state.phase=NORMAL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE)));
    montar();
    await fluxarPromises();
    expect(estadoRef.status).toBe("ready");
    expect(estadoRef.state.phase).toBe("NORMAL");
    expect(estadoRef.error).toBeNull();
  });

  it("NOTICE: status=ready, state.phase=NOTICE", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk(NOTICE_STATE)));
    montar();
    await fluxarPromises();
    expect(estadoRef.status).toBe("ready");
    expect(estadoRef.state.phase).toBe("NOTICE");
  });

  it("API error (HTTP não-ok): status=error, state=null, nunca inventa NORMAL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaErroHttp()));
    montar();
    await fluxarPromises();
    expect(estadoRef.status).toBe("error");
    expect(estadoRef.state).toBeNull();
  });

  it("payload inválido: status=error, state=null, nunca inventa NORMAL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaPayloadInvalido()));
    montar();
    await fluxarPromises();
    expect(estadoRef.status).toBe("error");
    expect(estadoRef.state).toBeNull();
  });

  it("fetch rejeitando (rede offline): status=error, state=null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    montar();
    await fluxarPromises();
    expect(estadoRef.status).toBe("error");
    expect(estadoRef.state).toBeNull();
  });
});

describe("useMaintenanceState — poll periódico", () => {
  it("refetch a cada 60s (MAINTENANCE_POLL_MS)", async () => {
    expect(MAINTENANCE_POLL_MS).toBe(60_000);
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE));
    vi.stubGlobal("fetch", fetchMock);

    montar();
    await fluxarPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { vi.advanceTimersByTime(MAINTENANCE_POLL_MS); });
    await fluxarPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => { vi.advanceTimersByTime(MAINTENANCE_POLL_MS); });
    await fluxarPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("useMaintenanceState — visibilitychange", () => {
  it("refetch quando document volta a visible", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await fluxarPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(1); // hidden não refetcha

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await fluxarPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("useMaintenanceState — AbortController", () => {
  it("aborta a request anterior antes de iniciar uma nova (poll)", async () => {
    const abortSpy = vi.fn();
    const originalAbortController = globalThis.AbortController;
    class SpyAbortController extends originalAbortController {
      abort(...args) {
        abortSpy();
        super.abort(...args);
      }
    }
    vi.stubGlobal("AbortController", SpyAbortController);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE)));

    montar();
    await fluxarPromises();
    expect(abortSpy).not.toHaveBeenCalled(); // primeira request: nada para abortar ainda

    await act(async () => { vi.advanceTimersByTime(MAINTENANCE_POLL_MS); });
    await fluxarPromises();
    expect(abortSpy).toHaveBeenCalledTimes(1); // aborta o controller da 1ª antes da 2ª
  });

  it("cleanup no unmount: aborta a request em voo", async () => {
    const abortSpy = vi.fn();
    const originalAbortController = globalThis.AbortController;
    class SpyAbortController extends originalAbortController {
      abort(...args) {
        abortSpy();
        super.abort(...args);
      }
    }
    vi.stubGlobal("AbortController", SpyAbortController);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE)));

    montar();
    await fluxarPromises();
    desmontar();
    root = null;
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});

describe("useMaintenanceState — cleanup", () => {
  it("clearInterval no unmount: nenhum fetch a mais depois de desmontar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await fluxarPromises();
    const chamadasAntes = fetchMock.mock.calls.length;

    desmontar();
    root = null;

    await act(async () => { vi.advanceTimersByTime(MAINTENANCE_POLL_MS * 3); });
    expect(fetchMock.mock.calls.length).toBe(chamadasAntes);
  });

  it("removeEventListener no unmount: visibilitychange pós-unmount não causa efeito", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaOk(NORMAL_STATE));
    vi.stubGlobal("fetch", fetchMock);
    montar();
    await fluxarPromises();
    const chamadasAntes = fetchMock.mock.calls.length;

    desmontar();
    root = null;

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock.mock.calls.length).toBe(chamadasAntes);
  });
});

describe("useMaintenanceState — último state válido preservado", () => {
  it("NOTICE válido seguido de erro no poll: preserva state, status vira error", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaOk(NOTICE_STATE))
      .mockResolvedValueOnce(respostaErroHttp());
    vi.stubGlobal("fetch", fetchMock);

    montar();
    await fluxarPromises();
    expect(estadoRef.status).toBe("ready");
    expect(estadoRef.state.phase).toBe("NOTICE");

    await act(async () => { vi.advanceTimersByTime(MAINTENANCE_POLL_MS); });
    await fluxarPromises();

    expect(estadoRef.status).toBe("error");
    expect(estadoRef.state.phase).toBe("NOTICE"); // preservado, nunca virou NORMAL nem null
  });

  it("nenhum NORMAL é inventado: erro após NOTICE nunca produz state.phase === NORMAL", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respostaOk(NOTICE_STATE))
      .mockResolvedValueOnce(respostaPayloadInvalido());
    vi.stubGlobal("fetch", fetchMock);

    montar();
    await fluxarPromises();
    await act(async () => { vi.advanceTimersByTime(MAINTENANCE_POLL_MS); });
    await fluxarPromises();

    expect(estadoRef.state.phase).not.toBe("NORMAL");
    expect(estadoRef.state.phase).toBe("NOTICE");
  });
});
