import { describe, it, expect } from "vitest";
import { problemasDaEmpresa, problemasDoCertificado, problemasDosItens, problemasDaVenda, validarAntesDeEmitir, textoDosProblemas } from "./validacaoPreEmissao.js";

const EMIT = { razaoSocial: "Burger Ltda", inscricaoEstadual: "110042490114", crt: "1", cep: "01001000", logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceSerie: 1 };
const CNPJ = "11222333000181";
const ITEM = { nome: "X-Burger", quantidade: 1, valorBruto: 30, fiscal: { ncm: "21069090", cfop: "5102", csosn: "102", cstPis: "49", cstCofins: "49" } };
const codigos = (l) => l.map((x) => x.codigo);

describe("empresa", () => {
  it("cadastro correto: sem problemas", () => expect(problemasDaEmpresa(EMIT, CNPJ)).toEqual([]));
  it("CNPJ com dígito errado", () => expect(codigos(problemasDaEmpresa(EMIT, "11222333000182"))).toContain("CNPJ_INVALIDO"));
  it("IE de SP com dígito errado (rejeição 209) e IE fora do formato", () => {
    expect(codigos(problemasDaEmpresa({ ...EMIT, inscricaoEstadual: "123456789012" }, CNPJ))).toContain("IE_DV");
    expect(codigos(problemasDaEmpresa({ ...EMIT, inscricaoEstadual: "ABC" }, CNPJ))).toContain("IE_FORMATO");
  });
  it("IE ISENTO e IE com máscara/produtor rural não são tratadas como erro", () => {
    expect(problemasDaEmpresa({ ...EMIT, inscricaoEstadual: "ISENTO" }, CNPJ)).toEqual([]);
    expect(problemasDaEmpresa({ ...EMIT, inscricaoEstadual: "110.042.490.114" }, CNPJ)).toEqual([]);
  });
  it("município de outra UF e CEP curto", () => {
    expect(codigos(problemasDaEmpresa({ ...EMIT, codigoMunicipioIbge: "3304557" }, CNPJ))).toContain("IBGE_UF");
    expect(codigos(problemasDaEmpresa({ ...EMIT, uf: "RJ" }, CNPJ))).toContain("IBGE_UF");
    expect(codigos(problemasDaEmpresa({ ...EMIT, cep: "0100" }, CNPJ))).toContain("FALTA_CEP");
  });
  it("campo faltando é listado; sem CNPJ informado (caixa) não acusa falta de CNPJ", () => {
    expect(codigos(problemasDaEmpresa({ ...EMIT, bairro: "" }, CNPJ))).toContain("FALTA_Bairro");
    expect(validarAntesDeEmitir({ emitente: EMIT, venda: { itens: [ITEM] } }).ok).toBe(true);
  });
});

describe("certificado e CSC", () => {
  const cred = (extra = {}) => [{ tipo: "certificado_a1", validadeFim: "2027-11-16T00:00:00Z", documentoTitular: CNPJ, ...extra }, { tipo: "csc", ambiente: "homologacao", cadastrado: true }];
  const AGORA = new Date("2026-11-20T12:00:00Z");
  it("tudo certo", () => expect(problemasDoCertificado({ credenciais: cred(), documento: CNPJ, agora: AGORA })).toEqual([]));
  it("sem lista de credenciais (caixa): não inventa problema", () => expect(problemasDoCertificado({ credenciais: null })).toEqual([]));
  it("sem certificado, vencido, de outro CNPJ (raiz diferente) e sem CSC na NFC-e", () => {
    expect(codigos(problemasDoCertificado({ credenciais: [], documento: CNPJ, agora: AGORA }))).toEqual(["SEM_CERTIFICADO"]);
    expect(codigos(problemasDoCertificado({ credenciais: cred({ validadeFim: "2026-01-01T00:00:00Z" }), documento: CNPJ, agora: AGORA }))).toContain("CERT_VENCIDO");
    expect(codigos(problemasDoCertificado({ credenciais: cred({ documentoTitular: "99888777000166" }), documento: CNPJ, agora: AGORA }))).toContain("CERT_OUTRO_CNPJ");
    expect(codigos(problemasDoCertificado({ credenciais: cred().slice(0, 1), documento: CNPJ, modelo: 65, agora: AGORA }))).toContain("SEM_CSC");
  });
  it("filial (mesma raiz de CNPJ) com certificado da matriz passa", () => {
    expect(problemasDoCertificado({ credenciais: cred({ documentoTitular: "11222333000262" }), documento: CNPJ, agora: AGORA })).toEqual([]);
  });
});

describe("itens", () => {
  it("produto correto: sem problemas", () => expect(problemasDosItens([ITEM], { crt: "1", modelo: 65 })).toEqual([]));
  it("MEI (CRT 4) na NFC-e só aceita CFOP 5102: barra 5101 antes de reservar número", () => {
    expect(codigos(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, cfop: "5101" } }], { crt: "4", modelo: 65 }))).toContain("CFOP_MEI");
    expect(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, cfop: "5102" } }], { crt: "4", modelo: 65 })).toEqual([]);
    expect(codigos(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, cfop: "5101" } }], { crt: "1", modelo: 65 }))).not.toContain("CFOP_MEI");
  });
  it("MEI: CSOSN por modelo (NFC-e 102/300; NF-e 102/300/400/900) — rejeição 782", () => {
    const mei = (csosn, modelo, cfop = "5102") => codigos(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, csosn, cfop } }], { crt: "4", modelo }));
    for (const c of ["102", "300"]) expect(mei(c, 65)).toEqual([]);
    for (const c of ["103", "400", "500", "900"]) expect(mei(c, 65)).toContain("CSOSN_MEI");
    for (const c of ["102", "300", "400", "900"]) expect(mei(c, 55)).toEqual([]);
    for (const c of ["103", "500"]) expect(mei(c, 55)).toContain("CSOSN_MEI");
  });
  it("MEI na NF-e: venda com 5102/6102; lista ampla só com CSOSN 900 — rejeição 337", () => {
    const mei = (cfop, csosn = "102") => codigos(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, csosn, cfop } }], { crt: "4", modelo: 55 }));
    expect(mei("5102")).toEqual([]);
    expect(mei("6102")).toEqual([]);
    expect(mei("5101")).toContain("CFOP_MEI");
    expect(mei("5904")).toContain("CFOP_MEI");
    expect(mei("5904", "900")).toEqual([]);
  });
  it("NFC-e: a partir de R$ 10.000 exige identificação; a partir de R$ 200.000 é vedada", () => {
    expect(problemasDaVenda({ modelo: 65, valorTotal: 9999.99 })).toEqual([]);
    expect(codigos(problemasDaVenda({ modelo: 65, valorTotal: 10000 }))).toContain("NFCE_IDENTIFICAR");
    expect(problemasDaVenda({ modelo: 65, valorTotal: 10000, cpfConsumidor: "123.456.789-09" })).toEqual([]);
    expect(codigos(problemasDaVenda({ modelo: 65, valorTotal: 200000, cpfConsumidor: "123.456.789-09" }))).toContain("NFCE_VALOR_VEDADO");
  });
  it("MEI (CRT 4) é Simples Nacional: confere CSOSN, não exige CST de ICMS", () => {
    expect(problemasDosItens([ITEM], { crt: "4", modelo: 65 })).toEqual([]);
    expect(codigos(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, csosn: "" } }], { crt: "4", modelo: 65 }))).toContain("CSOSN");
  });
  it("NCM curto, CFOP inválido ou não 5xxx na NFC-e, CSOSN/CST inválidos", () => {
    const c = codigos(problemasDosItens([{ ...ITEM, fiscal: { ...ITEM.fiscal, ncm: "2106", cfop: "6102", csosn: "999", cstPis: "", cstCofins: "77x" } }], { crt: "1", modelo: 65 }));
    expect(c).toEqual(expect.arrayContaining(["NCM", "CFOP_NFCE", "CSOSN", "CST_PIS", "CST_COFINS"]));
  });
  it("regime normal exige CST de ICMS válido", () => {
    expect(codigos(problemasDosItens([ITEM], { crt: "3", modelo: 65 }))).toContain("CST_ICMS");
  });
  it("nome sem texto válido, quantidade e valor zerados", () => {
    expect(codigos(problemasDosItens([{ ...ITEM, nome: "🍔", quantidade: 0, valorBruto: 0 }], { crt: "1" }))).toEqual(expect.arrayContaining(["DESCRICAO", "QUANTIDADE", "VALOR"]));
  });
});

describe("venda e destinatário", () => {
  const DEST = { documento: "11222333000181", nome: "Cliente Ltda", ie: "ISENTO", ender: { xLgr: "Av A", nro: "1", xBairro: "Centro", xMun: "São Paulo", UF: "SP", CEP: "01001000", cMun: "3550308" } };
  it("NFC-e: CPF do consumidor inválido", () => expect(codigos(problemasDaVenda({ modelo: 65, cpfConsumidor: "11111111112" }))).toContain("CPF_CONSUMIDOR"));
  it("NF-e completa passa; endereço incompleto/documento inválido/município de outra UF não", () => {
    expect(problemasDaVenda({ modelo: 55, destinatario: DEST })).toEqual([]);
    const c = codigos(problemasDaVenda({ modelo: 55, destinatario: { ...DEST, documento: "123", ender: { ...DEST.ender, xBairro: "", cMun: "3304557" } } }));
    expect(c).toEqual(expect.arrayContaining(["DEST_DOC", "DEST_END", "DEST_IBGE_UF"]));
  });
});

describe("conjunto", () => {
  it("tudo certo → ok; com erro → texto pronto com a tela de correção", () => {
    expect(validarAntesDeEmitir({ emitente: EMIT, documento: CNPJ, venda: { itens: [ITEM] } }).ok).toBe(true);
    const r = validarAntesDeEmitir({ emitente: { ...EMIT, inscricaoEstadual: "123456789012" }, documento: CNPJ, venda: { itens: [{ ...ITEM, fiscal: { ...ITEM.fiscal, ncm: "1" } }] } });
    expect(r.ok).toBe(false);
    expect(r.texto).toMatch(/Inscrição Estadual.*NCM.*Corrigir em: Configurações › Dados da Empresa \/ Configurações › Tributação › Produtos\./);
  });
  it("texto limita a 4 problemas e conta o resto", () => {
    const muitos = Array.from({ length: 6 }, (_, i) => ({ codigo: `X${i}`, msg: `Erro ${i}.`, onde: "Tela" }));
    expect(textoDosProblemas(muitos)).toContain("(e mais 2)");
  });
});
