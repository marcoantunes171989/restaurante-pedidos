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
    expect(d.abrirContingencia).toHaveBeenCalledWith({ origemId: "o1", dhCont: AGORA.toISOString(), xJust: JUST, prazo: "2026-11-19T02:59:59.999Z", tpEmis: 9 });
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
  it("justificativa curta, modelo inválido, nota autorizada e sem permissão são recusadas", async () => {
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: "curta" }, deps())).toMatchObject({ code: "JUSTIFICATIVA_INVALIDA" });
    const outro = deps({ documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 57, status: "erro", tp_emis: 1, rascunho: { dados: DADOS } }) });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, outro)).toMatchObject({ code: "MODELO_INVALIDO" });
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

// ── Consulta da nota que ficou sem resposta (Anexo IV: cancelar se autorizada) ──
import { montarAssinadaNormal } from "./nfeAssinada.js";
import { lerCertificadoPfx } from "./certificado.js";
import { Buffer } from "node:buffer";

const RET_CONS = (ch, cStat, digVal) => `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>${cStat}</cStat><xMotivo>m${cStat}</xMotivo><cUF>35</cUF><dhRecbto>2026-11-18T09:00:00-03:00</dhRecbto><chNFe>${ch}</chNFe>` +
  (cStat === 100 ? `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>SIM</verAplic><chNFe>${ch}</chNFe><dhRecbto>2026-11-17T12:30:40-03:00</dhRecbto><nProt>135260000000020</nProt><digVal>${digVal}</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>` : "") + `</retConsSitNFe>`;
const cred = lerCertificadoPfx(Buffer.from(PFX_B64, "base64"), "teste-pedido-prime");
const DIGEST_ORIGEM = (/<DigestValue>([^<]+)</.exec(montarAssinadaNormal({ dados: DADOS, modelo: 65, ambiente: "homologacao", uf: "SP", cred })) || [])[1];
const ORIGEM_ENVIADA = { id: "o1", loja_id: 7, modelo: 65, serie: 1, numero: 20, ambiente: "homologacao", status: "erro", tp_emis: 1, chave: DADOS.chave, contingencia_documento_id: "c1", rascunho: { dados: DADOS } };

describe("consultar — nota que ficou sem resposta", () => {
  it("SEFAZ autorizou: recompõe o XML, confere o digVal, guarda e avisa que precisa cancelar", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue(ORIGEM_ENVIADA), enviar: vi.fn().mockResolvedValue({ ok: true, xml: RET_CONS(DADOS.chave, 100, DIGEST_ORIGEM) }) });
    const r = await processarEmissao({ acao: "consultar", documentoId: "o1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", protocolo: "135260000000020", deveCancelar: true, numero: 20 });
    const reg = d.registrar.mock.calls.at(-1)[0];
    expect(reg).toMatchObject({ documentoId: "o1", status: "autorizado", protocolo: "135260000000020" });
    expect(reg.xml).toMatch(/^<nfeProc /);
    expect(reg.xml).toContain(`<DigestValue>${DIGEST_ORIGEM}</DigestValue>`);
  });
  it("digVal diferente do XML recomposto → não guarda nada e pede suporte", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue(ORIGEM_ENVIADA), enviar: vi.fn().mockResolvedValue({ ok: true, xml: RET_CONS(DADOS.chave, 100, "BBBBBBBBBBBBBBBBBBBBBBBBBBB=") }) });
    const r = await processarEmissao({ acao: "consultar", documentoId: "o1" }, d);
    expect(r).toMatchObject({ ok: false, situacao: "autorizada", code: "XML_NAO_CONFERE" });
    expect(d.registrar).not.toHaveBeenCalled();
  });
  it("SEFAZ não recebeu: registra que o número não foi usado (a venda saiu em contingência)", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue(ORIGEM_ENVIADA), enviar: vi.fn().mockResolvedValue({ ok: true, xml: RET_CONS(DADOS.chave, 217) }) });
    const r = await processarEmissao({ acao: "consultar", documentoId: "o1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "nao_encontrada", numeroNaoUsado: true });
    expect(d.registrar.mock.calls.at(-1)[0]).toMatchObject({ documentoId: "o1", status: "erro", cStat: 217 });
    expect(d.registrar.mock.calls.at(-1)[0].xMotivo).toMatch(/não chegou à SEFAZ/i);
  });
  it("SEFAZ ainda fora → só informa, não grava", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue(ORIGEM_ENVIADA) });
    expect(await processarEmissao({ acao: "consultar", documentoId: "o1" }, d)).toMatchObject({ ok: false, situacao: "indisponivel" });
    expect(d.registrar).not.toHaveBeenCalled();
  });
  it("nota off-line autorizada na consulta usa o XML guardado", async () => {
    const d = deps();
    await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    const xml = d.salvos[0].xml;
    const dig = (/<DigestValue>([^<]+)</.exec(xml) || [])[1];
    d.registrar.mockClear();
    d.documento = vi.fn().mockResolvedValue({ id: "c1", loja_id: 7, modelo: 65, serie: 1, numero: 21, ambiente: "homologacao", status: "enviado", tp_emis: 9, chave: d.salvos[0].chave });
    d.enviar = vi.fn().mockResolvedValue({ ok: true, xml: RET_CONS(d.salvos[0].chave, 100, dig) });
    const r = await processarEmissao({ acao: "consultar", documentoId: "c1" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", deveCancelar: false });
    expect(d.registrar.mock.calls.at(-1)[0].xml).toContain(xml.replace(/^<\?xml[^>]*>/, ""));
  });
  it("nota nunca enviada ou sem permissão → recusa", async () => {
    const nunca = deps({ documento: vi.fn().mockResolvedValue({ ...ORIGEM_ENVIADA, chave: null, status: "reservado" }) });
    expect(await processarEmissao({ acao: "consultar", documentoId: "o1" }, nunca)).toMatchObject({ ok: false, code: "SEM_CHAVE" });
    const sem = deps({ documento: vi.fn().mockResolvedValue(ORIGEM_ENVIADA), podeEmitir: vi.fn().mockResolvedValue(false) });
    expect(await processarEmissao({ acao: "consultar", documentoId: "o1" }, sem)).toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── NF-e (55) pela SVC-AN (MOC 7.0 Anexo III §2.1.3) ──
const chave55 = (nNF, tpEmis) => { const b = "35261112345678000195550010000000" + String(nNF).padStart(2, "0") + tpEmis + "48213579"; return b + dvChave(b); };
const DADOS55 = { ...DADOS, chave: chave55(20, 1), ide: { ...DADOS.ide, mod: 55 }, dest: { CPF: "12345678909", xNome: "Cliente Teste", indIEDest: "9",
  ender: { xLgr: "Av Paulista", nro: "1000", xBairro: "Bela Vista", cMun: "3550308", xMun: "São Paulo", UF: "SP", CEP: "01310100" } } };
const STATUS_SVC = (cStat) => `<retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><verAplic>SVC</verAplic><cStat>${cStat}</cStat><xMotivo>m${cStat}</xMotivo><cUF>35</cUF><dhRecbto>2026-11-17T12:31:00-03:00</dhRecbto></retConsStatServ>`;
function depsSvc({ status = 107, autoriza = true, ...extra } = {}) {
  const d = deps({
    documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 55, serie: 1, numero: 20, ambiente: "homologacao", status: "erro", tp_emis: 1, contingencia_documento_id: null, rascunho: { dados: DADOS55 } }),
    ...extra,
  });
  const base = d.contingencia;
  d.contingencia = vi.fn(async (id) => ({ ...(await base(id)), modelo: 55, prazo: null }));
  d.urls = [];
  d.enviar = vi.fn(async ({ url, servico, dados }) => {
    d.urls.push(url);
    if (servico === "NFeStatusServico4") return { ok: true, xml: STATUS_SVC(status) };
    if (servico === "NFeAutorizacao4") { d.enviado = dados; return autoriza ? { ok: true, xml: RET_AUT(d.salvos.at(-1).chave) } : { ok: false, code: "CONEXAO", erro: "x" }; }
    return { ok: false, code: "CONEXAO", erro: "x" };
  });
  return d;
}

describe("contingencia — NF-e pela SVC", () => {
  it("confere a SVC (107), reserva número novo, assina com tpEmis 6 e envia à SVC-AN na hora", async () => {
    const d = depsSvc();
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    expect(r).toMatchObject({ ok: true, situacao: "autorizada", forma: "svc", autorizador: "SVC-AN", numero: 21, numeroOrigem: 20, protocolo: "135260000000021", prazo: null, vencida: false });
    expect(d.abrirContingencia).toHaveBeenCalledWith({ origemId: "o1", dhCont: AGORA.toISOString(), xJust: JUST, prazo: null, tpEmis: 6 });
    const s = d.salvos[0];
    expect(s.chave).toBe(chave55(21, 6));
    expect(s.qrCode).toBeNull();
    expect(s.xml).toContain("<tpEmis>6</tpEmis>");
    expect(s.xml).toContain("<dhCont>");
    expect(s.xml).not.toContain("infNFeSupl");
    expect((await validarNFeXsd(s.xml)).erros).toEqual([]);
    expect(d.urls).toEqual([
      "https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx",
      "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
    ]);
    expect(d.enviado).toContain(s.xml.replace(/^<\?xml[^>]*>/, ""));
    expect(d.registrar.mock.calls.at(-1)[0]).toMatchObject({ documentoId: "c1", status: "autorizado", payload: { autorizador: "SVC-AN" } });
    expect(d.segredoCsc).not.toHaveBeenCalled();
  });
  it("SVC não ativada pela SEFAZ (114) → não gasta número", async () => {
    const d = depsSvc({ status: 114 });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d)).toMatchObject({ ok: false, code: "SVC_INATIVA", cStat: 114 });
    expect(d.abrirContingencia).not.toHaveBeenCalled();
  });
  it("SVC sem resposta no envio → fica guardada para reenviar à SVC, sem prazo", async () => {
    const d = depsSvc({ autoriza: false });
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    expect(r).toMatchObject({ ok: false, situacao: "indisponivel", forma: "svc", prazo: null, vencida: false });
    d.enviar = vi.fn(async ({ url }) => { d.urls.push(url); return { ok: true, xml: RET_AUT(d.salvos[0].chave) }; });
    const r2 = await processarEmissao({ acao: "transmitir_contingencia", documentoId: "c1" }, d);
    expect(r2).toMatchObject({ ok: true, situacao: "autorizada" });
    expect(d.urls.at(-1)).toBe("https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx");
    expect(d.salvarContingencia).toHaveBeenCalledTimes(1);
  });
  it("consulta de nota da SVC vai à própria SVC", async () => {
    const d = depsSvc();
    await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, d);
    const dig = (/<DigestValue>([^<]+)</.exec(d.salvos[0].xml) || [])[1];
    d.documento = vi.fn().mockResolvedValue({ id: "c1", loja_id: 7, modelo: 55, serie: 1, numero: 21, ambiente: "homologacao", status: "enviado", tp_emis: 6, chave: d.salvos[0].chave });
    d.enviar = vi.fn(async ({ url }) => { d.urls.push(url); return { ok: true, xml: RET_CONS(d.salvos[0].chave, 100, dig) }; });
    expect(await processarEmissao({ acao: "consultar", documentoId: "c1" }, d)).toMatchObject({ ok: true, situacao: "autorizada" });
    expect(d.urls.at(-1)).toBe("https://hom.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx");
  });
  it("NF-e indisponível no envio normal oferece a SVC", async () => {
    const d = deps({ documento: vi.fn().mockResolvedValue({ id: "o1", loja_id: 7, modelo: 55, serie: 1, numero: 20, ambiente: "homologacao", status: "reservado", tp_emis: 1, rascunho: { dados: DADOS55 } }) });
    expect(await processarEmissao({ acao: "emitir", documentoId: "o1" }, d)).toMatchObject({ situacao: "indisponivel", podeContingencia: true, formaContingencia: "svc" });
  });
});

// ── NF-e (55) pelo EPEC (NT 2014.001 v1.41) ──
import { validarMensagemXsd } from "./validarXsd.js";
const RET_EPEC = (ch, cStat = 136) => `<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb><verAplic>AN</verAplic><cOrgao>91</cOrgao><cStat>128</cStat><xMotivo>Lote de Evento Processado</xMotivo>` +
  `<retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><verAplic>AN</verAplic><cOrgao>91</cOrgao><cStat>${cStat}</cStat><xMotivo>m${cStat}</xMotivo><chNFe>${ch}</chNFe><tpEvento>110140</tpEvento><nSeqEvento>1</nSeqEvento><dhRegEvento>2026-11-17T12:31:05-03:00</dhRegEvento>${cStat === 136 ? "<nProt>891260000000123</nProt>" : ""}</infEvento></retEvento></retEnvEvento>`;
function depsEpec({ cStat = 136, rede = true } = {}) {
  const d = depsSvc();
  const base = d.contingencia;
  d.epec = null;
  d.contingencia = vi.fn(async (id) => ({ ...(await base(id)), prazo: "2026-11-24T15:31:00.000Z", epec_protocolo: d.epec }));
  d.registrarEpec = vi.fn(async (p) => { d.epec = p.protocolo; return { ok: true }; });
  d.enviar = vi.fn(async ({ url, servico, dados }) => {
    d.urls.push(url);
    if (servico === "NFeRecepcaoEvento4") { d.evento = dados; return rede ? { ok: true, xml: RET_EPEC(d.salvos.at(-1).chave, cStat) } : { ok: false, code: "CONEXAO", erro: "x" }; }
    return { ok: false, code: "CONEXAO", erro: "x" };
  });
  return d;
}

describe("contingencia — NF-e pelo EPEC", () => {
  it("assina a NF-e com tpEmis 4 e número novo, registra o EPEC no AN e guarda o protocolo", async () => {
    const d = depsEpec();
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "epec", forma: "epec", protocoloEpec: "891260000000123", numero: 21, numeroOrigem: 20 });
    expect(d.abrirContingencia).toHaveBeenCalledWith({ origemId: "o1", dhCont: AGORA.toISOString(), xJust: JUST, prazo: "2026-11-24T15:31:00.000Z", tpEmis: 4 });
    const s = d.salvos[0];
    expect(s.chave).toBe(chave55(21, 4));
    expect(s.xml).toContain("<tpEmis>4</tpEmis>");
    expect((await validarNFeXsd(s.xml)).erros).toEqual([]);
    expect(d.urls).toEqual(["https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx"]);
    expect((await validarMensagemXsd(d.evento, "envEvento")).erros).toEqual([]);
    expect(d.evento).toContain("<cOrgao>91</cOrgao>");
    expect(d.evento).toContain(`<chNFe>${s.chave}</chNFe>`);
    const det = /<detEvento[\s\S]*<\/detEvento>/.exec(d.evento)[0];
    expect((await validarMensagemXsd(det.replace("<detEvento ", '<detEvento xmlns="http://www.portalfiscal.inf.br/nfe" '), "det110140")).erros).toEqual([]);
    expect(det).toContain("<dhEmi>2026-11-17T12:31:00-03:00</dhEmi>");
    expect(det).toContain("<dest><UF>SP</UF><CPF>12345678909</CPF><vNF>30.00</vNF>");
    expect(d.registrarEpec.mock.calls[0][0]).toMatchObject({ documentoId: "c1", protocolo: "891260000000123", cStat: 136 });
    expect(d.registrarEpec.mock.calls[0][0].xml).toMatch(/^<procEventoNFe /);
  });
  it("repetir depois do EPEC registrado devolve o mesmo, sem reenviar", async () => {
    const d = depsEpec();
    await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d);
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d);
    expect(r).toMatchObject({ ok: true, situacao: "epec", reutilizada: true, protocoloEpec: "891260000000123" });
    expect(d.enviar).toHaveBeenCalledTimes(1);
  });
  it("AN fora do ar → não imprimir; tentar de novo reenvia só o aviso (mesma nota)", async () => {
    const d = depsEpec({ rede: false });
    const r = await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d);
    expect(r).toMatchObject({ ok: false, code: "EPEC_NAO_REGISTRADO", situacao: "indisponivel" });
    expect(d.registrarEpec).not.toHaveBeenCalled();
    d.enviar = vi.fn(async ({ dados }) => ({ ok: true, xml: RET_EPEC(d.salvos[0].chave), dados }));
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d)).toMatchObject({ ok: true, situacao: "epec" });
    expect(d.salvarContingencia).toHaveBeenCalledTimes(1);
  });
  it("AN recusa (ex.: 142 bloqueado) → mostra o motivo", async () => {
    const d = depsEpec({ cStat: 142 });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d)).toMatchObject({ ok: false, code: "EPEC_NAO_REGISTRADO", situacao: "rejeitado", cStat: 142 });
  });
  it("EPEC só para NF-e; SVC inativa sugere o EPEC", async () => {
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, deps())).toMatchObject({ ok: false, code: "SO_NFE" });
    expect(await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST }, depsSvc({ status: 114 }))).toMatchObject({ code: "SVC_INATIVA", podeEpec: true });
  });
  it("NF-e do EPEC vai depois à SEFAZ de SP com a mesma chave", async () => {
    const d = depsEpec();
    await processarEmissao({ acao: "contingencia", documentoId: "o1", xJust: JUST, forma: "epec" }, d);
    d.enviar = vi.fn(async ({ url, dados }) => { d.urls.push(url); d.enviado = dados; return { ok: true, xml: RET_AUT(d.salvos[0].chave) }; });
    expect(await processarEmissao({ acao: "transmitir_contingencia", documentoId: "c1" }, d)).toMatchObject({ ok: true, situacao: "autorizada", chave: chave55(21, 4) });
    expect(d.urls.at(-1)).toBe("https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx");
  });
});
