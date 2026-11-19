// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { enderecoServico } from "./transporte.js";
import { urlQrCodeV3, grupoInfNFeSupl } from "../qrcodeNfce.js";

const J = JSON.parse(readFileSync(new URL("./enderecos.json", import.meta.url), "utf8"));
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const SERVICOS = ["StatusServico", "Autorizacao", "RetAutorizacao", "ConsultaProtocolo", "RecepcaoEvento", "Inutilizacao"];
const SVRS = ["AC", "AL", "AP", "CE", "DF", "ES", "PA", "PB", "PI", "RJ", "RN", "RO", "RR", "SC", "SE", "TO"];

describe("endereços oficiais da NF-e (mod. 55) das 27 UFs", () => {
  it("todas as UFs têm os 6 serviços em homologação e produção, só https", () => {
    for (const uf of UFS) for (const amb of ["homologacao", "producao"]) for (const s of SERVICOS) {
      const url = enderecoServico({ uf, modelo: 55, ambiente: amb, servico: s });
      expect(url, `${uf} ${amb} ${s}`).toMatch(/^https:\/\/[^\s?#]+$/);
    }
  });
  it("homologação e produção usam endereços diferentes em cada UF", () => {
    for (const uf of UFS) {
      expect(J[uf]["55"].homologacao.Autorizacao, uf).not.toBe(J[uf]["55"].producao.Autorizacao);
    }
  });
  it("UFs da SVRS compartilham os mesmos endereços de autorização", () => {
    const ref = J.AC["55"].producao.Autorizacao;
    for (const uf of SVRS) expect(J[uf]["55"].producao.Autorizacao, uf).toBe(ref);
    expect(ref).toContain("svrs.rs.gov.br");
  });
  it("MA usa a SVAN e as 10 UFs com ambiente próprio apontam para o próprio domínio", () => {
    expect(J.MA["55"].producao.Autorizacao).toContain("sefazvirtual.fazenda.gov.br");
    expect(J.SP["55"].producao.Autorizacao).toContain("fazenda.sp.gov.br");
    expect(J.MG["55"].producao.Autorizacao).toContain("fazenda.mg.gov.br");
    expect(J.AM["55"].producao.Autorizacao).toContain("sefaz.am.gov.br");
  });
  it("não sobrou '?wsdl' em nenhum endereço", () => {
    expect(JSON.stringify(J)).not.toMatch(/\?wsdl/i);
  });
  it("mapa de SVC cobre todas as 27 UFs", () => {
    const cobertas = [...J.svc["SVC-AN"], ...J.svc["SVC-RS"]].sort();
    expect(cobertas).toEqual([...UFS].sort());
  });

  const NFCE_OK = ["AC", "AL", "AP", "BA", "DF", "MT", "MS", "PA", "PR", "PE", "PI", "RS", "RO", "SC", "SE", "TO", "SP"];
  const NFCE_FORA = ["AM", "CE", "ES", "GO", "MA", "MG", "PB", "RJ", "RN", "RR"];
  const NFCE_SERV = [...SERVICOS, "QRCode", "ConsultaPublica"];

  it("NFC-e (mod. 65): as 17 UFs aplicadas têm os 6 serviços, QR Code e consulta, nos dois ambientes", () => {
    for (const uf of NFCE_OK) for (const amb of ["homologacao", "producao"]) for (const s of NFCE_SERV) {
      expect(enderecoServico({ uf, modelo: 65, ambiente: amb, servico: s }), uf + " " + amb + " " + s).toBeTruthy();
    }
  });
  it("NFC-e: web services só em https; QR Code é a base (http/https, sem '?'); consulta por chave preenchida", () => {
    for (const uf of NFCE_OK) for (const amb of ["homologacao", "producao"]) {
      for (const s of SERVICOS) expect(enderecoServico({ uf, modelo: 65, ambiente: amb, servico: s }), uf + " " + s).toMatch(/^https:\/\/[^\s?#]+$/);
      expect(enderecoServico({ uf, modelo: 65, ambiente: amb, servico: "QRCode" }), uf + " QR").toMatch(/^https?:\/\/[^\s?#]+$/);
      expect(enderecoServico({ uf, modelo: 65, ambiente: amb, servico: "ConsultaPublica" }).length, uf + " consulta").toBeGreaterThan(10);
    }
  });
  it("NFC-e: o gerador do QR Code v3 aceita o endereço de cada UF aplicada", () => {
    for (const uf of NFCE_OK) for (const [amb, tpAmb] of [["homologacao", 2], ["producao", 1]]) {
      const chave = "35261112345678000195650010000000011234567890";
      const qr = urlQrCodeV3({ urlBase: enderecoServico({ uf, modelo: 65, ambiente: amb, servico: "QRCode" }), chave, tpAmb });
      expect(qr, uf).toContain("?p=" + chave + "|3|" + tpAmb);
      expect(grupoInfNFeSupl({ qrCode: qr, urlChave: enderecoServico({ uf, modelo: 65, ambiente: amb, servico: "ConsultaPublica" }) }), uf).toContain("<urlChave>");
    }
  });
  it("NFC-e: UFs com autorizador próprio usam o próprio domínio e as da SVRS compartilham os serviços", () => {
    expect(J.MT["65"].producao.Autorizacao).toContain("sefaz.mt.gov.br");
    expect(J.MS["65"].producao.Autorizacao).toContain("sefaz.ms.gov.br");
    expect(J.PR["65"].producao.Autorizacao).toContain("pr.gov.br");
    expect(J.RS["65"].producao.Autorizacao).toContain("rs.gov.br");
    const ref = J.AC["65"].producao.Autorizacao;
    expect(ref).toContain("nfce.svrs.rs.gov.br");
    for (const uf of ["AL", "AP", "BA", "DF", "PA", "PE", "PI", "RO", "SC", "SE", "TO"]) expect(J[uf]["65"].producao.Autorizacao, uf).toBe(ref);
  });
  it("NFC-e: UFs com dado incerto nas fontes ficam FORA e falham de forma explícita", () => {
    for (const uf of NFCE_FORA) {
      expect(() => enderecoServico({ uf, modelo: 65, ambiente: "homologacao", servico: "Autorizacao" }), uf).toThrow(/Sem endereço oficial/);
    }
  });
});
