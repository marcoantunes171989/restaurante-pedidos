// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const CHAVE = "35261112345678000195650010000000071482135790";
const NS = 'xmlns="http://www.portalfiscal.inf.br/nfe"';
const consulta = (cStat, { nProt = "13526000027649606", digVal = "ABC123=" } = {}) => cStat === 100
  ? `<retConsSitNFe ${NS} versao="4.00"><tpAmb>2</tpAmb><verAplic>SP</verAplic><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo><cUF>35</cUF><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SP</verAplic><chNFe>${CHAVE}</chNFe><dhRecbto>2026-11-20T12:00:05-03:00</dhRecbto><nProt>${nProt}</nProt><digVal>${digVal}</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retConsSitNFe>`
  : `<retConsSitNFe ${NS} versao="4.00"><tpAmb>2</tpAmb><verAplic>SP</verAplic><cStat>${cStat}</cStat><xMotivo>x</xMotivo><cUF>35</cUF></retConsSitNFe>`;

function deps({ status = "autorizado", ret = consulta(100), xmlGuardado = "<nfeProc><DigestValue>ABC123=</DigestValue></nfeProc>", pode = true } = {}) {
  const doc = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status, chave: CHAVE, protocolo: "13526000027649606" };
  return {
    podeEmitir: vi.fn().mockResolvedValue(pode), podeConfigurar: vi.fn().mockResolvedValue(false), documento: vi.fn().mockResolvedValue(doc), ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }), paraDanfe: vi.fn().mockResolvedValue({ ok: true, xml: xmlGuardado }),
    registrarConferencia: vi.fn().mockResolvedValue({ ok: true }), endereco: () => "https://sefaz.teste/ws",
    enviar: vi.fn(async () => ({ ok: true, xml: ret })),
  };
}
const conferir = (d) => processarEmissao({ acao: "conferir", documentoId: "d1" }, d);

describe("conferência da nota na base nacional da SEFAZ", () => {
  it("nota autorizada que a SEFAZ confirma (mesmo protocolo e mesma assinatura): conforme, e fica registrado no histórico", async () => {
    const d = deps();
    const r = await conferir(d);
    expect(r).toMatchObject({ ok: true, conforme: true, situacaoSefaz: "autorizada", cStat: 100, protocolo: "13526000027649606", divergencias: [] });
    expect(d.registrarConferencia).toHaveBeenCalledWith(expect.objectContaining({ documentoId: "d1", conforme: true, digVal: "ABC123=", cStat: 100 }));
  });
  it("protocolo diferente do guardado: aponta a divergência", async () => {
    const r = await conferir(deps({ ret: consulta(100, { nProt: "13526000099999999" }) }));
    expect(r.conforme).toBe(false);
    expect(r.divergencias.join(" ")).toMatch(/Protocolo diferente/);
  });
  it("assinatura do XML guardado diferente da autorizada: aponta", async () => {
    const r = await conferir(deps({ xmlGuardado: "<nfeProc><DigestValue>OUTRO=</DigestValue></nfeProc>" }));
    expect(r.conforme).toBe(false);
    expect(r.divergencias.join(" ")).toMatch(/DigestValue/);
  });
  it("SEFAZ não tem a chave (217): divergência grave", async () => {
    const r = await conferir(deps({ ret: consulta(217) }));
    expect(r).toMatchObject({ ok: true, conforme: false, situacaoSefaz: "nao_encontrada" });
    expect(r.divergencias[0]).toMatch(/NÃO tem esta chave/);
  });
  it("sistema autorizada × SEFAZ cancelada (e o inverso) são divergências", async () => {
    expect((await conferir(deps({ ret: consulta(101) }))).divergencias.join(" ")).toMatch(/CANCELADA/);
    expect((await conferir(deps({ status: "cancelado", ret: consulta(100) }))).divergencias.join(" ")).toMatch(/ainda a mostra como autorizada/);
  });
  it("nota cancelada que a SEFAZ também mostra cancelada: conforme", async () => {
    expect(await conferir(deps({ status: "cancelado", ret: consulta(101) }))).toMatchObject({ ok: true, conforme: true, situacaoSefaz: "cancelada" });
  });
  it("SEFAZ sem resposta: nada é registrado", async () => {
    const d = deps();
    d.enviar = vi.fn(async () => ({ ok: false, erro: "timeout", incerto: true }));
    expect(await conferir(d)).toMatchObject({ ok: false, code: "CONSULTA_INDISPONIVEL" });
    expect(d.registrarConferencia).not.toHaveBeenCalled();
  });
  it("só nota autorizada ou cancelada; e só quem tem permissão", async () => {
    expect(await conferir(deps({ status: "rejeitado" }))).toMatchObject({ ok: false, code: "STATUS_NAO_PERMITE" });
    expect(await conferir(deps({ pode: false }))).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});
