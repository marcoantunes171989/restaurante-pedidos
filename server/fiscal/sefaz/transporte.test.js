// @vitest-environment node
// Conexão com a SEFAZ (SOAP 1.2 + certificado do cliente) testada contra uma
// SEFAZ SIMULADA local (HTTPS que exige certificado). Nada sai da máquina.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enviarSoap, envelopeSoap, extrairResultado, enderecoServico } from "./transporte.js";

const PFX = readFileSync(new URL("../__fixtures__/certificado-teste.pfx", import.meta.url));
const SENHA = "teste-pedido-prime";
const CERT_CLIENTE = readFileSync(new URL("../__fixtures__/teste.crt", import.meta.url));

let servidor, porta, ultimo, modo = "ok";

beforeAll(async () => {
  // Certificado do SERVIDOR simulado gerado na hora (descartável).
  const dir = mkdtempSync(join(tmpdir(), "sefaz-sim-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", join(dir, "s.key"), "-out", join(dir, "s.crt")], { stdio: "ignore" });
  servidor = createServer({
    key: readFileSync(join(dir, "s.key")), cert: readFileSync(join(dir, "s.crt")),
    requestCert: true, rejectUnauthorized: true, ca: [CERT_CLIENTE],
  }, (req, res) => {
    let corpo = "";
    req.on("data", (c) => { corpo += c; });
    req.on("end", () => {
      ultimo = { headers: req.headers, corpo, certCliente: req.socket.getPeerCertificate()?.subject?.CN };
      if (modo === "lento") return; // nunca responde → tempo esgotado
      if (modo === "erro500") { res.writeHead(500); return res.end("<html>erro</html>"); }
      res.writeHead(200, { "content-type": "application/soap+xml; charset=utf-8" });
      res.end('<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>' +
        '<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4"><retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo></retConsStatServ></nfeResultMsg>' +
        "</soap:Body></soap:Envelope>");
    });
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  porta = servidor.address().port;
  servidor.__ca = readFileSync(join(dir, "s.crt"));
});
afterAll(() => new Promise((r) => servidor.close(r)));

const opts = (extra = {}) => ({ url: `https://localhost:${porta}/ws/NFeStatusServico4.asmx`, servico: "NFeStatusServico4",
  dados: '<consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb></consStatServ>',
  pfx: PFX, senha: SENHA, ca: servidor.__ca, timeoutMs: 2000, ...extra });

describe("transporte SOAP com certificado", () => {
  it("envelope SOAP 1.2 com nfeDadosMsg no namespace do serviço", () => {
    const e = envelopeSoap("NFeAutorizacao4", "<x/>");
    expect(e).toContain('<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">');
    expect(e).toContain('<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><x/></nfeDadosMsg>');
  });
  it("conversa com a SEFAZ simulada apresentando o certificado A1 e devolve o retorno", async () => {
    modo = "ok";
    const r = await enviarSoap(opts());
    expect(r.ok).toBe(true);
    expect(r.xml).toMatch(/^<retConsStatServ /);
    expect(r.xml).toContain("<cStat>107</cStat>");
    expect(ultimo.certCliente).toMatch(/EMPRESA TESTE PEDIDO PRIME/);
    expect(ultimo.headers["content-type"]).toMatch(/application\/soap\+xml/);
  });
  it("tempo esgotado vira situação INCERTA (a nota pode ter chegado — consultar antes de reenviar)", async () => {
    modo = "lento";
    const r = await enviarSoap(opts({ timeoutMs: 300 }));
    expect(r).toMatchObject({ ok: false, code: "TEMPO_ESGOTADO", incerto: true });
  });
  it("erro HTTP do servidor", async () => {
    modo = "erro500";
    const r = await enviarSoap(opts());
    expect(r).toMatchObject({ ok: false, code: "HTTP_500" });
  });
  it("servidor não confiável é recusado (sem ignorar a segurança do HTTPS)", async () => {
    modo = "ok";
    const r = await enviarSoap(opts({ ca: undefined }));
    expect(r).toMatchObject({ ok: false, code: "CONEXAO" });
  });
  it("só https", async () => {
    const r = await enviarSoap(opts({ url: "http://localhost/x" }));
    expect(r).toMatchObject({ ok: false, code: "URL_INVALIDA" });
  });
});

describe("leitura e endereços", () => {
  it("extrai o conteúdo de nfeResultMsg", () => {
    expect(extrairResultado('<a:Envelope xmlns:a="x"><a:Body><nfeResultMsg xmlns="y"><ret>1</ret></nfeResultMsg></a:Body></a:Envelope>')).toBe("<ret>1</ret>");
    expect(extrairResultado("<html/>")).toBeNull();
  });
  it("tabela oficial: NFC-e e NF-e de SP separadas por ambiente", () => {
    expect(enderecoServico({ uf: "SP", modelo: 65, ambiente: "homologacao", servico: "Autorizacao" })).toBe("https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx");
    expect(enderecoServico({ uf: "SP", modelo: 55, ambiente: "producao", servico: "StatusServico" })).toBe("https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx");
    expect(() => enderecoServico({ uf: "RJ", modelo: 65, ambiente: "homologacao", servico: "Autorizacao" })).toThrow(/RJ/);
  });
});
