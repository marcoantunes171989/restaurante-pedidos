// @vitest-environment node
// Reenvio: a data-hora de emissão é renovada (rejeição 704 'emissão atrasada'), exceto em nota 'enviada' (conteúdo assinado igual).
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

import { processarEmissao } from "./emissaoService.js";
import { montarProcNFe } from "./sefaz/mensagens.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const DADOS = {
  chave: "35261112345678000195650010000000071482135790",
  ide: { cUF: "35", cNF: "48213579", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 7, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Burger Teste Ltda", IE: "123456789012", CRT: "1", ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30, icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
};
void montarProcNFe;

function deps() {
  const doc = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado", chave: null, rascunho: { dados: DADOS } };
  return {
    podeConfigurar: vi.fn().mockResolvedValue(true), podeEmitir: vi.fn().mockResolvedValue(true), ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }), documento: vi.fn().mockResolvedValue(doc),
    registrar: vi.fn().mockResolvedValue({ ok: true }),
    enviar: vi.fn(async () => ({ ok: true, xml: `<retEnviNFe versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${DADOS.chave}</chNFe><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><nProt>135260000000007</nProt><digVal>AAAA</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe>` })),
  };
}


async function emitirCom(status, agora) {
  const d = deps();
  d.agora = () => new Date(agora);
  d.renovarDhEmissao = vi.fn(async () => ({ ok: true }));
  d.documento.mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status, chave: DADOS.chave, rascunho: { dados: DADOS } });
  const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
  return { r, d };
}
const enviado = (d) => d.enviar.mock.calls.map((c) => JSON.stringify(c)).join("");
describe("reenvio renova a data-hora de emissão", () => {
  it("nota com erro há horas: transmite com a data-hora atual (16:00 em SP)", async () => {
    const { r, d } = await emitirCom("erro", "2026-11-15T19:00:00Z");
    expect(r.ok).toBe(true);
    expect(enviado(d)).toContain("2026-11-15T16:00:00");
    expect(enviado(d)).not.toContain("2026-11-15T12:30:00");
    // grava o novo dhEmi ANTES de transmitir (a consulta posterior recompõe o mesmo XML)
    expect(d.renovarDhEmissao).toHaveBeenCalledWith({ documentoId: "d1", dhEmi: "2026-11-15T19:00:00.000Z" });
  });
  it("se a gravação falhar (migration 192 ausente), transmite mesmo assim e deixa marcado no evento", async () => {
    const d = deps();
    d.agora = () => new Date("2026-11-15T19:00:00Z");
    d.renovarDhEmissao = vi.fn(async () => { throw new Error("RPC não existe"); });
    d.documento.mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "erro", chave: DADOS.chave, rascunho: { dados: DADOS } });
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r.ok).toBe(true);
    expect(enviado(d)).toContain("2026-11-15T16:00:00");
    expect(d.registrar.mock.calls[0][0].payload).toMatchObject({ dhEmiRenovadoSemGravar: true });
  });
  it("nota 'enviado' (a SEFAZ pode ter recebido): mantém a data-hora original", async () => {
    const { d } = await emitirCom("enviado", "2026-11-15T19:00:00Z");
    expect(enviado(d)).toContain("2026-11-15T12:30:00");
    expect(d.renovarDhEmissao).not.toHaveBeenCalled();
  });
  it("tentativa logo em seguida (menos de 2 min): não mexe", async () => {
    const { d } = await emitirCom("erro", "2026-11-15T15:31:00Z");
    expect(enviado(d)).toContain("2026-11-15T12:30:00");
  });
  it("mês da chave diferente do mês atual: não mexe (a chave carrega AAMM)", async () => {
    const { d } = await emitirCom("erro", "2026-12-02T15:00:00Z");
    expect(enviado(d)).toContain("2026-11-15T12:30:00");
  });
});
