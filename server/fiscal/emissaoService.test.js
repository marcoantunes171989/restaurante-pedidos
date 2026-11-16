// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";
import { validarNFeXsd } from "./validarXsd.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
// Dados de TESTE (formato do leiaute); a chave aqui só precisa ter o formato válido.
const DADOS = {
  chave: "35261112345678000195650010000000071482135790",
  ide: { cUF: "35", cNF: "48213579", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 7, dhEmi: "2026-11-15T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Burger Teste Ltda", IE: "123456789012", CRT: "1",
    ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30,
    icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
};

const PROT = (ch) => `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${ch}</chNFe><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><nProt>135260000000007</nProt><digVal>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`;

function deps(extra = {}) {
  const doc = { id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 7, ambiente: "homologacao", status: "reservado", chave: null, rascunho: { dados: DADOS } };
  const enviados = [];
  return {
    podeConfigurar: vi.fn().mockResolvedValue(true),
    podeEmitir: vi.fn().mockResolvedValue(true),
    ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }),
    documento: vi.fn().mockResolvedValue(doc),
    registrar: vi.fn().mockResolvedValue({ ok: true }),
    enviar: vi.fn(async ({ servico, dados }) => {
      enviados.push({ servico, dados });
      if (servico === "NFeStatusServico4") return { ok: true, xml: '<retConsStatServ versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:00:00-03:00</dhRecbto></retConsStatServ>' };
      return { ok: true, xml: `<retEnviNFe versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto>${PROT(DADOS.chave)}</retEnviNFe>` };
    }),
    enviados,
    ...extra,
  };
}

describe("processarEmissao — teste de conexão", () => {
  it("status da SEFAZ com o certificado do cofre", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "status", lojaId: 7, modelo: 65, ambiente: "homologacao" }, d);
    expect(r).toMatchObject({ ok: true, operando: true, cStat: 107 });
    expect(d.segredoCertificado).toHaveBeenCalledWith(7);
  });
  it("sem certificado no cofre → mensagem clara", async () => {
    const r = await processarEmissao({ acao: "status", lojaId: 7, modelo: 65, ambiente: "homologacao" }, deps({ segredoCertificado: vi.fn().mockResolvedValue(null) }));
    expect(r).toMatchObject({ ok: false, code: "SEM_CERTIFICADO" });
  });
  it("sem permissão de configurar → nada acontece", async () => {
    const d = deps({ podeConfigurar: vi.fn().mockResolvedValue(false) });
    expect(await processarEmissao({ acao: "status", lojaId: 7, modelo: 65, ambiente: "homologacao" }, d)).toMatchObject({ code: "FORBIDDEN" });
    expect(d.segredoCertificado).not.toHaveBeenCalled();
  });
});

describe("processarEmissao — emitir", () => {
  it("assina, inclui QR Code oficial de SP, envia, grava 'enviado' ANTES e 'autorizado' DEPOIS", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", protocolo: "135260000000007", numero: 7 });
    const [antes, depois] = d.registrar.mock.calls.map((c) => c[0]);
    expect(antes).toMatchObject({ documentoId: "d1", status: "enviado", chave: DADOS.chave });
    expect(depois).toMatchObject({ status: "autorizado", protocolo: "135260000000007", cStat: 100 });
    expect(depois.xml).toMatch(/^<nfeProc /);
    const envio = d.enviados.find((e) => e.servico === "NFeAutorizacao4").dados;
    expect(envio).toContain("<qrCode>https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=" + DADOS.chave + "|3|2</qrCode>");
    expect(envio).toContain("<urlChave>https://www.homologacao.nfce.fazenda.sp.gov.br/consulta</urlChave>");
    const nfe = envio.slice(envio.indexOf("<NFe "), envio.indexOf("</NFe>") + 6);
    expect((await validarNFeXsd(nfe)).erros).toEqual([]);
    expect(JSON.stringify(r)).not.toContain("teste-pedido-prime");
  });
  it("rejeição grava o motivo e devolve ao caixa", async () => {
    const d = deps({ enviar: vi.fn().mockResolvedValue({ ok: true, xml: `<retEnviNFe versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${DADOS.chave}</chNFe><dhRecbto>2026-11-15T12:30:05-03:00</dhRecbto><cStat>778</cStat><xMotivo>Rejeicao: NCM inexistente</xMotivo></infProt></protNFe></retEnviNFe>` }) });
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "rejeitada", cStat: 778, xMotivo: "Rejeicao: NCM inexistente" });
    expect(d.registrar.mock.calls.at(-1)[0]).toMatchObject({ status: "rejeitado", cStat: 778 });
  });
  it("SEFAZ fora do ar → grava 'erro' (vai para contingência na E7)", async () => {
    const d = deps({ enviar: vi.fn().mockResolvedValue({ ok: false, code: "CONEXAO", erro: "x" }) });
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "indisponivel" });
    expect(d.registrar.mock.calls.at(-1)[0]).toMatchObject({ status: "erro" });
  });
  it("nota já autorizada não é enviada de novo", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, status: "autorizado", numero: 7, protocolo: "135260000000007", rascunho: { dados: DADOS } }) });
    const r = await processarEmissao({ acao: "emitir", documentoId: "d1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", jaAutorizada: true });
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it("caixa de outra loja / sem permissão → nada é enviado", async () => {
    const d = deps({ podeEmitir: vi.fn().mockResolvedValue(false) });
    expect(await processarEmissao({ acao: "emitir", documentoId: "d1" }, d)).toMatchObject({ code: "FORBIDDEN" });
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it("documento sem dados da nota → erro claro", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, status: "reservado", rascunho: {} }) });
    expect(await processarEmissao({ acao: "emitir", documentoId: "d1" }, d)).toMatchObject({ code: "SEM_DADOS_NOTA" });
  });
  it("número da nota no XML precisa ser o reservado no banco", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue({ id: "d1", loja_id: 7, modelo: 65, serie: 1, numero: 8, ambiente: "homologacao", status: "reservado", rascunho: { dados: DADOS } }) });
    expect(await processarEmissao({ acao: "emitir", documentoId: "d1" }, d)).toMatchObject({ code: "DADOS_DIVERGENTES" });
  });
});
