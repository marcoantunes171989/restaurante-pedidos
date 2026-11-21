import { describe, expect, it } from "vitest";
import { prontidaoProducao, produtosComProblemaDeProducao } from "./prontidaoProducao.js";

const AGORA = new Date("2026-11-21T12:00:00Z");
const EMITENTE = {
  lojaId: 9, razaoSocial: "44.422.195 MARCO ANTONIO ANTUNES JUNIOR", nomeFantasia: "Burger Station", inscricaoEstadual: "110042490114", crt: "4", nfceHabilitada: true, nfeHabilitada: false,
  nfceAmbiente: "homologacao", cep: "16705424", logradouro: "Rua José Moana", numero: "217", bairro: "Jardim Iguatemi", municipio: "Guararapes", codigoMunicipioIbge: "3518206", uf: "SP", nfceSerie: 1,
};
const CERT = { tipo: "certificado_a1", titular: "EMPRESA", validadeFim: "2027-06-01T00:00:00Z", cadastrado: true };
const CSC = { tipo: "csc", ambiente: "producao", cadastrado: true, idCsc: "1" };
const SERIE = { modelo: 65, ambiente: "producao", ativa: true, serie: 1, proximoNumero: 1 };
const FORMAS = [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }, { id: 4, nome: "PIX", tipo: "pix" }];
const CONFIG = { mapaMeios: { "id:1": "01", "id:4": "17" }, taxaServicoTratamento: "outras_despesas" };
const REGRA = { id: 3, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49", lojaId: 9 };
const PRODUTO = { id: 10, name: "X-Burger", lojaId: 9, active: true, lojaFiscalRegraId: 3, fiscal: {} };
const base = (extra = {}) => ({ emitente: EMITENTE, documentoLoja: "44422195000133", credenciais: [CERT, CSC], series: [SERIE], formas: FORMAS, config: CONFIG, produtos: [PRODUTO], regrasLoja: [REGRA], producao: { faltas: [], liberada: true }, testeProducao: { ok: true }, agora: AGORA, ...extra });
const ids = (r, so = (i) => !i.ok) => r.itens.filter(so).map((i) => i.id);

describe("prontidão para PRODUÇÃO (MEI)", () => {
  it("tudo certo: pronto, sem bloqueio e sem aviso", () => {
    const r = prontidaoProducao(base());
    expect(ids(r)).toEqual([]);
    expect(r).toMatchObject({ pronto: true, bloqueios: 0, avisos: 0 });
  });
  it("sem nada: todos os itens que a trava exige aparecem como bloqueio", () => {
    const r = prontidaoProducao({ agora: AGORA });
    expect(r.pronto).toBe(false);
    expect(ids(r, (i) => !i.ok && i.bloqueia)).toEqual(expect.arrayContaining(["nfce", "emitente", "regime", "certificado", "serie", "csc", "taxa"]));
  });
  it("série e CSC só valem se forem de PRODUÇÃO (os de homologação não contam)", () => {
    const r = prontidaoProducao(base({ series: [{ ...SERIE, ambiente: "homologacao" }], credenciais: [CERT, { ...CSC, ambiente: "homologacao" }] }));
    expect(ids(r)).toEqual(expect.arrayContaining(["serie", "csc"]));
  });
  it("certificado vencendo (30 dias) bloqueia; vencido também", () => {
    expect(ids(prontidaoProducao(base({ credenciais: [{ ...CERT, validadeFim: "2026-12-05T00:00:00Z" }, CSC] })))).toContain("certificado");
    expect(ids(prontidaoProducao(base({ credenciais: [{ ...CERT, validadeFim: "2026-01-01T00:00:00Z" }, CSC] })))).toContain("certificado");
  });
  it("a trava do banco diz que falta homologação: bloqueia; sem resposta da trava também", () => {
    expect(ids(prontidaoProducao(base({ producao: { faltas: ["Pelo menos 1 NFC-e autorizada em homologação."], liberada: false } })))).toContain("homologacao");
    expect(ids(prontidaoProducao(base({ producao: null })))).toContain("homologacao");
  });
  it("forma de pagamento sem código fiscal e taxa de serviço sem regra bloqueiam", () => {
    const r = prontidaoProducao(base({ config: { mapaMeios: { "id:1": "01" }, taxaServicoTratamento: null } }));
    expect(ids(r)).toEqual(expect.arrayContaining(["pagamentos", "taxa"]));
    expect(r.itens.find((i) => i.id === "pagamentos").dica).toMatch(/PIX/);
  });
  it("cadastro da empresa incompleto lista o que falta", () => {
    const r = prontidaoProducao(base({ emitente: { ...EMITENTE, logradouro: "", codigoMunicipioIbge: "" } }));
    expect(ids(r)).toContain("emitente");
    expect(r.itens.find((i) => i.id === "emitente").dica).toMatch(/Faltam/);
  });
  it("produto com CFOP 5101 ou CSOSN 101 não serve para MEI: aviso (não bloqueia), com o motivo", () => {
    const r = prontidaoProducao(base({ regrasLoja: [{ ...REGRA, cfopCodigo: "5101", csosn: "101" }] }));
    expect(ids(r)).toContain("produtos");
    expect(r.itens.find((i) => i.id === "produtos").bloqueia).toBe(false);
    expect(r.pronto).toBe(false);
    const p = r.produtosComProblema[0];
    expect(p.problemas.join(" ")).toMatch(/5102/);
    expect(p.problemas.join(" ")).toMatch(/CSOSN 101 não vale para MEI/);
  });
  it("CSOSN 101/900 só é recusado para MEI; no Simples comum (CRT 1) o 101 com crédito segue valendo", () => {
    const regra101 = { ...REGRA, csosn: "101", cfopCodigo: "5102" };
    const prodSimples = produtosComProblemaDeProducao({ produtos: [{ ...PRODUTO, fiscal: { creditoSnAliquota: 1.25 } }], regrasLoja: [regra101], crt: "1" });
    expect(prodSimples).toEqual([]);
    const prodMei = produtosComProblemaDeProducao({ produtos: [{ ...PRODUTO, fiscal: { creditoSnAliquota: 1.25 } }], regrasLoja: [regra101], crt: "4" });
    expect(prodMei[0].problemas.join(" ")).toMatch(/MEI/);
  });
  it("sem teste de conexão de produção: só aviso, não bloqueia a trava", () => {
    const r = prontidaoProducao(base({ testeProducao: null }));
    expect(ids(r)).toEqual(["conexao"]);
    expect(r).toMatchObject({ bloqueios: 0, avisos: 1, pronto: false });
  });
});
