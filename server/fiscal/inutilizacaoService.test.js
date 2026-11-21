// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";
import { montarInutNFe, assinarInutNFe, interpretarRetInutNFe } from "./sefaz/inutilizacao.js";
import { inutilizacaoNaSefaz } from "../../src/lib/fiscal/inutilizacaoUf.js";
import { lerCertificadoPfx } from "./certificado.js";

const PFX = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url));
const PFX_B64 = PFX.toString("base64");
const SENHA = "teste-pedido-prime";
const CHAVE = "35261112345678000195650010000000071482135790";
const MOTIVO = "Venda cancelada antes da transmissão";
const AGORA = new Date("2026-11-20T15:00:00Z");

const NS = 'xmlns="http://www.portalfiscal.inf.br/nfe"';
const consulta217 = `<retConsSitNFe ${NS} versao="4.00"><tpAmb>2</tpAmb><verAplic>SP</verAplic><cStat>217</cStat><xMotivo>Rejeicao: NF-e nao consta na base de dados da SEFAZ</xMotivo><cUF>35</cUF></retConsSitNFe>`;
const consultaAutorizada = `<retConsSitNFe ${NS} versao="4.00"><tpAmb>2</tpAmb><verAplic>SP</verAplic><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo><cUF>35</cUF><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SP</verAplic><chNFe>${CHAVE}</chNFe><dhRecbto>2026-11-20T12:00:05-03:00</dhRecbto><nProt>13526000027649606</nProt><digVal>AAAA</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retConsSitNFe>`;
const retInut = (cStat, xMotivo, nProt = "13526000027700001") => `<retInutNFe ${NS} versao="4.00"><infInut><tpAmb>2</tpAmb><verAplic>X</verAplic><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo><cUF>31</cUF><ano>26</ano><CNPJ>12345678000195</CNPJ><mod>65</mod><serie>1</serie><nNFIni>7</nNFIni><nNFFin>7</nNFFin>${cStat === 102 ? `<dhRecbto>2026-11-20T12:00:09-03:00</dhRecbto><nProt>${nProt}</nProt>` : ""}</infInut></retInutNFe>`;

function deps({ uf = "SP", status = "reservado", chave = null, permissao = true, consulta = consulta217, inut = retInut(102, "Inutilizacao de numero homologado"), registro = { ok: true }, usuario = { id: 5, nome: "Marco", email: "m@x.com" } } = {}) {
  const doc = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status, chave, protocolo: status === "autorizado" ? "13526000027649606" : null, rascunho: { dados: { emit: { CNPJ: "12345678000195" } } } };
  const enviados = [];
  return {
    doc, enviados,
    podeConfigurar: vi.fn().mockResolvedValue(permissao), documento: vi.fn().mockResolvedValue(doc), ufDaLoja: vi.fn().mockResolvedValue(uf),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: SENHA }), usuarioAtual: vi.fn().mockResolvedValue(usuario),
    registrarInutilizacao: vi.fn().mockResolvedValue(registro), agora: () => AGORA,
    endereco: () => "https://sefaz.teste/ws",
    enviar: vi.fn(async ({ servico, dados }) => { enviados.push({ servico, dados }); return { ok: true, xml: servico === "NFeInutilizacao4" ? inut : consulta }; }),
  };
}
const inutilizar = (d, extra = {}) => processarEmissao({ acao: "inutilizar", documentoId: "d1", motivo: MOTIVO, ...extra }, d);

describe("regra por estado: onde a SEFAZ ainda tem inutilização", () => {
  it("AC, BA e SP não têm mais (homologação desde 05/11/2026, produção desde 11/11/2026)", () => {
    expect(inutilizacaoNaSefaz({ uf: "SP", ambiente: "producao", agora: AGORA }).naSefaz).toBe(false);
    expect(inutilizacaoNaSefaz({ uf: "sp", ambiente: "homologacao", agora: AGORA }).naSefaz).toBe(false);
    expect(inutilizacaoNaSefaz({ uf: "BA", ambiente: "producao", agora: AGORA }).naSefaz).toBe(false);
    expect(inutilizacaoNaSefaz({ uf: "AC", ambiente: "producao", agora: AGORA }).motivo).toMatch(/não recebe mais/);
  });
  it("antes das datas de corte e nos demais estados continua na SEFAZ", () => {
    expect(inutilizacaoNaSefaz({ uf: "SP", ambiente: "producao", agora: new Date("2026-11-10T12:00:00Z") }).naSefaz).toBe(true);
    expect(inutilizacaoNaSefaz({ uf: "SP", ambiente: "homologacao", agora: new Date("2026-11-04T12:00:00Z") }).naSefaz).toBe(true);
    for (const uf of ["MG", "RJ", "RS", "PR", "SC", "GO", "PE"]) expect(inutilizacaoNaSefaz({ uf, ambiente: "producao", agora: AGORA }).naSefaz).toBe(true);
  });
});

describe("XML de inutilização (NFeInutilizacao4)", () => {
  const base = { tpAmb: 2, cUF: "31", ano: 2026, cnpj: "12345678000195", modelo: 65, serie: 1, nIni: 7, xJust: MOTIVO };
  it("monta o infInut com o Id de 43 posições e a faixa do número", () => {
    const x = montarInutNFe(base);
    expect(x).toContain('<infInut Id="ID31261234567800019565001000000007000000007">');
    expect(/Id="(ID\d{41})"/.exec(x)[1]).toHaveLength(43);
    expect(x).toContain("<xServ>INUTILIZAR</xServ>");
    expect(x).toContain("<nNFIni>7</nNFIni><nNFFin>7</nNFFin>");
  });
  it("recusa justificativa curta e faixa inválida", () => {
    expect(() => montarInutNFe({ ...base, xJust: "curta" })).toThrow(/15 a 255/);
    expect(() => montarInutNFe({ ...base, nIni: 0 })).toThrow(/Faixa/);
    expect(() => montarInutNFe({ ...base, modelo: 59 })).toThrow(/Modelo/);
  });
  it("assina o infInut e não assina duas vezes", () => {
    const cert = lerCertificadoPfx(PFX, SENHA);
    const s = assinarInutNFe(montarInutNFe(base), cert);
    expect(s).toContain("<Signature");
    expect(s.indexOf("</infInut>")).toBeLessThan(s.indexOf("<Signature"));
    expect(() => assinarInutNFe(s, cert)).toThrow(/já assinado/);
  });
  it("cStat 102 = inutilizada, com protocolo; outro = rejeitada", () => {
    expect(interpretarRetInutNFe(retInut(102, "ok"))).toMatchObject({ situacao: "inutilizado", cStat: 102, nProt: "13526000027700001" });
    expect(interpretarRetInutNFe(retInut(241, "Um numero da faixa ja foi utilizado"))).toMatchObject({ situacao: "rejeitado", cStat: 241 });
  });
});

describe("inutilizar: fluxo", () => {
  it("SP (sem o serviço): não chama a SEFAZ, registra como número não usado e explica que não há protocolo", async () => {
    const d = deps({ uf: "SP" });
    const r = await inutilizar(d);
    expect(r).toMatchObject({ ok: true, inutilizado: false, naSefaz: false });
    expect(r.aviso).toMatch(/SEFAZ-SP não recebe mais/);
    expect(d.enviar).not.toHaveBeenCalled();
    expect(d.registrarInutilizacao).toHaveBeenCalledWith(expect.objectContaining({ documentoId: "d1", inutilizado: false, motivo: MOTIVO, usuarioId: 5 }));
  });
  it("estado com o serviço: consulta a SEFAZ (217), envia a inutilização assinada e guarda protocolo, cStat e XML", async () => {
    const d = deps({ uf: "MG", status: "rejeitado", chave: CHAVE });
    const r = await inutilizar(d);
    expect(r).toMatchObject({ ok: true, inutilizado: true, naSefaz: true, protocolo: "13526000027700001", cStat: 102 });
    expect(d.enviados.map((e) => e.servico)).toEqual(["NFeConsultaProtocolo4", "NFeInutilizacao4"]);
    expect(d.enviados[1].dados).toContain("<Signature");
    const g = d.registrarInutilizacao.mock.calls[0][0];
    expect(g).toMatchObject({ inutilizado: true, protocolo: "13526000027700001", cStat: 102, motivo: MOTIVO });
    expect(g.xml).toContain("<ProcInutNFe");
    expect(g.xml).toContain("<retInutNFe");
  });
  it("reservada que nunca foi enviada: não precisa consultar (vai direto)", async () => {
    const d = deps({ uf: "MG", status: "reservado" });
    await inutilizar(d);
    expect(d.enviados.map((e) => e.servico)).toEqual(["NFeInutilizacao4"]);
  });
  it("se a SEFAZ já tem a nota (autorizada), NÃO inutiliza: devolve o protocolo e manda consultar", async () => {
    const d = deps({ uf: "MG", status: "enviado", chave: CHAVE, consulta: consultaAutorizada });
    const r = await inutilizar(d);
    expect(r).toMatchObject({ ok: false, code: "JA_NA_SEFAZ", protocolo: "13526000027649606" });
    expect(d.enviados.map((e) => e.servico)).toEqual(["NFeConsultaProtocolo4"]);
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("também em SP: nota 'enviada' que a SEFAZ já autorizou não vira número descartado", async () => {
    const d = deps({ uf: "SP", status: "enviado", chave: CHAVE, consulta: consultaAutorizada });
    expect(await inutilizar(d)).toMatchObject({ ok: false, code: "JA_NA_SEFAZ" });
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("consulta sem resposta: não faz nada", async () => {
    const d = deps({ uf: "SP", status: "erro", chave: CHAVE });
    d.enviar = vi.fn(async () => ({ ok: false, erro: "timeout", incerto: true }));
    expect(await inutilizar(d)).toMatchObject({ ok: false, code: "CONSULTA_INDISPONIVEL" });
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("SEFAZ recusa a inutilização: mostra o motivo dela e não grava", async () => {
    const d = deps({ uf: "MG", inut: retInut(241, "Rejeicao: Um numero da faixa ja foi utilizado") });
    const r = await inutilizar(d);
    expect(r).toMatchObject({ ok: false, code: "INUTILIZACAO_REJEITADA", cStat: 241 });
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("SEFAZ fora do ar: nada é gravado", async () => {
    const d = deps({ uf: "MG" });
    d.enviar = vi.fn(async () => ({ ok: false, erro: "fora do ar" }));
    expect(await inutilizar(d)).toMatchObject({ ok: false, code: "SEFAZ_INDISPONIVEL" });
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("SEFAZ inutilizou mas o banco recusou: devolve o protocolo para não se perder", async () => {
    const d = deps({ uf: "MG", registro: { ok: false, code: "PROTOCOLO_INVALIDO" } });
    expect(await inutilizar(d)).toMatchObject({ ok: false, code: "FALHA_REGISTRO", protocolo: "13526000027700001", detalhe: "PROTOCOLO_INVALIDO" });
  });
});

describe("inutilizar: o que nunca pode acontecer", () => {
  it("nota AUTORIZADA não se inutiliza (o caminho é cancelar)", async () => {
    const d = deps({ status: "autorizado", chave: CHAVE });
    expect(await inutilizar(d)).toMatchObject({ ok: false, code: "AUTORIZADA", protocolo: "13526000027649606" });
    expect(d.enviar).not.toHaveBeenCalled();
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("cancelada e já inutilizada também não", async () => {
    expect(await inutilizar(deps({ status: "cancelado" }))).toMatchObject({ ok: false, code: "STATUS_NAO_PERMITE" });
    expect(await inutilizar(deps({ status: "descartado" }))).toMatchObject({ ok: false, code: "JA_INUTILIZADA" });
  });
  it("motivo com menos de 15 caracteres é recusado antes de qualquer coisa", async () => {
    const d = deps();
    expect(await inutilizar(d, { motivo: "erro" })).toMatchObject({ ok: false, code: "MOTIVO_CURTO" });
    expect(d.documento).not.toHaveBeenCalled();
  });
  it("sem permissão de gestão da loja: recusado", async () => {
    const d = deps({ permissao: false });
    expect(await inutilizar(d)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(d.registrarInutilizacao).not.toHaveBeenCalled();
  });
  it("sem usuário identificado: recusado (o log precisa de quem fez)", async () => {
    expect(await inutilizar(deps({ usuario: null }))).toMatchObject({ ok: false, code: "SEM_USUARIO" });
  });
});
