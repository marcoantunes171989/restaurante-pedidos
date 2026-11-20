// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ctx = vi.hoisted(() => ({ incompleto: false }));
vi.mock("../../../lib/fiscal/fiscalApi", () => ({
  buscarEmitenteFiscal: async () => (ctx.incompleto
    ? { lojaId: 9, nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao" }
    : { lojaId: 9, razaoSocial: "Burger Ltda", inscricaoEstadual: "110042490114", crt: "1", cep: "01001000", logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao", nfceSerie: 1 }),
  resumoCredenciaisFiscais: async () => [{ tipo: "certificado_a1", validadeFim: "2099-01-01T00:00:00Z", cadastrado: true, titular: "BURGER" }],
  listarSeriesFiscais: async () => [{ id: 1, modelo: 65, ambiente: "homologacao", serie: 1, proximoNumero: 1, ativa: true }],
  buscarConfigFiscalVenda: async () => ({ mapaMeios: { pix: "17" }, taxaServicoTratamento: "fora_da_nota" }),
  consultarLiberacaoProducao: async () => null,
  salvarSerieFiscal: async () => {}, salvarConfigFiscalVenda: async () => {}, enviarCredencialFiscal: async () => ({}), arquivoParaBase64: async () => "",
  testarConexaoSefaz: async () => ({ xMotivo: "Servico em Operacao", cStat: "107" }),
}));
import EmissaoFiscalConfig from "./EmissaoFiscalConfig";
import { lerTesteSalvo } from "../../../lib/fiscal/testeConexaoSalvo";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => { window.localStorage.clear(); ctx.incompleto = false; Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { if (root) act(() => root.unmount()); container?.remove(); root = container = null; });
const esperar = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const botao = (txt) => [...container.querySelectorAll("button")].find((b) => b.textContent.includes(txt));

const LOJA = { id: 9, nome: "Burger Station", documento: "11222333000181" };
const FORMAS = [{ id: 1, nome: "PIX", tipo: "pix" }, { id: 2, nome: "Dinheiro", tipo: "dinheiro" }];
async function montar(props = {}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<EmissaoFiscalConfig supabase={{}} lojaInfo={LOJA} formasPagamento={FORMAS} produtos={[]} regrasLoja={[]} {...props} />));
  await esperar(20);
}

describe("Emissão: atalhos do assistente", () => {
  it("passo de pagamentos: rola, destaca a seção e põe o cursor na forma sem código (Dinheiro)", async () => {
    await montar();
    const secao = document.getElementById("emissao-pag").closest("section");
    await act(async () => { botao("Mapear pagamentos").click(); });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(secao.classList.contains("ring-2")).toBe(true);
    await esperar(400);
    expect(document.activeElement?.id).toBe("emissao-tpag-2");
  });
  it("passo de teste: o cursor vai para o botão Testar conexão (NFC-e)", async () => {
    await montar();
    await act(async () => { botao("Testar conexão").click(); });
    await esperar(400);
    expect(document.activeElement?.id).toBe("emissao-testar-65");
  });
  it("passo de empresa: leva para Fiscal › Dados da Empresa já pedindo para abrir o cadastro", async () => {
    ctx.incompleto = true;
    const onIrTela = vi.fn();
    await montar({ onIrTela });
    await act(async () => { botao("Completar dados").click(); });
    expect(onIrTela).toHaveBeenCalledWith("dados-fiscais-empresa", "empresa");
  });
  it("passo de produtos: leva para a Tributação já filtrada nos produtos que faltam", async () => {
    const onIrPara = vi.fn();
    await montar({ onIrPara, produtos: [{ id: 1, name: "Nuggets" }] });
    await act(async () => { botao("Corrigir produtos").click(); });
    expect(onIrPara).toHaveBeenCalledWith("produtos:pendentes");
  });
  it("vindo do Painel (focoInicial): depois de carregar vai direto ao passo pendente e avisa que consumiu", async () => {
    const consumido = vi.fn();
    await montar({ focoInicial: "emissao-pag", onFocoConsumido: consumido });
    await esperar(600);
    expect(consumido).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("emissao-tpag-2");
  });
});

describe("Teste de conexão não some ao recarregar", () => {
  it("depois de testar, o resultado fica guardado e a tela nova já parte com o passo pronto", async () => {
    await montar();
    await act(async () => { botao("NFC-e").click(); });
    await esperar(20);
    expect(lerTesteSalvo(9)).toEqual({ ok: true, modelo: 65 });
    act(() => root.unmount()); container.remove();
    await montar();
    expect(container.textContent).toMatch(/Teste de conexão com a SEFAZ.*pronto/);
  });
  it("vale por 12 horas e ignora dado corrompido", () => {
    window.localStorage.setItem("pp-fiscal-teste-conexao:9", JSON.stringify({ ok: true, modelo: 65, em: 1000 }));
    expect(lerTesteSalvo(9, 1000 + 11 * 3600 * 1000)).toEqual({ ok: true, modelo: 65 });
    expect(lerTesteSalvo(9, 1000 + 13 * 3600 * 1000)).toBeNull();
    window.localStorage.setItem("pp-fiscal-teste-conexao:9", "{lixo");
    expect(lerTesteSalvo(9)).toBeNull();
  });
});
