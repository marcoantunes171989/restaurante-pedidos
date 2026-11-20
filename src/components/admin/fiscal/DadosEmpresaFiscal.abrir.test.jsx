// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/fiscal/fiscalApi", () => ({
  buscarEmitenteFiscal: async () => ({ razaoSocial: "Burger Ltda", inscricaoEstadual: "110042490114", crt: "1", cep: "01001000", uf: "SP", nfceHabilitada: true }), // falta endereço
}));
vi.mock("../loja/LojaCadastroModal", () => ({ default: ({ initialTab }) => <div data-testid="modal-cadastro" data-aba={initialTab} /> }));
import DadosEmpresaFiscal from "./DadosEmpresaFiscal";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });
const esperar = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function montar(props) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<DadosEmpresaFiscal supabase={{}} lojaInfo={{ id: 9, nome: "Burger", documento: "11222333000181" }} emitenteApi={{}} {...props} />));
  await esperar(20);
}

describe("Dados da Empresa: abertura automática vinda do assistente", () => {
  it("sem o pedido, o cadastro continua fechado", async () => {
    await montar({});
    expect(container.querySelector('[data-testid="modal-cadastro"]')).toBeNull();
  });
  it("com o pedido, abre o cadastro na aba do primeiro campo que falta (Endereço) e avisa uma vez", async () => {
    const aberta = vi.fn();
    await montar({ abrirEdicao: true, onEdicaoAberta: aberta });
    expect(container.querySelector('[data-testid="modal-cadastro"]')?.getAttribute("data-aba")).toBe("endereco");
    expect(aberta).toHaveBeenCalledTimes(1);
  });
});
