// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { dadosDanfeNfce } from "./danfeNfce.js";
import { processarEmissao } from "./emissaoService.js";
import { montarVendaFiscal } from "../../src/lib/fiscal/vendaFiscal.js";
import { dadosNFeDaVenda } from "../../src/lib/fiscal/nfeDaVenda.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { htmlDanfeNfce } from "../../src/lib/fiscal/danfeNfceHtml.js";

const EMIT = {
  razaoSocial: "Hamburgueria Teste & Cia Ltda", nomeFantasia: "Burger Teste", inscricaoEstadual: "123456789012", crt: "1",
  logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", cep: "01001000",
};
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const venda = montarVendaFiscal({
  pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: [{ productId: 10, name: "X-Burger", price: 30, quantity: 1 }, { productId: 11, name: "Refri Lata", price: 7, quantity: 2 }] }],
  produtos: [{ id: 10, name: "X-Burger", lojaId: 7, lojaFiscalRegraId: 50 }, { id: 11, name: "Refri Lata", lojaId: 7, lojaFiscalRegraId: 50 }],
  ctxFiscal: { lojaFiscalRegras: [REGRA] }, formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }, { id: 2, nome: "Pix", tipo: "pix" }],
  mapaMeios: { dinheiro: "01", pix: "17" }, ajustes: { descontoCupom: 4 },
  pagamento: { total: 40, troco: 5, detalhes: [{ forma: "Pix", valor: 20 }, { forma: "Dinheiro", valor: 25 }] },
});
const dados = dadosNFeDaVenda({ venda, emitente: EMIT, documento: "12345678000195", modelo: 65, serie: 1, numero: 7, ambiente: "homologacao",
  dhEmi: "2026-11-16T18:30:00.000Z", cNF: "48213579", cpfConsumidor: "12345678909" }).dados;
const QR = "https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=" + dados.chave + "|3|2";
const SUPL = `<infNFeSupl><qrCode>${QR.replace(/&/g, "&amp;")}</qrCode><urlChave>https://www.homologacao.nfce.fazenda.sp.gov.br/consulta</urlChave></infNFeSupl>`;
const nfe = montarXmlNFe(dados).xml.replace("</infNFe>", `</infNFe>${SUPL}`);
const PROC = `<nfeProc versao="4.00">${nfe}<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${dados.chave}</chNFe><dhRecbto>2026-11-16T15:30:05-03:00</dhRecbto><nProt>135260000000007</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;

describe("dadosDanfeNfce (só o que está no XML)", () => {
  it("nota autorizada: cabeçalho, itens, totais, pagamentos, consumidor, protocolo e QR", () => {
    expect(venda.apto).toBe(true);
    const d = dadosDanfeNfce({ xml: PROC, fonte: "autorizada", documento: { id: "d1" } });
    expect(d.chave).toBe(dados.chave);
    expect(d.emitente).toMatchObject({ cnpj: "12345678000195", nome: "Hamburgueria Teste & Cia Ltda" });
    expect(d.emitente.endereco).toContain("Rua das Flores, 100");
    expect(d.itens).toHaveLength(2);
    expect(d.itens[1]).toMatchObject({ xProd: "Refri Lata", qCom: 2, uCom: "UN", vUnCom: 7, vProd: 14 });
    expect(d.totais).toMatchObject({ qtdItens: 2, vProd: 44, vDesc: 4, vAcresc: 0, vNF: 40 });
    expect(d.pagamentos.map((p) => p.tPag)).toEqual(["17", "01"]);
    expect(d.troco).toBe(5);
    expect(d.consumidor.cpf).toBe("12345678909");
    expect(d.protocolo).toEqual({ nProt: "135260000000007", dhRecbto: "2026-11-16T15:30:05-03:00" });
    expect(d.qrCode).toBe(QR);
    expect(d).toMatchObject({ numero: 7, serie: 1, homologacao: true, contingencia: false });
  });
  it("contingência: sem protocolo e marcada", () => {
    const off = nfe.replace("<tpEmis>1</tpEmis>", "<tpEmis>9</tpEmis>");
    const d = dadosDanfeNfce({ xml: off, fonte: "contingencia" });
    expect(d).toMatchObject({ contingencia: true, tpEmis: 9, protocolo: null });
  });
  it("só NFC-e", () => {
    expect(() => dadosDanfeNfce({ xml: nfe.replace("<mod>65</mod>", "<mod>55</mod>"), fonte: "autorizada" })).toThrow(/modelo 65/);
  });
});

describe("htmlDanfeNfce (Manual DANFE NFC-e v6.0)", () => {
  const d = dadosDanfeNfce({ xml: PROC, fonte: "autorizada" });
  const h = htmlDanfeNfce(d, { qrDataUrl: "data:image/png;base64,AAAA" });
  it("divisões obrigatórias", () => {
    expect(h).toContain("CNPJ: 12.345.678/0001-95");
    expect(h).toContain("Hamburgueria Teste &amp; Cia Ltda");
    expect(h).toContain("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica");
    expect(h).toContain("Qtde. total de itens");
    expect(h).toContain("Valor a Pagar R$");
    expect(h).toContain("Pagamento Instantâneo (PIX)");
    expect(h).toContain("Dinheiro");
    expect(h).toContain("Troco R$");
    expect(h).toContain("Consulte pela Chave de Acesso em");
    expect(h).toContain(dados.chave.match(/.{4}/g).join(" "));
    expect(h).toContain("CONSUMIDOR CPF: 123.456.789-09");
    expect(h).toContain("NFC-e nº 7 Série 1 16/11/2026 15:30:00");
    expect(h).toContain("Protocolo de autorização: 135260000000007");
    expect(h).toContain("Data de autorização: 16/11/2026 15:30:05");
    expect(h).toContain("EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL");
    expect(h).toContain('src="data:image/png;base64,AAAA"');
    expect(h).toContain("40,00");
    expect(h).not.toContain("CONTINGÊNCIA");
  });
  it("contingência: aviso duas vezes por via, 2 vias, sem protocolo", () => {
    const c = htmlDanfeNfce(dadosDanfeNfce({ xml: nfe.replace("<tpEmis>1</tpEmis>", "<tpEmis>9</tpEmis>"), fonte: "contingencia" }), { qrDataUrl: "x" });
    expect(c.match(/EMITIDA EM CONTINGÊNCIA<br>Pendente de autorização/g)).toHaveLength(4);
    expect(c).toContain("Via do Estabelecimento");
    expect(c).not.toContain("Protocolo de autorização");
  });
  it("sem CPF → CONSUMIDOR NÃO IDENTIFICADO", () => {
    const semCpf = PROC.replace(/<dest>[\s\S]*?<\/dest>/, "");
    expect(htmlDanfeNfce(dadosDanfeNfce({ xml: semCpf, fonte: "autorizada" }))).toContain("CONSUMIDOR NÃO IDENTIFICADO");
  });
});

describe("ação danfe", () => {
  const base = (extra) => ({ podeEmitir: vi.fn().mockResolvedValue(true), ...extra });
  it("devolve os dados do XML", async () => {
    const d = base({ paraDanfe: vi.fn().mockResolvedValue({ ok: true, fonte: "autorizada", xml: PROC, documento: { id: "d1", loja_id: 7, modelo: 65 } }) });
    const r = await processarEmissao({ acao: "danfe", documentoId: "d1" }, d);
    expect(r.ok).toBe(true);
    expect(r.danfe.numero).toBe(7);
    expect(d.podeEmitir).toHaveBeenCalledWith(7);
  });
  it("sem permissão / sem XML / NF-e", async () => {
    expect(await processarEmissao({ acao: "danfe", documentoId: "d1" }, base({ podeEmitir: vi.fn().mockResolvedValue(false),
      paraDanfe: vi.fn().mockResolvedValue({ ok: true, xml: PROC, documento: { loja_id: 7, modelo: 65 } }) }))).toMatchObject({ code: "FORBIDDEN" });
    expect(await processarEmissao({ acao: "danfe", documentoId: "d1" }, base({ paraDanfe: vi.fn().mockResolvedValue({ ok: false, code: "SEM_XML", loja_id: 7 }) }))).toMatchObject({ code: "SEM_XML" });
    expect(await processarEmissao({ acao: "danfe", documentoId: "d1" }, base({ paraDanfe: vi.fn().mockResolvedValue({ ok: true, xml: PROC, documento: { loja_id: 7, modelo: 55 } }) }))).toMatchObject({ code: "SO_NFCE_DANFE" });
    expect(await processarEmissao({ acao: "danfe", documentoId: "x" }, base({ paraDanfe: vi.fn().mockResolvedValue(null) }))).toMatchObject({ code: "NAO_ENCONTRADO" });
  });
});
