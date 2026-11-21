// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ chamadas: [], liberacao: { liberada: false, faltas: ["Pelo menos 1 NFC-e autorizada em homologação.", "Série da NFC-e em produção.", "CSC de produção da NFC-e."], emProducao: false } }));
vi.mock("../../../lib/fiscal/fiscalApi", () => ({
  buscarEmitenteFiscal: async () => ({ lojaId: 9, razaoSocial: "44.422.195 MARCO ANTONIO", inscricaoEstadual: "110042490114", crt: "4", cep: "16705424", logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "Guararapes", codigoMunicipioIbge: "3518206", uf: "SP", nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "homologacao" }),
  resumoCredenciaisFiscais: async () => [{ tipo: "certificado_a1", validadeFim: "2099-01-01T00:00:00Z", cadastrado: true, titular: "MEI" }],
  listarSeriesFiscais: async () => [{ id: 1, modelo: 65, ambiente: "homologacao", serie: 1, proximoNumero: 1, ativa: true }],
  buscarConfigFiscalVenda: async () => ({ mapaMeios: { pix: "17" }, taxaServicoTratamento: "fora_da_nota" }),
  consultarLiberacaoProducao: async () => ctx.liberacao,
  salvarSerieFiscal: async () => {}, salvarConfigFiscalVenda: async () => {}, enviarCredencialFiscal: async () => ({}), arquivoParaBase64: async () => "",
  testarConexaoSefaz: async (_s, args) => { ctx.chamadas.push(args); if (args.ambiente === "producao" && ctx.falhaProducao) throw new Error("SEFAZ de produção não respondeu."); return { xMotivo: "Servico em Operacao", cStat: "107" }; },
}));
import EmissaoFiscalConfig from "./EmissaoFiscalConfig";
import { lerTesteSalvo } from "../../../lib/fiscal/testeConexaoSalvo";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { window.localStorage.clear(); ctx.chamadas = []; ctx.falhaProducao = false; Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });
const esperar = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const q = (id) => container.querySelector(`[data-testid="${id}"]`);

async function montar() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<EmissaoFiscalConfig supabase={{}} lojaInfo={{ id: 9, nome: "Burger Station", documento: "44422195000133" }} formasPagamento={[{ id: 1, nome: "PIX", tipo: "pix" }]} produtos={[]} regrasLoja={[]} />));
  await esperar(30);
}

describe("Emissão: prontidão para produção e teste de conexão de produção", () => {
  it("mostra o cartão de prontidão com os bloqueios que a trava do banco exige", async () => {
    await montar();
    expect(q("prontidao-producao")).not.toBeNull();
    expect(q("prontidao-resumo").textContent).toMatch(/bloqueando/);
    expect(q("prontidao-serie").dataset.ok).toBe("false");
    expect(q("prontidao-csc").dataset.ok).toBe("false");
    expect(q("prontidao-homologacao").dataset.ok).toBe("false");
    expect(q("prontidao-certificado").dataset.ok).toBe("true");
    expect(q("prontidao-regime").textContent).toMatch(/MEI/);
  });
  it("Testar conexão (produção) consulta a SEFAZ de PRODUÇÃO e guarda o resultado à parte do de homologação", async () => {
    await montar();
    expect(q("prontidao-conexao").dataset.ok).toBe("false");
    await act(async () => { document.getElementById("emissao-testar-prod-65").click(); });
    await esperar(30);
    expect(ctx.chamadas).toEqual([{ lojaId: 9, modelo: 65, ambiente: "producao" }]);
    expect(lerTesteSalvo("9-producao")).toMatchObject({ ok: true });
    expect(lerTesteSalvo(9)).toBeNull(); // o teste de homologação não foi tocado
    expect(q("prontidao-conexao").dataset.ok).toBe("true");
  });
  it("falha no teste de produção: mostra o motivo e não marca como feito", async () => {
    ctx.falhaProducao = true;
    await montar();
    await act(async () => { document.getElementById("emissao-testar-prod-65").click(); });
    await esperar(30);
    expect(container.textContent).toContain("Produção: SEFAZ de produção não respondeu.");
    expect(q("prontidao-conexao").dataset.ok).toBe("false");
    expect(lerTesteSalvo("9-producao")).toBeNull();
  });
  it("cartão Ambiente de emissão no topo: mostra o ambiente da loja e a troca para produção", async () => {
    await montar();
    expect(q("ambiente-emissao").dataset.ambiente).toBe("homologacao");
    expect(q("ambiente-atual").textContent).toBe("Homologação");
    expect(q("trocar-producao")).not.toBeNull();
  });
  it("o botão de teste de homologação continua testando homologação", async () => {
    await montar();
    await act(async () => { document.getElementById("emissao-testar-65").click(); });
    await esperar(30);
    expect(ctx.chamadas).toEqual([{ lojaId: 9, modelo: 65, ambiente: "homologacao" }]);
    expect(lerTesteSalvo(9)).toMatchObject({ ok: true });
  });
});
