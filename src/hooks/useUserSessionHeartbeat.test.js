// @vitest-environment jsdom
//
// Gate 8.36 — forward-fix: useUserSessionHeartbeat.js ganhou duas opções
// novas para resolver a corrida entre logout LOCAL e revogação REMOTA:
//
// - onSessionStarted(): disparada quando app_sessao_iniciar (boot novo,
//   NÃO troca de contexto de empresa) conclui com sucesso.
// - (opção de supressão de revogação — ver Gate 8.36.1 abaixo).
//
// Gate 8.36.1 — separação de responsabilidades no caller (App.jsx):
// logoutEmAndamentoRef voltou a ser SOMENTE um guard de reentrância de
// logout(); quem hoje decide se a sessão do dispositivo está pronta é um
// state próprio (sessaoDispositivoPronta). Nesta borda (o hook), isso
// significa renomear a opção antiga `isLocalLogoutInProgress` para
// `shouldSuppressRevocation`: consultada (função, não boolean estático)
// ANTES de revogar() limpar ACCESS_SESSION_KEY / chamar onSessionRevoked.
// O caller retorna true quando um logout local está em andamento OU quando
// ainda não existe sessão de dispositivo pronta para este lifecycle — em
// ambos os casos a revogação remota cede (não duplica logout, não adianta
// limpeza de token que o logout local ainda precisa ler, e não reage a uma
// sessão que já não é mais válida localmente). onSessionStarted não mexe
// mais em logoutEmAndamentoRef — apenas sinaliza ao caller que a sessão do
// dispositivo ficou pronta.
//
// Harness sem @testing-library (não é dependência deste projeto) — mesmo
// padrão de src/lib/usePwaPromptTimer.test.js.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

const mocks = vi.hoisted(() => ({
  iniciarSessaoAcesso: vi.fn(),
  trocarContextoSessaoAcesso: vi.fn(),
  heartbeatSessaoAcesso: vi.fn(),
  limparSessionToken: vi.fn(),
  escutarSessaoPropria: vi.fn(),
}));

vi.mock("../lib/accessControl/api.js", () => ({
  iniciarSessaoAcesso: mocks.iniciarSessaoAcesso,
  trocarContextoSessaoAcesso: mocks.trocarContextoSessaoAcesso,
  heartbeatSessaoAcesso: mocks.heartbeatSessaoAcesso,
  limparSessionToken: mocks.limparSessionToken,
  escutarSessaoPropria: mocks.escutarSessaoPropria,
}));

const { useUserSessionHeartbeat } = await import("./useUserSessionHeartbeat.js");

function Harness({ user, options }) {
  useUserSessionHeartbeat(user, options);
  return null;
}

let container, root;
function montar(user, options) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(createElement(Harness, { user, options })); });
}
function desmontar() {
  act(() => { root.unmount(); });
  container.remove();
}
async function flush() {
  // boot() é async (await iniciarSessaoAcesso) — deixa as microtasks resolverem.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

let capturedOnClosed = null;

beforeEach(() => {
  vi.clearAllMocks();
  capturedOnClosed = null;
  mocks.iniciarSessaoAcesso.mockResolvedValue("sess-1");
  mocks.trocarContextoSessaoAcesso.mockResolvedValue(null);
  mocks.heartbeatSessaoAcesso.mockResolvedValue({ status: "active", alive: true });
  mocks.escutarSessaoPropria.mockImplementation((sessionId, onClosed) => {
    capturedOnClosed = onClosed;
    return () => {};
  });
});
afterEach(() => { if (root) desmontar(); root = null; });

describe("useUserSessionHeartbeat — onSessionStarted (rearme do lifecycle, Gate 8.36)", () => {
  it("dispara onSessionStarted quando app_sessao_iniciar conclui com sucesso", async () => {
    const onSessionStarted = vi.fn();
    montar({ id: 1 }, { onSessionStarted });
    await flush();
    expect(mocks.iniciarSessaoAcesso).toHaveBeenCalledTimes(1);
    expect(onSessionStarted).toHaveBeenCalledTimes(1);
  });

  it("NÃO dispara onSessionStarted quando app_sessao_iniciar falha (retorna null)", async () => {
    mocks.iniciarSessaoAcesso.mockResolvedValue(null);
    const onSessionStarted = vi.fn();
    montar({ id: 1 }, { onSessionStarted });
    await flush();
    expect(onSessionStarted).not.toHaveBeenCalled();
  });

  it("NÃO dispara onSessionStarted em troca de contexto de empresa (super admin trocando loja)", async () => {
    const onSessionStarted = vi.fn();
    montar({ id: 1 }, { onSessionStarted, trackCompanyContext: true, lojaId: 10 });
    await flush();
    onSessionStarted.mockClear();
    mocks.trocarContextoSessaoAcesso.mockResolvedValue("sess-2");
    act(() => {
      root.render(createElement(Harness, {
        user: { id: 1 },
        options: { onSessionStarted, trackCompanyContext: true, lojaId: 20 },
      }));
    });
    await flush();
    expect(mocks.trocarContextoSessaoAcesso).toHaveBeenCalled();
    expect(onSessionStarted).not.toHaveBeenCalled();
  });
});

describe("useUserSessionHeartbeat — shouldSuppressRevocation suprime a revogação (Gate 8.36.1)", () => {
  it("logout local em andamento: NÃO chama limparSessionToken nem onSessionRevoked", async () => {
    let suprimir = true;
    const onSessionRevoked = vi.fn();
    montar({ id: 1 }, {
      onSessionRevoked,
      shouldSuppressRevocation: () => suprimir,
    });
    await flush();
    expect(capturedOnClosed).toBeTypeOf("function");

    act(() => { capturedOnClosed({ status: "closed" }); });

    expect(mocks.limparSessionToken).not.toHaveBeenCalled();
    expect(onSessionRevoked).not.toHaveBeenCalled();
  });

  it("sessão do dispositivo NÃO pronta (sem logout local em andamento): revogação também é suprimida", async () => {
    // Caller (App.jsx) retorna true de shouldSuppressRevocation quando
    // sessaoDispositivoPronta=false, mesmo com logoutEmAndamentoRef=false —
    // ex.: login que ainda não concluiu app_sessao_iniciar.
    const onSessionRevoked = vi.fn();
    montar({ id: 1 }, {
      onSessionRevoked,
      shouldSuppressRevocation: () => true,
    });
    await flush();

    act(() => { capturedOnClosed({ status: "closed" }); });

    expect(mocks.limparSessionToken).not.toHaveBeenCalled();
    expect(onSessionRevoked).not.toHaveBeenCalled();
  });

  it("sessão pronta e sem logout local: revogação remota continua limpando o token e chamando onSessionRevoked", async () => {
    const onSessionRevoked = vi.fn();
    montar({ id: 1 }, {
      onSessionRevoked,
      shouldSuppressRevocation: () => false,
    });
    await flush();

    act(() => { capturedOnClosed({ status: "closed" }); });

    expect(mocks.limparSessionToken).toHaveBeenCalledTimes(1);
    expect(onSessionRevoked).toHaveBeenCalledTimes(1);
  });

  it("sem shouldSuppressRevocation definido, revogação remota funciona normalmente (compat)", async () => {
    const onSessionRevoked = vi.fn();
    montar({ id: 1 }, { onSessionRevoked });
    await flush();

    act(() => { capturedOnClosed({ status: "closed" }); });

    expect(mocks.limparSessionToken).toHaveBeenCalledTimes(1);
    expect(onSessionRevoked).toHaveBeenCalledTimes(1);
  });
});
