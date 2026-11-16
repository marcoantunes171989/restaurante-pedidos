// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { dadosDanfeNfe } from "./danfeNfe.js";
import { processarEmissao } from "./emissaoService.js";
import { montarVendaFiscal } from "../../src/lib/fiscal/vendaFiscal.js";
import { dadosNFeDaVenda } from "../../src/lib/fiscal/nfeDaVenda.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { htmlDanfeNfe, EXPRESSAO_EPEC } from "../../src/lib/fiscal/danfeNfeHtml.js";
import { dvCode128c, modulosCode128c, svgCode128c } from "../../src/lib/fiscal/code128c.js";

const EMIT = {
  razaoSocial: "Hamburgueria Teste Ltda", nomeFantasia: "Burger Teste", inscricaoEstadual: "123456789012", crt: "1",
  logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", cep: "01001000", telefoneFiscal: "1133334444",
};
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const DEST = { documento: "11.222.333/0001-81", nome: "Empresa Cliente Ltda", ie: "111222333444",
  ender: { xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01310100" } };
const venda = montarVendaFiscal({
  pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "Almoço executivo", price: 45, quantity: 3 }] }],
  produtos: [{ id: 10, name: "Almoço executivo", lojaId: 7, lojaFiscalRegraId: 50 }],
  ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 2, nome: "Pix", tipo: "pix" }], mapaMeios: { pix: "17" },
  pagamento: { total: 135, troco: 0, detalhes: [{ forma: "Pix", valor: 135 }] },
});
const r = dadosNFeDaVenda({ venda, emitente: EMIT, documento: "12345678000195", modelo: 55, serie: 1, numero: 42, ambiente: "homologacao",
  dhEmi: "2026-11-16T18:30:00.000Z", cNF: "48213579", destinatario: DEST });
const nfe = montarXmlNFe(r.dados).xml;
const PROC = `<nfeProc versao="4.00">${nfe}<protNFe versao="4.00"><infProt><chNFe>${r.chave}</chNFe><dhRecbto>2026-11-16T15:30:05-03:00</dhRecbto><nProt>135260000000042</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
const EPEC_XML = nfe.replace("<tpEmis>1</tpEmis>", "<tpEmis>4</tpEmis>").replace("</ide>", "<dhCont>2026-11-16T15:00:00-03:00</dhCont><xJust>SEFAZ SP e SVC fora do ar no momento</xJust></ide>");

describe("CODE-128C (MOC 7.0 Anexo II)", () => {
  it("DV do exemplo do manual (09758364) = 48", () => expect(dvCode128c("09758364")).toBe(48));
  it("chave de 44 dígitos: 277 módulos + 20 de margem = 297 posições (item 2)", () => {
    expect(modulosCode128c(r.chave).reduce((a, b) => a + b, 0) + 20).toBe(297);
    expect(svgCode128c(r.chave)).toContain('viewBox="0 0 297 1"');
  });
  it("começa com o START C e termina com o STOP", () => {
    const m = modulosCode128c("0975").join("");
    expect(m.startsWith("211232")).toBe(true);
    expect(m.endsWith("2331112")).toBe(true);
  });
});

describe("dadosDanfeNfe", () => {
  it("NF-e autorizada: emitente, destinatário com endereço, totais, itens e protocolo de uso", () => {
    expect(r.ok, r.erro).toBe(true);
    const d = dadosDanfeNfe({ xml: PROC, fonte: "autorizada" });
    expect(d).toMatchObject({ numero: 42, serie: 1, tpNF: "1", homologacao: true, epec: null });
    expect(d.destinatario).toMatchObject({ cnpj: "11222333000181", nome: "Empresa Cliente Ltda", ie: "111222333444" });
    expect(d.destinatario.ender).toMatchObject({ xLgr: "Av Paulista", UF: "SP", CEP: "01310100" });
    expect(d.itens[0]).toMatchObject({ cProd: "10", NCM: "21069090", CFOP: "5102", cst: "0102", csosn: true, qCom: 3, vProd: 135 });
    expect(d.totais.vNF).toBe(135);
    expect(d.protocolo.nProt).toBe("135260000000042");
  });
  it("EPEC: só com protocolo do EPEC; guarda motivo e hora da contingência", () => {
    expect(() => dadosDanfeNfe({ xml: EPEC_XML, fonte: "contingencia", documento: {} })).toThrow(/não pode ser impressa/);
    const d = dadosDanfeNfe({ xml: EPEC_XML, fonte: "contingencia", documento: { epec_protocolo: "891260000000001", epec_dh_registro: "2026-11-16T18:01:00Z" } });
    expect(d.epec.nProt).toBe("891260000000001");
    expect(d.xJust).toContain("SVC fora do ar");
  });
  it("NF-e sem autorização (ex.: SVC ainda não autorizada) não imprime", () => {
    expect(() => dadosDanfeNfe({ xml: nfe.replace("<tpEmis>1</tpEmis>", "<tpEmis>6</tpEmis>"), fonte: "contingencia" })).toThrow();
  });
});

describe("htmlDanfeNfe (A4 retrato)", () => {
  it("campos obrigatórios", () => {
    const h = htmlDanfeNfe(dadosDanfeNfe({ xml: PROC, fonte: "autorizada" }));
    for (const t of ["DANFE", "DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA", "Nº 000.000.042", "SÉRIE 001", "FOLHA 1/1",
      "PROTOCOLO DE AUTORIZAÇÃO DE USO", "135260000000042", "Natureza da operação", "Venda de mercadoria", "11.222.333/0001-81",
      "Empresa Cliente Ltda", "Av Paulista, 1000", "01310-100", "Valor total da nota", "135,00", "O/CSOSN", "NCM/SH", "CFOP",
      "Alíq. ICMS", "9 - Sem Ocorrência de Transporte", "SEM VALOR FISCAL", "Fone: 1133334444", "<svg"]) expect(h).toContain(t);
    expect(h).toContain(r.chave.match(/.{4}/g).join(" "));
    expect(h).not.toContain(EXPRESSAO_EPEC);
  });
  it("EPEC: duas vias, protocolo do EPEC e expressão obrigatória", () => {
    const h = htmlDanfeNfe(dadosDanfeNfe({ xml: EPEC_XML, fonte: "contingencia", documento: { epec_protocolo: "891260000000001", epec_dh_registro: "2026-11-16T18:01:00Z" } }));
    expect(h.match(/class="via"/g)).toHaveLength(2);
    expect(h).toContain("PROTOCOLO DE AUTORIZAÇÃO DO EPEC");
    expect(h).toContain("891260000000001");
    expect(h).toContain(EXPRESSAO_EPEC);
    expect(h).toContain("Motivo: SEFAZ SP e SVC fora do ar no momento");
    expect(h).toContain("Via do destinatário");
    expect(h).toContain("Via do emitente");
  });
  it("muitos itens: várias folhas numeradas", () => {
    const d = dadosDanfeNfe({ xml: PROC, fonte: "autorizada" });
    d.itens = Array.from({ length: 30 }, () => d.itens[0]);
    const h = htmlDanfeNfe(d);
    expect(h).toContain("FOLHA 1/2");
    expect(h).toContain("FOLHA 2/2");
  });
});

describe("ação danfe da NF-e", () => {
  const deps = (p) => ({ podeEmitir: vi.fn().mockResolvedValue(true), paraDanfe: vi.fn().mockResolvedValue(p) });
  it("autorizada → dados A4", async () => {
    const x = await processarEmissao({ acao: "danfe", documentoId: "d" }, deps({ ok: true, fonte: "autorizada", xml: PROC, documento: { loja_id: 7, modelo: 55, tp_emis: 1 } }));
    expect(x).toMatchObject({ ok: true, modelo: 55 });
    expect(x.danfe.numero).toBe(42);
  });
  it("SVC ainda não autorizada / EPEC sem protocolo → não imprime", async () => {
    expect(await processarEmissao({ acao: "danfe", documentoId: "d" }, deps({ ok: true, fonte: "contingencia", xml: nfe, documento: { loja_id: 7, modelo: 55, tp_emis: 6 } }))).toMatchObject({ code: "SEM_AUTORIZACAO" });
    expect(await processarEmissao({ acao: "danfe", documentoId: "d" }, deps({ ok: true, fonte: "contingencia", xml: EPEC_XML, documento: { loja_id: 7, modelo: 55, tp_emis: 4 } }))).toMatchObject({ code: "SEM_AUTORIZACAO" });
  });
});
