// @vitest-environment node
// Falha técnica DEPOIS de a nota ser transmitida (ex.: erro ao montar o XML final): a SEFAZ pode ter autorizado,
// então a nota fica "enviado" e o caminho é consultar antes de reenviar.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const ctrl = vi.hoisted(() => ({ falhar: true }));
vi.mock("./sefaz/mensagens.js", async (original) => {
  const real = await original();
  return { ...real, montarProcNFe: (...a) => { if (ctrl.falhar) throw new Error("Falha ao montar procNFe em /var/task/server/fiscal/sefaz/mensagens.js"); return real.montarProcNFe(...a); } };
});
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

describe("emitir: falha técnica DEPOIS do envio (a SEFAZ pode ter autorizado)", () => {
  beforeEach(() => { ctrl.falhar = true; });
  it("mantém 'enviado' (incerta), manda consultar antes de reenviar e não expõe caminhos do servidor", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(d.enviar).toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, code: "FALHA_APOS_ENVIO", podeReenviar: false, podeConsultar: true });
    expect(r.erro).toMatch(/pode ter recebido/);
    expect(r.detalhe).not.toContain("/var/task");
    const reg = d.registrar.mock.calls.map((c) => c[0]);
    expect(reg.at(-1)).toMatchObject({ status: "enviado" });
    expect(reg.at(-1).xMotivo).toMatch(/depois do envio/);
    expect(reg.at(-1).payload).toMatchObject({ etapa: "apos_envio", falhaInterna: true });
  });
});
