// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AmbienteEmissao from "./AmbienteEmissao";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });

const SERIES = [
  { modelo: 65, ambiente: "homologacao", serie: 1, proximoNumero: 11, ativa: true },
  { modelo: 65, ambiente: "producao", serie: 1, proximoNumero: 3, ativa: true },
];
const LIBERADA = { liberada: true, faltas: [] };
const q = (id) => container.querySelector(`[data-testid="${id}"]`);
const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 10)); });
const clicar = (el) => act(async () => { el.click(); });
const digitar = (v) => act(async () => { const e = q("troca-palavra"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true })); });

async function montar(props = {}) {
  const onTrocar = props.onTrocar || vi.fn().mockResolvedValue({ ok: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AmbienteEmissao nfceAmbiente="homologacao" producao={LIBERADA} series={SERIES} onTrocar={onTrocar} {...props} />));
  return onTrocar;
}

describe("Cartão Ambiente de emissão", () => {
  it("mostra o ambiente atual e só a troca para o outro ambiente", async () => {
    await montar();
    expect(q("ambiente-atual").textContent).toBe("Homologação");
    expect(q("trocar-producao")).not.toBeNull();
    expect(q("trocar-homologacao")).toBeNull();
    expect(q("troca-confirmacao")).toBeNull();
  });
  it("em produção oferece 'Voltar para homologação' e marca o cartão como produção", async () => {
    await montar({ nfceAmbiente: "producao" });
    expect(q("ambiente-atual").textContent).toBe("Produção");
    expect(q("ambiente-emissao").dataset.ambiente).toBe("producao");
    expect(q("trocar-homologacao")).not.toBeNull();
    expect(q("trocar-producao")).toBeNull();
  });
  it("homologação → produção: pede a palavra, só libera o botão com PRODUÇÃO e então troca", async () => {
    const onTrocar = await montar();
    await clicar(q("trocar-producao"));
    expect(q("troca-proximo").textContent).toBe("Próxima NFC-e de produção: nº 3 (série 1).");
    expect(q("troca-confirmar").disabled).toBe(true);
    await digitar("HOMOLOGAÇÃO");
    expect(q("troca-confirmar").disabled).toBe(true); // palavra do ambiente errado
    await digitar("produção");
    expect(q("troca-confirmar").disabled).toBe(false);
    await clicar(q("troca-confirmar")); await esperar();
    expect(onTrocar).toHaveBeenCalledTimes(1);
    expect(onTrocar).toHaveBeenCalledWith("producao");
    expect(q("troca-msg").textContent).toContain("PRODUÇÃO");
    expect(q("troca-confirmacao")).toBeNull();
  });
  it("produção → homologação: pede HOMOLOGAÇÃO", async () => {
    const onTrocar = await montar({ nfceAmbiente: "producao" });
    await clicar(q("trocar-homologacao"));
    expect(q("troca-proximo").textContent).toBe("Próxima NFC-e de homologação: nº 11 (série 1).");
    await digitar("PRODUÇÃO");
    expect(q("troca-confirmar").disabled).toBe(true);
    await digitar("HOMOLOGAÇÃO");
    await clicar(q("troca-confirmar")); await esperar();
    expect(onTrocar).toHaveBeenCalledWith("homologacao");
    expect(q("troca-msg").textContent).toContain("HOMOLOGAÇÃO");
  });
  it("produção não liberada pelo banco: mostra o que falta e nem oferece o campo de confirmação", async () => {
    const onTrocar = await montar({ producao: { liberada: false, faltas: ["CSC de produção da NFC-e."] } });
    await clicar(q("trocar-producao"));
    expect(q("troca-bloqueio").textContent).toContain("CSC de produção da NFC-e.");
    expect(q("troca-palavra")).toBeNull();
    expect(q("troca-confirmar")).toBeNull();
    expect(onTrocar).not.toHaveBeenCalled();
  });
  it("Cancelar fecha sem trocar e limpa a palavra digitada", async () => {
    const onTrocar = await montar();
    await clicar(q("trocar-producao"));
    await digitar("PRODUÇÃO");
    await clicar(q("troca-cancelar"));
    expect(q("troca-confirmacao")).toBeNull();
    expect(onTrocar).not.toHaveBeenCalled();
    await clicar(q("trocar-producao"));
    expect(q("troca-palavra").value).toBe("");
  });
  it("o banco recusou: mostra o motivo, mantém o painel aberto e não anuncia sucesso", async () => {
    await montar({ onTrocar: vi.fn().mockResolvedValue({ ok: false, erro: "O banco não liberou a produção." }) });
    await clicar(q("trocar-producao"));
    await digitar("PRODUÇÃO");
    await clicar(q("troca-confirmar")); await esperar();
    expect(q("troca-msg").textContent).toBe("O banco não liberou a produção.");
    expect(q("troca-confirmacao")).not.toBeNull();
  });
  it("erro inesperado na troca vira mensagem (não quebra a tela)", async () => {
    await montar({ onTrocar: vi.fn().mockRejectedValue(new Error("rede caiu")) });
    await clicar(q("trocar-producao"));
    await digitar("PRODUÇÃO");
    await clicar(q("troca-confirmar")); await esperar();
    expect(q("troca-msg").textContent).toBe("rede caiu");
  });
});
