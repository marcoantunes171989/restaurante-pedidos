// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { somaItensPedidos, conferirVenda, dadosDaNota } from "./dadosDaVenda.js";
import { processarEmissao } from "./emissaoService.js";
import { montarVendaFiscal } from "../../src/lib/fiscal/vendaFiscal.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { validarNFeXsd } from "./validarXsd.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const EMIT = {
  razaoSocial: "Hamburgueria Teste Ltda", nomeFantasia: "Burger Teste", inscricaoEstadual: "110042490114", crt: "1",
  logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", cep: "01001000",
};
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const ITENS = [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }, { productId: 11, name: "Refri Lata", price: 7, quantity: 2 }];
const VENDA = montarVendaFiscal({
  pedidos: [{ id: "PED-1", lojaId: 7, status: "delivered", items: ITENS }],
  produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }, { id: 11, name: "Refri Lata", lojaId: 7, lojaFiscalRegraId: 50 }],
  ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }], mapaMeios: { dinheiro: "01" },
  pagamento: { total: 44, troco: 6, detalhes: [{ forma: "Dinheiro", valor: 50 }] },
});
const PEDIDOS_BANCO = [{ id: "PED-1", loja_id: 7, status: "entregue", status_pagamento: "pago", itens: ITENS }];
const DOC = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado", chave: null,
  pedidos_ids: ["PED-1"], valor_total: 44, rascunho: { versao: 1, venda: VENDA, cpf: "" } };

function deps(extra = {}) {
  return {
    pedidosDaNota: vi.fn().mockResolvedValue(PEDIDOS_BANCO),
    emitente: vi.fn().mockResolvedValue({ dados: EMIT, cnpj: "12345678000195" }),
    salvarDados: vi.fn(async (p) => ({ ok: true, reutilizado: false, chave: p.chave, dados: p.dados })),
    ...extra,
  };
}
const AGORA = new Date("2026-11-16T15:00:00Z");

describe("conferência da venda no servidor", () => {
  it("a venda de teste está apta", () => expect(VENDA.apto).toBe(true));
  it("soma os itens dos pedidos e ignora cancelados", () => {
    expect(somaItensPedidos(PEDIDOS_BANCO)).toBe(4400);
    expect(somaItensPedidos([...PEDIDOS_BANCO, { status: "cancelado", itens: ITENS }])).toBe(4400);
  });
  it("venda igual aos pedidos pagos → ok", () => expect(conferirVenda(DOC, VENDA, PEDIDOS_BANCO)).toBeNull());
  it("item com preço alterado no navegador → divergente", () => {
    const v = { ...VENDA, itens: VENDA.itens.map((it, i) => (i ? it : { ...it, valorBruto: 20 })) };
    expect(conferirVenda(DOC, v, PEDIDOS_BANCO)).toBe("VENDA_DIVERGENTE");
  });
  it("pedido ainda aberto → não emite", () => {
    expect(conferirVenda(DOC, VENDA, [{ ...PEDIDOS_BANCO[0], status_pagamento: "aberto" }])).toBe("VENDA_NAO_PAGA");
  });
  it("pedido de outra loja, pedido a mais ou faltando → divergente", () => {
    expect(conferirVenda(DOC, VENDA, [{ ...PEDIDOS_BANCO[0], loja_id: 8 }])).toBe("VENDA_DIVERGENTE");
    expect(conferirVenda(DOC, VENDA, [])).toBe("VENDA_DIVERGENTE");
    expect(conferirVenda({ ...DOC, pedidos_ids: ["PED-1", "PED-2"] }, VENDA, PEDIDOS_BANCO)).toBe("VENDA_DIVERGENTE");
  });
  it("valor reservado diferente do valor da nota → divergente", () => {
    expect(conferirVenda({ ...DOC, valor_total: 40 }, VENDA, PEDIDOS_BANCO)).toBe("VENDA_DIVERGENTE");
  });
  it("venda não apta → inválida", () => expect(conferirVenda(DOC, { ...VENDA, apto: false }, PEDIDOS_BANCO)).toBe("VENDA_INVALIDA"));
});

describe("dadosDaNota", () => {
  it("monta com o emitente do banco e o número da reserva, grava uma vez e passa no XSD", async () => {
    const d = deps();
    const r = await dadosDaNota(DOC, d, AGORA);
    expect(r.code).toBeUndefined();
    expect(r.dados.ide).toMatchObject({ nNF: 7, serie: 1, mod: 65, tpAmb: 2, dhEmi: AGORA.toISOString() });
    expect(r.dados.emit.CNPJ).toBe("12345678000195");
    expect(d.salvarDados).toHaveBeenCalledWith({ documentoId: "d1", chave: r.dados.chave, dados: r.dados });
    expect(r.dados.chave.slice(20, 34)).toBe("65001000000007");
    expect(montarXmlNFe(r.dados).totais.vNF).toBe(44);
  });
  it("dados já gravados → usa os gravados (mesma chave em todo reenvio)", async () => {
    const d = deps();
    const gravados = { chave: "X", ide: { nNF: 7 } };
    expect(await dadosDaNota({ ...DOC, status: "enviado", rascunho: { ...DOC.rascunho, dados: gravados } }, d, AGORA)).toEqual({ dados: gravados });
    expect(d.pedidosDaNota).not.toHaveBeenCalled();
  });
  it("corrida: o banco devolve os dados que outra chamada gravou", async () => {
    const outros = { chave: "Y", ide: { nNF: 7 } };
    const r = await dadosDaNota(DOC, deps({ salvarDados: vi.fn().mockResolvedValue({ ok: true, reutilizado: true, dados: outros }) }), AGORA);
    expect(r.dados).toBe(outros);
  });
  it("sem venda nem dados → SEM_DADOS_NOTA; venda divergente não grava", async () => {
    expect(await dadosDaNota({ ...DOC, rascunho: {} }, deps(), AGORA)).toEqual({ code: "SEM_DADOS_NOTA" });
    const d = deps({ pedidosDaNota: vi.fn().mockResolvedValue([{ ...PEDIDOS_BANCO[0], status_pagamento: "aberto" }]) });
    expect(await dadosDaNota(DOC, d, AGORA)).toEqual({ code: "VENDA_NAO_PAGA" });
    expect(d.salvarDados).not.toHaveBeenCalled();
  });
  it("loja sem CNPJ → SEM_EMITENTE", async () => {
    expect(await dadosDaNota(DOC, deps({ emitente: vi.fn().mockResolvedValue({ dados: EMIT, cnpj: "" }) }), AGORA)).toEqual({ code: "SEM_EMITENTE" });
  });
});

describe("emitir uma venda do caixa (rascunho com venda)", () => {
  it("monta, grava os dados e marca 'enviado' com a chave gravada antes de transmitir", async () => {
    const registrar = vi.fn().mockResolvedValue({ ok: true });
    const enviados = [];
    const d = {
      ...deps(),
      podeEmitir: vi.fn().mockResolvedValue(true),
      ufDaLoja: vi.fn().mockResolvedValue("SP"),
      segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }),
      documento: vi.fn().mockResolvedValue(DOC),
      registrar,
      agora: () => AGORA,
      enviar: vi.fn(async ({ dados }) => { enviados.push(String(dados)); return { ok: false, erro: "SEFAZ fora do ar" }; }),
    };
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    const chave = d.salvarDados.mock.calls[0][0].chave;
    expect(registrar.mock.calls[0][0]).toMatchObject({ documentoId: "d1", status: "enviado", chave });
    expect(r).toMatchObject({ podeContingencia: true, formaContingencia: "offline", chave });
    const nfe = enviados.map((x) => x.match(/<NFe[\s\S]*<\/NFe>/)?.[0]).find(Boolean);
    expect(nfe).toContain(`Id="NFe${chave}"`);
    const v = await validarNFeXsd(nfe);
    expect(v.valido, JSON.stringify(v)).toBe(true);
  });
  it("venda que não bate com os pedidos → não assina nem envia", async () => {
    const enviar = vi.fn();
    const d = { ...deps({ pedidosDaNota: vi.fn().mockResolvedValue([{ ...PEDIDOS_BANCO[0], itens: [ITENS[0]] }]) }),
      podeEmitir: vi.fn().mockResolvedValue(true), documento: vi.fn().mockResolvedValue(DOC), registrar: vi.fn(), enviar };
    expect(await processarEmissao({ acao: "emitir", documentoId: "d1" }, d)).toMatchObject({ ok: false, code: "VENDA_DIVERGENTE" });
    expect(enviar).not.toHaveBeenCalled();
    expect(d.registrar).not.toHaveBeenCalled();
  });
});

describe("NF-e (55) da venda com destinatário", () => {
  it("monta no servidor com o destinatário do caixa e a NF-e assinada passa no XSD", async () => {
    const dest = { documento: "11222333000181", nome: "Empresa Cliente Ltda", ie: "111222333444",
      ender: { xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01310100" } };
    const DOC55 = { ...DOC, modelo: 55, rascunho: { versao: 1, venda: VENDA, cpf: "", dest } };
    const enviados = [];
    const d = {
      ...deps(), podeEmitir: vi.fn().mockResolvedValue(true), ufDaLoja: vi.fn().mockResolvedValue("SP"),
      segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }),
      documento: vi.fn().mockResolvedValue(DOC55), registrar: vi.fn().mockResolvedValue({ ok: true }), agora: () => AGORA,
      enviar: vi.fn(async ({ dados }) => { enviados.push(String(dados)); return { ok: false, erro: "SEFAZ fora do ar" }; }),
    };
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ podeContingencia: true, formaContingencia: "svc" });
    const salvo = d.salvarDados.mock.calls[0][0].dados;
    expect(salvo.dest).toMatchObject({ CNPJ: "11222333000181", xNome: "Empresa Cliente Ltda", indIEDest: "1", IE: "111222333444" });
    const nfe = enviados.map((x) => x.match(/<NFe[\s\S]*<\/NFe>/)?.[0]).find(Boolean);
    expect(nfe).toContain("<mod>55</mod>");
    const v = await validarNFeXsd(nfe);
    expect(v.valido, JSON.stringify(v)).toBe(true);
  });
});

describe("dadosDaNota em modo permissivo (Manutenção fiscal)", () => {
  // Cadastro com CSOSN vazio: a venda não fica apta e o modo normal recusa; a Manutenção precisa abrir a nota para corrigir.
  const SEM_CSOSN = montarVendaFiscal({
    pedidos: [{ id: "PED-1", lojaId: 7, status: "delivered", items: ITENS }],
    produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }, { id: 11, name: "Refri Lata", lojaId: 7, lojaFiscalRegraId: 50 }],
    ctxFiscal: { lojaFiscalRegras: [{ ...REGRA, csosn: "" }] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }], mapaMeios: { dinheiro: "01" },
    pagamento: { total: 44, troco: 6, detalhes: [{ forma: "Dinheiro", valor: 50 }] },
  });
  const doc = { ...DOC, rascunho: { versao: 1, venda: SEM_CSOSN, cpf: "" } };
  it("modo normal recusa (nada é gravado)", async () => {
    const d = deps();
    const r = await dadosDaNota(doc, d, AGORA);
    expect(r.code).toBeDefined();
    expect(d.salvarDados).not.toHaveBeenCalled();
  });
  it("modo permissivo monta os dados com o CSOSN vazio para ser corrigido no editor, e o XML ainda não monta assim", async () => {
    const d = deps();
    const r = await dadosDaNota(doc, d, AGORA, { permissivo: true });
    expect(r.code).toBeUndefined();
    expect(r.dados.itens[0].icms).toMatchObject({ grupo: "ICMSSN102", CSOSN: "" });
    expect(() => montarXmlNFe(r.dados)).toThrow();
    expect(montarXmlNFe({ ...r.dados, itens: r.dados.itens.map((it) => ({ ...it, icms: { ...it.icms, CSOSN: "102" } })) }).xml).toContain("<CSOSN>102</CSOSN>");
  });
});
