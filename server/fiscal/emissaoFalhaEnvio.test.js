// @vitest-environment node
// Falha técnica ANTES de a nota chegar à SEFAZ (ex.: o arquivo da validação do XML não estava no pacote da função na Vercel):
// antes virava um 500 mudo e a nota ficava "enviando" para sempre. Agora vira "erro" com o motivo e pode ser reenviada.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const ctrl = vi.hoisted(() => ({ falhar: true }));
vi.mock("./validarXsd.js", async (original) => {
  const real = await original();
  return {
    ...real,
    validarMensagemXsd: async (...a) => {
      if (ctrl.falhar) throw Object.assign(new Error("ENOENT: no such file or directory, open '/var/task/node_modules/xmllint-wasm/xmllint.wasm'"), { code: "ENOENT" });
      return real.validarMensagemXsd(...a);
    },
  };
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

describe("emitir: falha técnica antes do envio", () => {
  beforeEach(() => { ctrl.falhar = true; });
  it("não estoura 500: registra 'erro' com o motivo e o tipo, devolve FALHA_ENVIO e NÃO fala com a SEFAZ", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: false, code: "FALHA_ENVIO", podeReenviar: true, numero: 7, serie: 1 });
    expect(r.detalhe).toMatch(/ENOENT.*xmllint\.wasm/);
    expect(r.erro).toMatch(/NÃO chegou à SEFAZ/);
    const reg = d.registrar.mock.calls.map((c) => c[0]);
    expect(reg[0]).toMatchObject({ status: "enviado" });
    expect(reg[1]).toMatchObject({ status: "erro", cStat: null });
    expect(reg[1].xMotivo).toMatch(/Falha técnica ao enviar \(a nota não chegou à SEFAZ\): ENOENT/);
    expect(reg[1].payload).toMatchObject({ etapa: "envio", falhaInterna: true, tipoErro: "ENOENT" });
    expect(d.enviar).not.toHaveBeenCalled(); // nada foi transmitido
  });
  it("depois de corrigido, o mesmo documento pode ser reenviado (status 'erro' é reenviável) e autoriza", async () => {
    const d = deps();
    await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    ctrl.falhar = false;
    d.documento.mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "erro", chave: DADOS.chave, rascunho: { dados: DADOS } });
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", numero: 7 });
  });
});
