// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { validarNFeXsd, lerManifesto } from "./validarXsd.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { dadosNFeDaVenda, montarChaveAcesso } from "../../src/lib/fiscal/nfeDaVenda.js";
import { montarVendaFiscal } from "../../src/lib/fiscal/vendaFiscal.js";

// Assinatura SÓ DE ESTRUTURA (valores zerados): o XSD exige ds:Signature com
// os algoritmos fixos do leiaute. NÃO é assinatura válida — a real vem na E4.
function comAssinaturaDeTeste(xml, chave) {
  const zeros = (n) => Buffer.alloc(n).toString("base64");
  const sig = '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo>' +
    '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>' +
    '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>' +
    `<Reference URI="#NFe${chave}"><Transforms>` +
    '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>' +
    '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms>' +
    '<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>' +
    `<DigestValue>${zeros(20)}</DigestValue></Reference></SignedInfo>` +
    `<SignatureValue>${zeros(256)}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${zeros(48)}</X509Certificate></X509Data></KeyInfo></Signature>`;
  return xml.replace("</infNFe></NFe>", `</infNFe>${sig}</NFe>`);
}

const EMIT = {
  razaoSocial: "Hamburgueria Teste Ltda", nomeFantasia: "Burger Teste", inscricaoEstadual: "110042490114",
  logradouro: "Rua das Flores", numero: "100", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", cep: "01001000",
};
const PRODUTOS = [
  { id: 10, name: "X-Burger Duplo", lojaId: 7, lojaFiscalRegraId: 50 },
  { id: 11, name: "Refrigerante Lata 350ml", lojaId: 7, lojaFiscalRegraId: 51 },
  { id: 12, name: "Batata Rústica", lojaId: 7, lojaFiscalRegraId: 50 },
];
// Regras de TESTE (formatos do XSD), não recomendação tributária.
const REGRAS_SN = [
  { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" },
  { id: 51, ncmCodigo: "22021000", cestCodigo: "0300700", cfopCodigo: "5405", csosn: "102", cstPis: "04", cstCofins: "04" },
];
const FORMAS = [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }, { id: 2, nome: "PIX", tipo: "pix" }, { id: 3, nome: "Crédito", tipo: "cartao_credito" }];
const MAPA = { dinheiro: "01", pix: "17", cartao_credito: "03" };

const DEST_NFE = { documento: "11.222.333/0001-81", nome: "Empresa Cliente Ltda", ie: "111.222.333.444",
  ender: { xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01310-100", fone: "(11) 3333-4444" } };
async function notaValida({ ajustes = {}, pagamento, regras = REGRAS_SN, crt = "1", modelo = 65, cpf = "", itens, destNfe = DEST_NFE, ibpt = null, ibsCbsSn = null, entregaNfce = null, entregaOpcoes = null } = {}) {
  const venda = montarVendaFiscal({
    pedidos: [{ id: "P1", lojaId: 7, status: "delivered", items: itens || [
      { productId: 10, name: "X-Burger Duplo", price: 32.9, quantity: 2 },
      { productId: 11, name: "Refrigerante Lata 350ml", price: 7, quantity: 3 },
      { productId: 12, name: "Batata Rústica", price: 18.5, quantity: 1 },
    ] }],
    produtos: PRODUTOS, ctxFiscal: { lojaFiscalRegras: regras }, formas: FORMAS, mapaMeios: MAPA, ajustes,
    regras: { taxaServico: "outras_despesas" }, pagamento,
  });
  expect(venda.pendencias).toEqual([]);
  const r = dadosNFeDaVenda({ venda, emitente: { ...EMIT, crt }, documento: "12345678000195", modelo, serie: 1, numero: 123, ambiente: "homologacao", dhEmi: "2026-11-15T15:30:00Z", cpfConsumidor: cpf,
    destinatario: modelo === 55 || entregaNfce ? destNfe : null, ibpt, ibsCbsSn, entrega: !!entregaNfce, entregaNfce, entregaOpcoes,
    permitirInterestadual: true }); // o XSD também precisa valer para o caminho interestadual, hoje desligado por padrão
  expect(r.ok, r.erro).toBe(true);
  const { xml } = montarXmlNFe(r.dados);
  return validarNFeXsd(comAssinaturaDeTeste(xml, r.chave));
}

describe("schemas oficiais (manifesto)", () => {
  it("pacote PL 010h v1.03 com hash conferido", () => {
    const m = lerManifesto();
    expect(m.pacote).toBe("PL_010h_v1.03");
    expect(m.zip_sha256).toBe("bcbf6b277f79a6983d69016dfe0430f09b8a191997a4706a24938acddc18dc81");
    expect(Object.keys(m.arquivos)).toContain("NFe/leiauteNFe_v4.00.xsd");
  });
});

describe("XML gerado × XSD oficial", () => {
  it("NFC-e Simples, dinheiro com troco", async () => {
    const r = await notaValida({ pagamento: { total: 105.3, troco: 14.7, detalhes: [{ forma: "Dinheiro", valor: 120 }] } });
    expect(r.erros).toEqual([]);
    expect(r.valido).toBe(true);
  });
  it("NFC-e com CPF, cupom, acréscimo, taxa de serviço e pagamento dividido", async () => {
    const r = await notaValida({
      cpf: "123.456.789-09",
      ajustes: { descontoCupom: 10, acrescimo: 2, taxaServico: 9.73 },
      pagamento: { total: 107.03, troco: 0, detalhes: [{ forma: "PIX", valor: 50 }, { forma: "Dinheiro", valor: 57.03 }] },
    });
    expect(r.erros).toEqual([]);
  });
  it("NFC-e Regime Normal com ICMS 00", async () => {
    const regras = REGRAS_SN.map((x) => ({ ...x, csosn: "", cstIcms: "00", icmsAliquota: 18, cstPis: "01", pisAliquota: 0.65, cstCofins: "01", cofinsAliquota: 3 }));
    const r = await notaValida({ regras, crt: "3", pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
    expect(r.erros).toEqual([]);
  });
  it("NFC-e e NF-e com bebida em CSOSN 500 (ICMS cobrado antes por ST)", async () => {
    const regras = REGRAS_SN.map((x) => (x.id === 51 ? { ...x, csosn: "500" } : x));
    for (const modelo of [65, 55]) {
      const r = await notaValida({ regras, modelo, pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
      expect(r.erros).toEqual([]);
      expect(r.valido).toBe(true);
    }
  });
  it("Simples com IBS/CBS ligado (cAtivSN, gTribSN e totais) é válido no XSD, nos dois modelos", async () => {
    // Códigos e alíquotas de TESTE (formato do leiaute), não regra fiscal.
    const ibsCbsSn = { ativo: true, inicio: "2027-03-01", cst: "000", cClassTrib: "000001", cAtivSN: "01", pIBSSN: "0.1", pCBSSN: "0.9" };
    for (const modelo of [65, 55]) {
      const r = await notaValida({ modelo, ibsCbsSn, pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
      expect(r.erros).toEqual([]);
      expect(r.valido).toBe(true);
    }
  });
  it("NF-e interestadual (RJ): idDest 2 e CFOP 6xxx válidos no XSD", async () => {
    const destNfe = { ...DEST_NFE, ender: { ...DEST_NFE.ender, cMun: "3304557", xMun: "Rio de Janeiro", UF: "RJ", CEP: "20040-020" } };
    const r = await notaValida({ modelo: 55, destNfe, pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
    expect(r.erros).toEqual([]);
    expect(r.valido).toBe(true);
  });
  it("NFC-e e NF-e com tributos aproximados (vTotTrib por item e no total, infCpl IBPT)", async () => {
    // Tabela FICTÍCIA só para o teste de formato.
    const ibpt = { meta: { uf: "SP", versao: "26.2.A", chave: "ABC123", fonte: "IBPT/empresometro.com.br" },
      ncm: { "21069090": { nf: 10, imp: 15, est: 18, mun: 0 }, "22021000": { nf: 12.5, imp: 20, est: 25, mun: 0 } } };
    for (const modelo of [65, 55]) {
      const r = await notaValida({ ibpt, modelo, pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
      expect(r.erros).toEqual([]);
      expect(r.valido).toBe(true);
    }
  });
  it("NFC-e de entrega a domicílio (indPres 4, indIntermed, enderDest e transporte) é válida no XSD", async () => {
    // Dados fictícios de transportador terceiro e de plataforma, só para o formato.
    const completa = { ativo: true, modFrete: "0", terceiro: { documento: "11.222.333/0001-81", nome: "Transportes Teste Ltda", ie: "110.042.490.114", endereco: "Rua B, 10", municipio: "São Paulo", uf: "SP" },
      marketplaces: [{ nome: "Plataforma Teste", cnpj: "11.222.333/0001-81", idCadIntTran: "loja-123" }] };
    for (const [entregaNfce, entregaOpcoes] of [[{ ativo: true, modFrete: "3" }, null], [completa, { quem: "terceiro", intermediador: "11222333000181" }]]) {
      const r = await notaValida({ entregaNfce, entregaOpcoes, pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
      expect(r.erros).toEqual([]);
      expect(r.valido).toBe(true);
    }
  });
  it("NF-e (55) para empresa", async () => {
    const r = await notaValida({ modelo: 55, pagamento: { total: 105.3, troco: 0, detalhes: [{ forma: "PIX", valor: 105.3 }] } });
    expect(r.erros).toEqual([]);
  });
  it("item com quantidade fracionada (vProd = qCom × vUnCom arredondado)", async () => {
    const r = await notaValida({
      itens: [{ productId: 12, name: "Batata Rústica", price: 12.35, quantity: 1.5 }],
      pagamento: { total: 18.53, troco: 0, detalhes: [{ forma: "PIX", valor: 18.53 }] },
    });
    expect(r.erros).toEqual([]);
  });
  it("controle: XML quebrado é REPROVADO pelo validador", async () => {
    const chave = montarChaveAcesso({ cUF: "35", aamm: "2611", cnpj: "12345678000195", mod: 65, serie: 1, nNF: 1, cNF: "12345670" });
    const r = await validarNFeXsd(`<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe versao="4.00" Id="NFe${chave}"><ide><cUF>XX</cUF></ide></infNFe></NFe>`);
    expect(r.valido).toBe(false);
    expect(r.erros.length).toBeGreaterThan(0);
  });
});

import { lerWasmParaEmpacotar } from "./validarXsd.js";
describe("empacotamento da função de emissão (Vercel)", () => {
  it("o xmllint.wasm é lido por um caminho literal (o empacotador da Vercel só inclui o que enxerga)", () => {
    const bytes = lerWasmParaEmpacotar();
    expect(bytes.length).toBeGreaterThan(10000);
    expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]); // assinatura "\0asm" de um módulo WebAssembly
  });
});
