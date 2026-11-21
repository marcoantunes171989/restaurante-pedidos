// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buscarXmlDaNota, nomeArquivoXml, normalizarBusca, xmlParaLinhas, filtrarLinhas, trechosDestacados, resumoDoXml, xmlIndentado, baixarXml } from "./xmlNota";

const CHAVE = "35261144422195000133650010000000011761124180";
const XML = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CHAVE}" versao="4.00"><ide><nNF>1</nNF><dhEmi>2026-11-20T16:11:00-03:00</dhEmi></ide>
<emit><xNome>Burger Station Ltda</xNome></emit><dest><xNome>Maria Açaí</xNome></dest>
<det nItem="1"><prod><xProd>X-Burger</xProd><NCM>21069090</NCM><vProd>30.00</vProd></prod></det>
<det nItem="2"><prod><xProd>Refri Lata</xProd><NCM>22021000</NCM><vProd>6.00</vProd></prod></det>
<total><ICMSTot><vNF>36.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><nProt>135260000000001</nProt></infProt></protNFe></nfeProc>`;

describe("buscar e nome do arquivo", () => {
  it("pede a ação xml ao servidor e devolve o XML", async () => {
    const buscar = vi.fn(async () => ({ ok: true, xml: XML, chave: CHAVE, modelo: 65 }));
    const r = await buscarXmlDaNota({ documentoId: "d1", buscar });
    expect(buscar).toHaveBeenCalledWith({ acao: "xml", documentoId: "d1" });
    expect(r.ok).toBe(true);
  });
  it("erro do servidor vira mensagem para a tela", async () => {
    expect(await buscarXmlDaNota({ documentoId: "d", buscar: async () => ({ ok: false, erro: "Sem permissão." }) })).toEqual({ ok: false, erro: "Sem permissão." });
    expect((await buscarXmlDaNota({ documentoId: "d", buscar: async () => null })).erro).toMatch(/Não foi possível/);
  });
  it("nome: chave de acesso + tipo; sem chave, modelo-série-número", () => {
    expect(nomeArquivoXml({ chave: CHAVE, modelo: 65 })).toBe(`${CHAVE}-nfce.xml`);
    expect(nomeArquivoXml({ chave: CHAVE, modelo: 55 })).toBe(`${CHAVE}-nfe.xml`);
    expect(nomeArquivoXml({ modelo: 65, serie: 1, numero: 7 })).toBe("NFCe-1-7.xml");
  });
});

describe("ler o XML como tags", () => {
  const linhas = xmlParaLinhas(XML);
  it("uma linha por tag, com caminho e itens repetidos numerados", () => {
    expect(linhas[0]).toMatchObject({ tag: "nfeProc", nivel: 0 });
    const xprod = linhas.filter((l) => l.tag === "xProd");
    expect(xprod.map((l) => l.valor)).toEqual(["X-Burger", "Refri Lata"]);
    expect(xprod[0].caminho).toBe("nfeProc › NFe › infNFe › det[1] › prod › xProd");
    expect(xprod[1].caminho).toContain("det[2]");
  });
  it("atributos aparecem (menos o xmlns) e o resumo acha chave, protocolo, valor, emitente e itens", () => {
    expect(linhas.find((l) => l.tag === "det").atributos).toBe('nItem="1"');
    expect(resumoDoXml(linhas)).toMatchObject({ chave: CHAVE, protocolo: "135260000000001", valorNota: "36.00", emitente: "Burger Station Ltda", destinatario: "Maria Açaí", itens: 2 });
  });
  it("XML inválido gera erro claro", () => expect(() => xmlParaLinhas("<a><b></a>")).toThrow(/não pôde ser lido/));
});

describe("pesquisa dentro das tags", () => {
  const linhas = xmlParaLinhas(XML);
  const valores = (t) => filtrarLinhas(linhas, t).filter((l) => l.folha).map((l) => `${l.tag}:${l.valor}`);
  it("por nome da tag", () => expect(valores("vProd")).toEqual(["vProd:30.00", "vProd:6.00"]));
  it("por valor, sem diferenciar maiúscula nem acento", () => {
    expect(valores("BURGER")).toContain("xProd:X-Burger");
    expect(valores("acai")).toEqual(["xNome:Maria Açaí"]);
  });
  it("tag=valor restringe à tag; várias palavras exigem todas", () => {
    expect(valores("xProd=refri")).toEqual(["xProd:Refri Lata"]);
    expect(valores("xnome=burger")).toEqual(["xNome:Burger Station Ltda"]);
    expect(valores("det[2] ncm")).toEqual(["NCM:22021000"]);
  });
  it("busca vazia devolve tudo; sem resultado devolve vazio", () => {
    expect(filtrarLinhas(linhas, "")).toHaveLength(linhas.length);
    expect(filtrarLinhas(linhas, "zzzzzz")).toEqual([]);
  });
  it("normalizarBusca e destaque dos trechos achados (ignora acento)", () => {
    expect(normalizarBusca("  AÇAÍ ")).toBe("acai");
    expect(trechosDestacados("Maria Açaí Grande", "acai")).toEqual([{ texto: "Maria ", achou: false }, { texto: "Açaí", achou: true }, { texto: " Grande", achou: false }]);
    expect(trechosDestacados("X-Burger", "")).toEqual([{ texto: "X-Burger", achou: false }]);
  });
});

describe("exibição e download", () => {
  it("XML indentado mantém as tags e valores", () => {
    const t = xmlIndentado("<a><b>1</b><c/></a>");
    expect(t).toBe("<a>\n  <b>1</b>\n  <c/>\n</a>");
  });
  it("baixar cria o arquivo com o nome e libera a URL", () => {
    const click = vi.fn();
    const doc = { createElement: () => ({ click, remove() {}, set href(v) { this._h = v; } }), body: { appendChild() {} } };
    const url = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() };
    vi.useFakeTimers();
    baixarXml("<a/>", "n.xml", { doc, url });
    expect(click).toHaveBeenCalled();
    vi.advanceTimersByTime(1100);
    expect(url.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
  });
});
