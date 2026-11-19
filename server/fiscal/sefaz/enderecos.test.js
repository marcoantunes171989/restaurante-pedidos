// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { enderecoServico } from "./transporte.js";

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
  it("NFC-e (mod. 65) só existe para SP por enquanto: as demais UFs falham de forma explícita", () => {
    expect(() => enderecoServico({ uf: "SP", modelo: 65, ambiente: "homologacao", servico: "Autorizacao" })).not.toThrow();
    expect(() => enderecoServico({ uf: "MG", modelo: 65, ambiente: "homologacao", servico: "Autorizacao" })).toThrow(/Sem endereço oficial/);
  });
  it("mapa de SVC cobre todas as 27 UFs", () => {
    const cobertas = [...J.svc["SVC-AN"], ...J.svc["SVC-RS"]].sort();
    expect(cobertas).toEqual([...UFS].sort());
  });
});
