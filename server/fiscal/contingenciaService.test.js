// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { processarEmissao } from "./emissaoService.js";
import { validarNFeXsd } from "./validarXsd.js";
import { dvChave } from "../../src/lib/fiscal/nfeDaVenda.js";

const PFX_B64 = readFileSync(new URL("./__fixtures__/certificado-teste.pfx", import.meta.url)).toString("base64");
const chave = (nNF, tpEmis) => { const b = "35261112345678000195650010000000" + String(nNF).padStart(2, "0") + tpEmis + "48213579"; return b + dvChave(b); };
const DADOS = {
  chave: chave(20, 1),
  ide: { cUF: "35", cNF: "48213579", natOp: "Venda de mercadoria", mod: 65, serie: 1, nNF: 20, dhEmi: "2026-11-17T15:30:00Z", tpAmb: 2, cMunFG: "3550308" },
  emit: { CNPJ: "12345678000195", xNome: "Burger Teste Ltda", IE: "123456789012", CRT: "1",
    ender: { xLgr: "Rua das Flores", nro: "100", xBairro: "Centro", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01001000" } },
  itens: [{ cProd: "10", xProd: "X-Burger", NCM: "21069090", CFOP: "5102", uCom: "UN", qCom: 1, vUnCom: 30, vProd: 30,
    icms: { grupo: "ICMSSN102", orig: "0", CSOSN: "102" }, pis: { grupo: "PISNT", CST: "04" }, cofins: { grupo: "COFINSNT", CST: "04" } }],
  pag: { detPag: [{ tPag: "01", vPag: 30 }] },
};
const AGORA = new Date("2026-11-17T15:31:00Z"); // terça
const JUST = "SEFAZ sem resposta no momento da venda";
const RET_AUT = (ch) => `<retEnviNFe versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>35</cUF><dhRecbto>2026-11-18T09:00:05-03:00</dhRecbto><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${ch}</chNFe><dhRecbto>2026-11-18T09:00:05-03:00</dhRecbto><nProt>135260000000021</nProt><digVal>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe>`;

function deps(extra = {}) {
  const origem = { id: "o1", loja_id: 7, modelo: 65, serie: 1, numero: 20, ambiente: "homologacao", status: "erro", tp_emis: 1, contingencia_documento_id: null, rascunho: { dados: DADOS } };
  const cont = { id: "c1", loja_id: 7, modelo: 65, serie: 1, numero: 21, ambiente: "homologacao", status: "contingencia", chave: null, xml_assinado: null, qr_code: null,
    origem_documento_id: "o1", prazo: "2026-11-19T02:59:59.999Z", tentativas: 0 };
  const salvos = [];
  return {
    agora: () => AGORA,
    podeEmitir: vi.fn().mockResolvedValue(true),
    ufDaLoja: vi.fn().mockResolvedValue("SP"),
    segredoCertificado: vi.fn().mockResolvedValue({ pfx: PFX_B64, senha: "teste-pedido-prime" }),
    segredoCsc: vi.fn().mockResolvedValue({ idCsc: "1", csc: "CSC-DE-TESTE-0123456789" }),
    documento: vi.fn().mockResolvedValue(origem),
    abrirContingencia: vi.fn().mockResolvedValue({ ok: true, documento_id: "c1", numero: 21, serie: 1 }),
    contingencia: vi.fn(async () => ({ ...cont, ...(salvos.at(-1) ? { chave: salvos.at(-1).chave, xml_assinado: salvos.at(-1).xml, qr_code: salvos.at(-1).qrCode } : {}) })),
    salvarContingencia: vi.fn(async (p) => { salvos.push(p); return { ok: true }; }),
    registrar: vi.fn().mockResolvedValue({ ok: true }),
    pendentes: vi.fn().mockResolvedValue({ ok: true, pendentes: [{ documento_id: "c1" }] }),
    enviar: vi.fn().mockResolvedValue({ ok: false, code: "CONEXAO", erro: "x" }),
    salvos,
    ...extra,
  };
}

describe("emitir — SEFAZ fora do ar", () => {
  it("NFC-e indisponível avisa que pode ir para a contingência", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 65, serie: 1, numero: 20, ambiente: "homologacao", status: "reservado", tp_emis: 1, rascunho: { dados: DADOS } }) });
    const r = await processarEmissao({ acao: "emitir", documentoId: "o1" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "indisponivel", podeContingencia: true });
  });
  it("nota que já foi para a contingência nunca é reenviada no modo normal", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 65, numero: 20, status: "erro", tp_emis: 1, contingencia_documento_id: "c1", rascunho: { dados: DADOS } }) });
    const r = await processarEmissao({ acao: "emitir", documentoId: "o1" }, d);
    expect(r).toMatchObject({ ok: false, code: "EM_CONTINGENCIA", contingenciaDocumentoId: "c1" });
    expect(d.enviar).not.toHaveBeenCalled();
    expect(d.registrar).not.toHaveBeenCalled();
  });
});

describe("contingencia — emitir off-line", () => {
  it("reserva número novo, assina com tpEmis 9 e QR off-line, guarda e devolve o prazo", async () => {
    const d = deps();
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    expect(r).toMatchObject({ ok: true, situacao: "contingencia", documentoId: "c1", numero: 21, serie: 1, prazo: "2026-11-19T02:59:59.999Z", numeroOrigem: 20 });
    expect(d.abrirContingencia).toHaveBeenCalledWith({ origemId: "o1", dhCont: AGORA.toISOString(), xJust: JUST, prazo: "2026-11-19T02:59:59.999Z" });
    const s = d.salvos[0];
    expect(s.chave).toBe(chave(21, 9));
    expect(r.chave).toBe(s.chave);
    expect(s.xml).toContain("<tpEmis>9</tpEmis>");
    expect(s.xml).toContain("<nNF>21</nNF>");
    expect(s.xml).toContain("<dhEmi>2026-11-17T12:31:00-03:00</dhEmi>");
    expect(s.qrCode).toMatch(/^https:\/\/www\.homologacao\.nfce\.fazenda\.sp\.gov\.br\/qrcode\?p=[0-9]{44}\|2\|2\|17\|30\.00\|[0-9a-f]{56}\|1\|[0-9A-F]{40}$/);
    expect(r.qrCode).toBe(s.qrCode);
    expect((await validarNFeXsd(s.xml)).erros).toEqual([]);
    expect(d.segredoCsc).toHaveBeenCalledWith(7, "homologacao");
    expect(d.enviar).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toMatch(/teste-pedido-prime|CSC-DE-TESTE/);
  });
  it("repetir o pedido devolve a mesma nota off-line sem assinar de novo", async () => {
    const d = deps();
    await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    expect(r).toMatchObject({ ok: true, situacao: "contingencia", numero: 21, reutilizada: true });
    expect(d.salvarContingencia).toHaveBeenCalledTimes(1);
  });
  it("sem CSC cadastrado → mensagem clara, nada é reservado", async () => {
    const d = deps({ segredoCsc: vi.fn().mockResolvedValue(null) });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d)).toMatchObject({ ok: false, code: "SEM_CSC" });
    expect(d.abrirContingencia).not.toHaveBeenCalled();
  });
  it("justificativa curta, NF-e, nota autorizada e sem permissão são recusadas", async () => {
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: "curta" }, deps())).toMatchObject({ code: "JUSTIFICATIVA_INVALIDA" });
    const nfe = deps({ documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 55, status: "erro", tp_emis: 1, rascunho: { dados: DADOS } }) });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, nfe)).toMatchObject({ code: "SO_NFCE" });
    const aut = deps({ documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 65, status: "autorizado", tp_emis: 1, rascunho: { dados: DADOS } }) });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, aut)).toMatchObject({ code: "STATUS_NAO_PERMITE" });
    const sem = deps({ podeEmitir: vi.fn().mockResolvedValue(false) });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, sem)).toMatchObject({ code: "FORBIDDEN" });
    expect(sem.abrirContingencia).not.toHaveBeenCalled();
  });
});

describe("transmitir_contingencia — envio quando a SEFAZ volta", () => {
  async function comNotaAssinada(extra) {
    const d = deps(extra);
    await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    d.registrar.mockClear();
    return d;
  }
  it("envia o MESMO XML assinado, grava 'enviado' antes e 'autorizado' depois", async () => {
    const d = await comNotaAssinada();
    d.enviar = vi.fn(async ({ dados }) => { d.enviado = dados; return { ok: true, xml: RET_AUT(d.salvos[0].chave) }; });
    const r = await processarEmissao({ acao: "transmitir_contingencia", documentoId: "c1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", protocolo: "135260000000021", numero: 21 });
    expect(d.enviado).toContain(d.salvos[0].xml);
    const [antes, depois] = d.registrar.mock.calls.map((c) => c[0]);
    expect(antes).toMatchObject({ documentoId: "c1", status: "enviado", chave: d.salvos[0].chave });
    expect(depois).toMatchObject({ status: "autorizado", protocolo: "135260000000021" });
  });
  it("SEFAZ ainda fora → continua pendente (status erro) com o prazo", async () => {
    const d = await comNotaAssinada();
    const r = await processarEmissao({ acao: "transmitir_contingencia", documentoId: "c1" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "indisponivel", prazo: "2026-11-19T02:59:59.999Z", vencida: false });
    expect(d.registrar.mock.calls.at(-1)[0]).toMatchObject({ status: "erro" });
  });
  it("nota ainda não assinada não é enviada", async () => {
    const d = deps();
    expect(await processarEmissao({ acao: "transmitir_contingencia", documentoId: "c1" }, d)).toMatchObject({ ok: false, code: "NAO_ASSINADA" });
    expect(d.enviar).not.toHaveBeenCalled();
  });
  it("emitir uma nota de contingência usa o envio da contingência", async () => {
    const d = await comNotaAssinada();
    d.documento = vi.fn().mockResolvedValue({ id: "c1", loja_id: 7, modelo: 65, status: "contingencia", tp_emis: 9 });
    d.enviar = vi.fn().mockResolvedValue({ ok: true, xml: RET_AUT(d.salvos[0].chave) });
    expect(await processarEmissao({ acao: "emitir", documentoId: "c1" }, d)).toMatchObject({ ok: true, situacao: "autorizada", numero: 21 });
  });
});

describe("pendentes_contingencia", () => {
  it("lista a fila da loja para o caixa enviar quando voltar", async () => {
    const d = deps();
    expect(await processarEmissao({ acao: "pendentes_contingencia", lojaId: 7 }, d)).toMatchObject({ ok: true, pendentes: [{ documento_id: "c1" }] });
    expect(d.pendentes).toHaveBeenCalledWith(7);
    const sem = deps({ podeEmitir: vi.fn().mockResolvedValue(false) });
    expect(await processarEmissao({ acao: "pendentes_contingencia", lojaId: 7 }, sem)).toMatchObject({ code: "FORBIDDEN" });
  });
});
