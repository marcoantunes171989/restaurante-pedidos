// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const DADOS = {
  chave: "35261112345678000195650010000000071482135790",
  ide: { cUF: "35", cNF: "48213579", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 7, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Burger Teste Ltda", IE: "110042490114", CRT: "1", ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30, icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
};
const retorno = (cStat, xMotivo) => `<retEnviNFe versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${DADOS.chave}</chNFe><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><nProt>135260000000007</nProt><digVal>AAAA</digVal><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo></infProt></protNFe></retEnviNFe>`;

function deps({ status = "rejeitado", configurar = true, usuario = { id: 5, nome: "Marco Antunes", email: "marco@x.com" } } = {}) {
  const doc = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status, chave: DADOS.chave, rascunho: { dados: structuredClone(DADOS) } };
  return {
    podeConfigurar: vi.fn().mockResolvedValue(configurar), podeEmitir: vi.fn().mockResolvedValue(true), ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }), documento: vi.fn().mockResolvedValue(doc),
    registrar: vi.fn().mockResolvedValue({ ok: true }),
    usuarioAtual: vi.fn().mockResolvedValue(usuario),
    salvarManutencao: vi.fn().mockResolvedValue({ ok: true, em: "2026-11-20T21:00:00Z" }),
    enviar: vi.fn(async () => ({ ok: true, xml: retorno(100, "Autorizado o uso da NF-e") })),
  };
}
const salvar = (d, extra = {}) => processarEmissao({ acao: "manutencao_salvar", documentoId: "d1", motivo: "Corrigir NCM do lanche", alteracoes: [{ caminho: "itens.0.NCM", valor: "21069010" }], ...extra }, d);

describe("manutenção fiscal: abrir", () => {
  it("devolve os dados e as células (editáveis e travadas) sem gravar nada", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "manutencao_abrir", documentoId: "d1" }, d);
    expect(r.ok).toBe(true);
    expect(r.documento).toMatchObject({ numero: 7, status: "rejeitado", modelo: 65 });
    expect(r.celulas.find((c) => c.caminho === "itens.0.NCM")).toMatchObject({ editavel: true, valor: "21069090" });
    expect(r.celulas.find((c) => c.caminho === "itens.0.vProd")).toMatchObject({ editavel: false });
    expect(d.salvarManutencao).not.toHaveBeenCalled();
  });
  it("só administrador da loja: sem permissão não devolve nada", async () => {
    const r = await processarEmissao({ acao: "manutencao_abrir", documentoId: "d1" }, deps({ configurar: false }));
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(r.dados).toBeUndefined();
  });
  it("nota autorizada, enviada ou cancelada não recebe manutenção", async () => {
    for (const status of ["autorizado", "enviado", "cancelado"]) {
      expect(await processarEmissao({ acao: "manutencao_abrir", documentoId: "d1" }, deps({ status }))).toMatchObject({ ok: false, code: "STATUS_NAO_PERMITE" });
    }
  });
});

describe("manutenção fiscal: gravar", () => {
  it("grava os dados corrigidos com usuário, motivo e cada campo (de → para)", async () => {
    const d = deps();
    const r = await salvar(d);
    expect(r).toMatchObject({ ok: true, salva: true, usuario: { nome: "Marco Antunes" } });
    expect(r.emissao).toBeUndefined();
    const g = d.salvarManutencao.mock.calls[0][0];
    expect(g.dados.itens[0].NCM).toBe("21069010");
    expect(g.dados.chave).toBe(DADOS.chave);
    expect(g.usuario).toMatchObject({ id: 5, email: "marco@x.com" });
    expect(g.motivo).toBe("Corrigir NCM do lanche");
    expect(g.alteracoes).toEqual([{ campo: "Item 1 › NCM", caminho: "itens.0.NCM", de: "21069090", para: "21069010" }]);
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it("campo travado (valor, chave) ou desconhecido é recusado e nada é gravado", async () => {
    const d = deps();
    const r = await salvar(d, { alteracoes: [{ caminho: "itens.0.vProd", valor: "1" }, { caminho: "chave", valor: "9" }, { caminho: "campo.inexistente", valor: "x" }] });
    expect(r).toMatchObject({ ok: false, code: "ALTERACAO_INVALIDA" });
    expect(r.erros).toHaveLength(3);
    expect(d.salvarManutencao).not.toHaveBeenCalled();
  });
  it("valor inválido (NCM curto, CFOP 6xxx em NFC-e) é recusado com a mensagem do campo", async () => {
    const r = await salvar(deps(), { alteracoes: [{ caminho: "itens.0.NCM", valor: "123" }, { caminho: "itens.0.CFOP", valor: "6102" }] });
    expect(r.code).toBe("ALTERACAO_INVALIDA");
    expect(r.erros.join(" ")).toMatch(/NCM precisa ter 8.*NFC-e só aceita CFOP 5/);
  });
  it("motivo curto, sem alteração real e sem usuário identificado não gravam", async () => {
    expect((await salvar(deps(), { motivo: "ok" })).code).toBe("MOTIVO_OBRIGATORIO");
    expect((await salvar(deps(), { alteracoes: [{ caminho: "itens.0.NCM", valor: "21069090" }] })).code).toBe("SEM_ALTERACAO");
    const d = deps({ usuario: null });
    expect((await salvar(d)).code).toBe("SEM_USUARIO");
    expect(d.salvarManutencao).not.toHaveBeenCalled();
  });
  it("sem permissão: nada gravado", async () => {
    const d = deps({ configurar: false });
    expect((await salvar(d)).code).toBe("FORBIDDEN");
    expect(d.salvarManutencao).not.toHaveBeenCalled();
  });
  it("descrição só com emoji não é gravada", async () => {
    const d = deps();
    const r = await salvar(d, { alteracoes: [{ caminho: "itens.0.xProd", valor: "🍔" }] });
    expect(r.code).toBe("ALTERACAO_INVALIDA");
    expect(d.salvarManutencao).not.toHaveBeenCalled();
  });
  it("CSOSN: 102 para 500 regrupa; 101 é recusado", async () => {
    const d = deps();
    await salvar(d, { alteracoes: [{ caminho: "itens.0.icms.CSOSN", valor: "500" }] });
    expect(d.salvarManutencao.mock.calls[0][0].dados.itens[0].icms).toEqual({ grupo: "ICMSSN500", orig: "0", CSOSN: "500" });
    expect((await salvar(deps(), { alteracoes: [{ caminho: "itens.0.icms.CSOSN", valor: "101" }] })).code).toBe("ALTERACAO_INVALIDA");
  });
});

describe("manutenção fiscal: gravar e transmitir novamente", () => {
  it("grava, registra o log e retransmite a MESMA nota (mesma chave) até autorizar", async () => {
    const d = deps();
    const r = await salvar(d, { transmitir: true });
    expect(r.salva).toBe(true);
    expect(d.salvarManutencao).toHaveBeenCalledTimes(1);
    expect(d.enviar).toHaveBeenCalled();
    expect(r.emissao).toMatchObject({ ok: true, situacao: "autorizada", numero: 7, chave: DADOS.chave });
    expect(d.salvarManutencao.mock.invocationCallOrder[0]).toBeLessThan(d.enviar.mock.invocationCallOrder[0]);
  });
  it("se a SEFAZ rejeitar de novo, a manutenção continua gravada e o resultado da SEFAZ vem junto", async () => {
    const d = deps();
    d.enviar = vi.fn(async () => ({ ok: true, xml: retorno(373, "Rejeição: teste") }));
    const r = await salvar(d, { transmitir: true });
    expect(r.salva).toBe(true);
    expect(r.emissao).toMatchObject({ ok: false, situacao: "rejeitada", cStat: 373 });
  });
});

describe("resultado da SEFAZ que o banco recusa", () => {
  it("não diz 'autorizada' quando o registro falha: devolve FALHA_REGISTRO com o código do banco", async () => {
    const d = deps();
    d.registrar = vi.fn(async (p) => (p.status === "autorizado" ? { ok: false, code: "XML_OBRIGATORIO" } : { ok: true }));
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: false, code: "FALHA_REGISTRO", detalhe: "XML_OBRIGATORIO", podeConsultar: true });
  });
});
