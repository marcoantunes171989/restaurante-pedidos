// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssistenteAtivacaoFiscal from "./AssistenteAtivacaoFiscal";
import { passosAtivacao } from "../../../lib/fiscal/ativacaoFiscal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });

const AGORA = new Date("2026-11-16T12:00:00Z");
function montar(resultado, onIr) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<AssistenteAtivacaoFiscal resultado={resultado} onIr={onIr} onLigar={async () => ({ ok: true })} />));
}
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(txt));

describe("Assistente: cada pendência leva ao lugar certo", () => {
  const r = passosAtivacao({ emitente: { nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao" }, agora: AGORA,
    produtos: [{ id: 1, name: "Nuggets" }, { id: 2, name: "Milkshake" }], formas: [{ id: 1, nome: "PIX", tipo: "pix" }] });

  it("botão com verbo e texto de destino em cada passo pendente", () => {
    montar(r, vi.fn());
    expect(botao("Completar dados")).toBeTruthy();
    expect(botao("Cadastrar CSC")).toBeTruthy();
    expect(botao("Mapear pagamentos")).toBeTruthy();
    expect(container.textContent).toContain("Destino: Fiscal › Emissão › CSC da NFC-e");
  });
  it("clicar no botão chama onIr com o alvo e o passo (que traz o campo de foco)", () => {
    const onIr = vi.fn();
    montar(r, onIr);
    act(() => botao("Cadastrar CSC").click());
    expect(onIr).toHaveBeenCalledWith("emissao-csc", expect.objectContaining({ id: "csc", foco: "emissao-csc-id" }));
  });
  it("cada produto pendente é um botão que também leva à lista filtrada", () => {
    const onIr = vi.fn();
    montar(r, onIr);
    const chips = container.querySelectorAll('[data-testid="lista-pendentes"] button');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain("Nuggets");
    act(() => chips[0].click());
    expect(onIr).toHaveBeenCalledWith("produtos", expect.objectContaining({ id: "produtos" }));
  });
});
