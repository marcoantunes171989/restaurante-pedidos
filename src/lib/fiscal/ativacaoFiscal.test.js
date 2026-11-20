import { describe, it, expect } from "vitest";
import { passosAtivacao, produtosSemFiscal } from "./ativacaoFiscal.js";

const AGORA = new Date("2026-11-16T12:00:00Z");
const EMIT = {
  razaoSocial: "Burger Ltda", inscricaoEstadual: "123456789012", crt: "1", cep: "01001000", logradouro: "Rua A", numero: "1",
  bairro: "Centro", municipio: "São Paulo", codigoMunicipioIbge: "3550308", uf: "SP", nfceSerie: 1,
  nfceHabilitada: true, nfeHabilitada: false, nfceAmbiente: "simulacao",
};
const REGRA = { id: 50, ncmCodigo: "21069090", cfopCodigo: "5102", csosn: "102", cstPis: "49", cstCofins: "49" };
const TUDO = {
  emitente: EMIT, documentoLoja: "11.222.333/0001-81", agora: AGORA,
  credenciais: [{ tipo: "certificado_a1", validadeFim: "2027-11-16T00:00:00Z", cadastrado: true }, { tipo: "csc", ambiente: "homologacao", cadastrado: true }],
  series: [{ modelo: 65, ambiente: "homologacao", ativa: true }],
  formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }],
  config: { mapaMeios: { dinheiro: "01" }, taxaServicoTratamento: "fora_da_nota" },
  produtos: [{ id: 10, name: "X-Burger", lojaFiscalRegraId: 50 }],
  regrasLoja: [REGRA],
  teste: { ok: true, modelo: 65 },
};
const passo = (r, id) => r.passos.find((p) => p.id === id);

describe("passosAtivacao", () => {
  it("tudo pronto: 7 de 8, falta só ligar; ligar libera", () => {
    const r = passosAtivacao(TUDO);
    expect(r.passos.map((p) => p.id)).toEqual(["empresa", "certificado", "csc", "series", "pagamentos", "produtos", "teste", "ligar"]);
    expect(r).toMatchObject({ prontos: true, ligada: false, feitos: 7, total: 8 });
    expect(passo(r, "ligar").detalhe).toMatch(/pode ligar/);
  });
  it("loja nova: aponta o que falta em cada passo", () => {
    const r = passosAtivacao({ emitente: { nfceHabilitada: true, nfceAmbiente: "simulacao" }, agora: AGORA, produtos: [{ id: 1, name: "Suco" }], formas: TUDO.formas });
    expect(r.prontos).toBe(false);
    expect(passo(r, "empresa").detalhe).toMatch(/Falta: .*CNPJ/);
    expect(passo(r, "certificado")).toMatchObject({ ok: false, detalhe: "Nenhum certificado cadastrado." });
    expect(passo(r, "csc").ok).toBe(false);
    expect(passo(r, "series").detalhe).toBe("falta a série da NFC-e");
    expect(passo(r, "pagamentos").detalhe).toMatch(/Dinheiro.*contador/);
    expect(passo(r, "produtos").detalhe).toBe("1 de 1 produto(s) sem regra fiscal completa.");
    expect(passo(r, "produtos").lista[0].nome).toBe("Suco");
    expect(passo(r, "teste").ok).toBe(false);
    expect(passo(r, "ligar").detalhe).toMatch(/Conclua/);
  });
  it("NF-e habilitada exige a série 55; sem NFC-e o CSC não se aplica", () => {
    const r = passosAtivacao({ ...TUDO, emitente: { ...EMIT, nfceHabilitada: false, nfeHabilitada: true } });
    expect(passo(r, "csc")).toMatchObject({ ok: true, detalhe: "Não se aplica (loja sem NFC-e)." });
    expect(passo(r, "series")).toMatchObject({ ok: false, detalhe: "falta a série da NF-e" });
  });
  it("certificado vencido bloqueia; vencendo avisa mas passa", () => {
    const vencido = passosAtivacao({ ...TUDO, credenciais: [{ tipo: "certificado_a1", validadeFim: "2026-11-01T00:00:00Z" }, TUDO.credenciais[1]] });
    expect(passo(vencido, "certificado").ok).toBe(false);
    const vencendo = passosAtivacao({ ...TUDO, credenciais: [{ tipo: "certificado_a1", validadeFim: "2026-12-01T00:00:00Z" }, TUDO.credenciais[1]] });
    expect(passo(vencendo, "certificado")).toMatchObject({ ok: true });
    expect(passo(vencendo, "certificado").detalhe).toMatch(/Vence em/);
  });
  it("teste falhou → mostra o motivo; já ligada → passo final ok", () => {
    expect(passo(passosAtivacao({ ...TUDO, teste: { ok: false, texto: "Cadastre o certificado A1 na aba Emissão antes." } }), "teste").detalhe).toMatch(/certificado/);
    const r = passosAtivacao({ ...TUDO, emitente: { ...EMIT, nfceAmbiente: "homologacao" } });
    expect(r.ligada).toBe(true);
    expect(passo(r, "ligar").detalhe).toBe("Ligada (homologação).");
  });
});

describe("produtosSemFiscal", () => {
  it("ignora inativos e lista as pendências", () => {
    const l = produtosSemFiscal([{ id: 1, name: "A", lojaFiscalRegraId: 50 }, { id: 2, name: "B" }, { id: 3, name: "C", active: false }], [REGRA]);
    expect(l.map((x) => x.id)).toEqual([2]);
    expect(l[0].pendencias.length).toBeGreaterThan(0);
  });
});

import { validarEmitenteFiscal } from "../emitenteFiscalService.js";
import { consultarLiberacaoProducao } from "./fiscalApi.js";

describe("produção (E10 parte 2)", () => {
  it("cadastro comum continua sem poder escolher produção; o assistente pode (o banco confere)", () => {
    const e = { ...EMIT, nfceAmbiente: "producao" };
    expect(validarEmitenteFiscal(e, "11222333000181").erros).toContain("Produção indisponível nesta fase.");
    expect(validarEmitenteFiscal(e, "11222333000181", { permitirProducao: true }).ok).toBe(true);
  });
  it("lê o que falta pela RPC da 186", async () => {
    const supabase = { rpc: async (nome, p) => ({ data: nome === "app_fiscal_producao_liberada" && p.p_loja_id === 7
      ? { ok: true, liberada: false, faltas: ["Série da NFC-e em produção."], em_producao: false } : null, error: null }) };
    expect(await consultarLiberacaoProducao(supabase, 7)).toEqual({ liberada: false, faltas: ["Série da NFC-e em produção."], emProducao: false });
  });
});

describe("atalhos: cada passo diz o que fazer e para onde ir", () => {
  const nova = () => passosAtivacao({ emitente: { nfceHabilitada: true, nfeHabilitada: true, nfceAmbiente: "simulacao" }, agora: AGORA, produtos: [{ id: 1, name: "Suco" }],
    formas: [{ id: 1, nome: "Dinheiro", tipo: "dinheiro" }, { id: 2, nome: "PIX", tipo: "pix" }], config: { mapaMeios: { dinheiro: "01" }, taxaServicoTratamento: "fora_da_nota" } });
  it("todo passo (menos ligar) tem rótulo de ação e texto de destino", () => {
    for (const p of nova().passos) {
      expect(p.acao, p.id).toBeTruthy();
      expect(p.destino, p.id).toMatch(/^Fiscal ›/);
    }
  });
  it("pagamentos: o cursor vai para a primeira forma sem código; sem pendência de forma, para a taxa de serviço", () => {
    expect(passo(nova(), "pagamentos").foco).toBe("emissao-tpag-2");
    const so_taxa = passosAtivacao({ ...TUDO, config: { mapaMeios: { dinheiro: "01" }, taxaServicoTratamento: null } });
    expect(passo(so_taxa, "pagamentos").foco).toBe("emissao-taxa");
  });
  it("séries: sugere o documento que falta (NF-e quando a NFC-e já tem série)", () => {
    const r = passosAtivacao({ ...TUDO, emitente: { ...EMIT, nfeHabilitada: true } });
    expect(passo(r, "series")).toMatchObject({ ok: false, foco: "emissao-serie-num", modeloSugerido: 55 });
  });
  it("teste de conexão: com certificado foca o botão de testar; sem certificado, o envio do arquivo", () => {
    expect(passo(passosAtivacao({ ...TUDO, teste: null }), "teste")).toMatchObject({ acao: "Testar conexão", foco: "emissao-testar-65" });
    const sem = passosAtivacao({ ...TUDO, credenciais: [], teste: null });
    expect(passo(sem, "teste")).toMatchObject({ acao: "Enviar certificado", foco: "emissao-pfx" });
  });
  it("produtos: o destino avisa que a lista já vem filtrada", () => {
    expect(passo(nova(), "produtos").destino).toMatch(/só os que faltam/);
  });
});
