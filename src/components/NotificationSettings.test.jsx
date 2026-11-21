// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  upsertPushSubscription: vi.fn(), desativarPushSubscription: vi.fn(), removerPushSubscription: vi.fn(),
  fetchPreferenciasNotificacao: vi.fn(async () => ({ pushAtivo: true, alertaNovoPedido: true, alertaCaixa: true, som: true, alertasVisuais: true })),
  salvarPreferenciasNotificacao: vi.fn(),
  fetchPushSubscriptionAtual: vi.fn(async () => null),
  enviarNotificacaoTeste: vi.fn(),
}));

import NotificationSettings from "./NotificationSettings";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });
const esperar = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

describe("NotificationSettings — passo a passo", () => {
  it("navegador sem suporte a push: explica o motivo, mostra os 4 passos e trava as ações", async () => {
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    act(() => root.render(<NotificationSettings />));
    await act(async () => { container.querySelector('button[aria-label="Configurações de notificação"]').click(); });
    await esperar();

    const aviso = document.body.querySelector('[data-testid="notif-aviso"]');
    expect(aviso).toBeTruthy();
    expect(aviso.textContent).toMatch(/não suporta|https/); // jsdom não tem PushManager/ServiceWorker
    expect(document.body.querySelectorAll('ol[aria-label="Passo a passo"] li').length).toBe(4);
    expect(document.body.querySelector('button[role="switch"][aria-label="Notificações do dispositivo"]').disabled).toBe(true);
    const teste = [...document.body.querySelectorAll("button")].find((b) => b.textContent.includes("Enviar notificação de teste"));
    expect(teste.disabled).toBe(true);
  });
});
