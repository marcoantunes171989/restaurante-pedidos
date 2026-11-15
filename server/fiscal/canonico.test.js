// @vitest-environment node
// O XML gerado já sai na forma canônica C14N (REC-xml-c14n-20010315), a
// mesma exigida pelo leiaute na assinatura. Prova independente: o libxml2
// (xmllint-wasm) canonicaliza e o resultado precisa ser idêntico.
import { describe, it, expect } from "vitest";
import { validateXML } from "xmllint-wasm";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";

const CHAVE = "35261112345678000195650010000000011234567890";
const base = {
  chave: CHAVE,
  ide: { cUF: "35", cNF: "23456789", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 1, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Bar & Restaurante <Teste>", IE: "123456789012", CRT: "1",
    ender: { xLgr: "Rua \"das\" Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "Porção 'Fritas' & Molho > 1", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30,
    icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
};

async function c14n(xml) {
  const r = await validateXML({ xml: [{ fileName: "x.xml", contents: xml }], normalization: "c14n" });
  return String(r.normalized).replace(/\n$/, ""); // xmllint acrescenta \n final
}

describe("forma canônica (C14N)", () => {
  it("XML gerado = XML canonicalizado pelo libxml2 (inclusive com aspas, & e < > no texto)", async () => {
    const { xml } = montarXmlNFe(base);
    expect(await c14n(xml)).toBe(xml);
  });
});
