// @vitest-environment node
// NFC-e de entrega a domicílio: caixa → rascunho → dados no servidor → XML (XSD oficial) → cupom.
import { describe, it, expect, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { normalizarEntregaNfce, transporteDaEntrega, intermediadorDaEntrega, pendenciasDaEntrega } from "../../src/lib/fiscal/entregaNfce.js";
import { dadosDaNotaNoCaixa, emitirNotaDaVenda, NOTA_VAZIA } from "../../src/lib/fiscal/emissaoPdv.js";
import { montarVendaFiscal } from "../../src/lib/fiscal/vendaFiscal.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { htmlDanfeNfce } from "../../src/lib/fiscal/danfeNfceHtml.js";
import { dadosDaNota } from "./dadosDaVenda.js";
import { dadosDanfeNfce } from "./danfeNfce.js";
import { paraContingencia } from "./contingencia.js";

const EMIT = {
  razaoSocial: "Hamburgueria Teste Ltda", nomeFantasia: "Burger Teste", inscricaoEstadual: "110042490114", crt: "1",
  logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", cep: "01001000",
  nfceSerie: 1, nfceHabilitada: true, nfceAmbiente: "homologacao",
};
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const ITENS = [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }];
const PRODUTOS = [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }];
const FORMAS = [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }];
const PAGAMENTO = { total: 30, troco: 0, detalhes: [{ forma: "Dinheiro", valor: 30 }] };
const VENDA = montarVendaFiscal({
  pedidos: [{ id: "PED-1", lojaId: 7, status: "delivered", items: ITENS }], produtos: PRODUTOS,
  ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: FORMAS, mapaMeios: { dinheiro: "01" }, pagamento: PAGAMENTO,
});
const LIGADA = { ativo: true, modFrete: "3", informarTransportador: true };
// Dados fictícios: CPF/CNPJ de teste com dígitos válidos.
const COM_TERCEIRO = { ...LIGADA, terceiro: { documento: "529.982.247-25", nome: "Entregador Teste", uf: "sp", municipio: "São Paulo" },
  marketplaces: [{ nome: "Plataforma Teste", cnpj: "11.222.333/0001-81", idCadIntTran: "loja-123" }] };
const CAIXA = { ...NOTA_VAZIA, entrega: true, documento: "123.456.789-09", nome: "Cliente Teste", CEP: "01310-100",
  xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", xMun: "São Paulo", UF: "SP", cMun: "3550308" };
const NO_CAIXA = dadosDaNotaNoCaixa(CAIXA, { entregaDisponivel: true, ufEmitente: "SP" });
const DOC = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado", chave: null,
  pedidos_ids: ["PED-1"], valor_total: 30, rascunho: { versao: 1, venda: VENDA, cpf: "12345678909", dest: NO_CAIXA.destinatario, entrega: true } };
const deps = (extra = {}) => ({
  pedidosDaNota: vi.fn().mockResolvedValue([{ id: "PED-1", loja_id: 7, status: "entregue", status_pagamento: "pago", itens: ITENS }]),
  emitente: vi.fn().mockResolvedValue({ dados: EMIT, cnpj: "12345678000195" }),
  salvarDados: vi.fn(async (p) => ({ ok: true, chave: p.chave, dados: p.dados })),
  entregaNfce: vi.fn().mockResolvedValue(LIGADA),
  ...extra,
});
const AGORA = new Date("2026-11-26T15:00:00Z");

describe("parâmetros da entrega", () => {
  it("padrão: desligado, entrega pela própria loja, sem terceiro nem marketplace", () => {
    expect(normalizarEntregaNfce(null)).toEqual({ ativo: false, modFrete: "3", informarTransportador: true, pedirNoCardapio: false,
      terceiro: { documento: "", nome: "", ie: "", endereco: "", municipio: "", uf: "" }, marketplaces: [] });
    for (const antigo of ["7", "9"]) expect(normalizarEntregaNfce({ modFrete: antigo }).modFrete).toBe("3");
    // O transportador é sempre informado (a SEFAZ exige na entrega).
    expect(normalizarEntregaNfce({ informarTransportador: false }).informarTransportador).toBe(true);
  });
  it("própria loja ou terceiro: a escolha da venda vale sobre o padrão da loja", () => {
    const quem = { documento: "12345678000195", emitente: EMIT };
    const propria = { modFrete: "3", transporta: { CNPJ: "12345678000195", xNome: EMIT.razaoSocial, UF: "SP" } };
    expect(transporteDaEntrega(LIGADA, quem)).toEqual(propria);
    expect(transporteDaEntrega(COM_TERCEIRO, { ...quem, quem: "terceiro" })).toEqual({ modFrete: "0", transporta: { CPF: "52998224725", xNome: "Entregador Teste", UF: "SP", xMun: "São Paulo" } });
    expect(transporteDaEntrega({ ...COM_TERCEIRO, modFrete: "0" }, quem).modFrete).toBe("0");
    expect(transporteDaEntrega({ ...COM_TERCEIRO, modFrete: "0" }, { ...quem, quem: "propria" })).toEqual(propria);
    expect(transporteDaEntrega(LIGADA, { ...quem, quem: "terceiro" }).erro).toMatch(/Transportador terceiro incompleto/);
  });
  it("marketplace: só o cadastrado na loja; sem escolha é venda direta", () => {
    expect(intermediadorDaEntrega(COM_TERCEIRO, "")).toBeNull();
    expect(intermediadorDaEntrega(COM_TERCEIRO, "11.222.333/0001-81")).toEqual({ CNPJ: "11222333000181", idCadIntTran: "loja-123" });
    expect(intermediadorDaEntrega(COM_TERCEIRO, "12345678000195").erro).toMatch(/não está cadastrado/);
    expect(pendenciasDaEntrega(COM_TERCEIRO)).toEqual([]);
    expect(pendenciasDaEntrega({ ativo: true, modFrete: "0", marketplaces: [{ nome: "iFood", cnpj: "123", idCadIntTran: "x" }] })).toHaveLength(2);
  });
});

describe("caixa", () => {
  it("exige documento, nome e endereço, dentro do estado e com a loja ligada", () => {
    const opts = { entregaDisponivel: true, ufEmitente: "SP" };
    expect(NO_CAIXA).toMatchObject({ ok: true, modelo: 65, cpf: "12345678909", entrega: true, destinatario: { nome: "Cliente Teste" } });
    expect(dadosDaNotaNoCaixa({ ...CAIXA, documento: "" }, opts).erro).toMatch(/Entrega: informe um CPF/);
    expect(dadosDaNotaNoCaixa({ ...CAIXA, nome: "" }, opts).erro).toMatch(/nome do cliente/);
    expect(dadosDaNotaNoCaixa({ ...CAIXA, nro: "" }, opts).erro).toMatch(/endereço do cliente/);
    expect(dadosDaNotaNoCaixa({ ...CAIXA, UF: "RJ", cMun: "3304557" }, opts).erro).toMatch(/outro estado/);
    expect(dadosDaNotaNoCaixa(CAIXA, { ufEmitente: "SP" }).ok).toBe(false);
  });
  it("reserva leva o cliente e a marca de entrega; loja desligada não gasta número", async () => {
    const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) },
      rpc: vi.fn(async () => ({ data: { ok: true, documento_id: "d1", numero: 7 }, error: null })) };
    const base = { supabase, emitente: EMIT, ativo: true, subtle: webcrypto.subtle, pedidos: [{ id: "PED-1", lojaId: 7, status: "delivered", items: ITENS }],
      produtos: PRODUTOS, ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: FORMAS, composicao: { subtotal: 30, total: 30 }, pagamento: PAGAMENTO,
      modelo: 65, cpf: NO_CAIXA.cpf, destinatario: NO_CAIXA.destinatario, entrega: true,
      fetchFn: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, situacao: "autorizada", numero: 7 }) })) };
    const desligada = await emitirNotaDaVenda({ ...base, config: { mapaMeios: { dinheiro: "01" } } });
    expect(desligada.estado).toBe("pendente");
    expect(supabase.rpc).not.toHaveBeenCalled();
    await emitirNotaDaVenda({ ...base, config: { mapaMeios: { dinheiro: "01" }, entregaNfce: LIGADA } });
    expect(supabase.rpc.mock.calls[0][1].p_rascunho).toMatchObject({ entrega: true, cpf: "12345678909", dest: NO_CAIXA.destinatario });
  });
});

describe("servidor, XML e cupom", () => {
  it("XML: indPres 4, intermediador 0, endereço, frete e transportador; cupom mostra o endereço", async () => {
    const r = await dadosDaNota(DOC, deps(), AGORA);
    expect(r.code).toBeUndefined();
    const { xml } = montarXmlNFe(r.dados);
    expect(xml).toContain("<indPres>4</indPres><indIntermed>0</indIntermed><procEmi>0</procEmi>");
    expect(xml).toContain("<enderDest><xLgr>Av Paulista</xLgr>");
    expect(xml).toContain("<transp><modFrete>3</modFrete><transporta><CNPJ>12345678000195</CNPJ>");
    const danfe = dadosDanfeNfce({ xml, fonte: "contingencia" });
    expect(danfe.entrega).toBe(true);
    expect(htmlDanfeNfce(danfe)).toContain("ENTREGA A DOMICÍLIO: Av Paulista, 1000");
  });
  it("terceiro e marketplace: XML com o transportador terceiro, indIntermed 1 e infIntermed depois do pagamento", async () => {
    const opcoes = { quem: "terceiro", intermediador: "11.222.333/0001-81" };
    const caixa = dadosDaNotaNoCaixa({ ...CAIXA, quemEntrega: opcoes.quem, intermediador: opcoes.intermediador }, { entregaDisponivel: true, ufEmitente: "SP" });
    expect(caixa.entregaOpcoes).toEqual(opcoes);
    const r = await dadosDaNota({ ...DOC, rascunho: { ...DOC.rascunho, entregaOpcoes: opcoes } }, deps({ entregaNfce: vi.fn().mockResolvedValue(COM_TERCEIRO) }), AGORA);
    expect(r.code).toBeUndefined();
    const { xml } = montarXmlNFe(r.dados);
    expect(xml).toContain("<indPres>4</indPres><indIntermed>1</indIntermed>");
    expect(xml).toContain("<transp><modFrete>0</modFrete><transporta><CPF>52998224725</CPF><xNome>Entregador Teste</xNome><xMun>São Paulo</xMun><UF>SP</UF></transporta></transp>");
    expect(xml).toMatch(/<\/pag><infIntermed><CNPJ>11222333000181<\/CNPJ><idCadIntTran>loja-123<\/idCadIntTran><\/infIntermed>/);
    expect(() => montarXmlNFe({ ...r.dados, intermediador: undefined })).toThrow(/intermediador/);
  });
  it("marketplace que não está no cadastro da loja: o servidor não monta a nota", async () => {
    const d = deps();
    const r = await dadosDaNota({ ...DOC, rascunho: { ...DOC.rascunho, entregaOpcoes: { intermediador: "11222333000181" } } }, d, AGORA);
    expect(r.detalhe).toMatch(/não está cadastrado/);
    expect(d.salvarDados).not.toHaveBeenCalled();
  });
  it("loja que não ligou a entrega: o servidor não monta a nota", async () => {
    const d = deps({ entregaNfce: vi.fn().mockResolvedValue(null) });
    const r = await dadosDaNota(DOC, d, AGORA);
    expect(r.code).toBe("XML_INVALIDO");
    expect(r.detalhe).toMatch(/entrega a domicílio não está ligada/);
    expect(d.salvarDados).not.toHaveBeenCalled();
  });
  it("venda presencial continua sem frete e sem consultar a entrega", async () => {
    const d = deps();
    const r = await dadosDaNota({ ...DOC, rascunho: { versao: 1, venda: VENDA, cpf: "" } }, d, AGORA);
    const { xml } = montarXmlNFe(r.dados);
    expect(xml).toContain("<indPres>1</indPres><procEmi>0</procEmi>");
    expect(xml).toContain("<transp><modFrete>9</modFrete></transp>");
    expect(d.entregaNfce).not.toHaveBeenCalled();
    expect(() => montarXmlNFe({ ...r.dados, transp: { modFrete: "3" } })).toThrow(/sem entrega a domicílio/);
  });
  it("nota de entrega não vira contingência off-line", async () => {
    const r = await dadosDaNota(DOC, deps(), AGORA);
    expect(() => paraContingencia(r.dados, { nNF: 8, dhCont: AGORA, xJust: "SEFAZ indisponivel no momento da venda" })).toThrow(/presencial/);
  });
});
