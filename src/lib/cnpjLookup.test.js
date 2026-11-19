import { describe, it, expect, vi } from "vitest";
import { mapearDadosCnpj, aplicarDadosCnpj, consultarCnpj, tituloCaixa, URL_CNPJ } from "./cnpjLookup.js";

// Formato real da BrasilAPI (campos conferidos com um CNPJ público). Restaurante fictício no Simples.
const RESTAURANTE = {
  cnpj: "11222333000181", razao_social: "BURGER STATION ALIMENTOS LTDA", nome_fantasia: "BURGER STATION",
  cnae_fiscal: 5611203, cnae_fiscal_descricao: "Lanchonetes, casas de chá, de sucos e similares",
  descricao_tipo_de_logradouro: "RUA", logradouro: "DAS FLORES", numero: "100", complemento: "LOJA 2", bairro: "CENTRO",
  municipio: "SAO PAULO", uf: "SP", cep: "01001000", codigo_municipio_ibge: 3550308, codigo_municipio: 7107,
  ddd_telefone_1: "1133334444", email: "CONTATO@BURGER.COM.BR", opcao_pelo_simples: true, opcao_pelo_mei: false,
  regime_tributario: [{ ano: 2023, forma_de_tributacao: "SIMPLES NACIONAL" }], situacao_cadastral: 2, descricao_situacao_cadastral: "ATIVA",
};
const BANCO = { // dados públicos reais (forma): sem e-mail, número "SN", via que não é rua comum, lucro real
  razao_social: "BANCO DO BRASIL SA", nome_fantasia: "DIRECAO GERAL", cnae_fiscal: 6422100, cnae_fiscal_descricao: "Bancos múltiplos, com carteira comercial",
  descricao_tipo_de_logradouro: "QUADRA", logradouro: "SAUN QUADRA 5 BLOCO B TORRE I, II, III", numero: "SN", complemento: "ANDAR T I", bairro: "ASA NORTE",
  municipio: "BRASILIA", uf: "DF", cep: "70040912", codigo_municipio_ibge: 5300108, ddd_telefone_1: "6134939002", email: null,
  opcao_pelo_simples: false, opcao_pelo_mei: false, regime_tributario: [{ ano: 2023, forma_de_tributacao: "LUCRO REAL" }, { ano: 2024, forma_de_tributacao: "LUCRO REAL" }],
  situacao_cadastral: 2, descricao_situacao_cadastral: "ATIVA",
};

describe("mapearDadosCnpj", () => {
  it("restaurante no Simples: preenche endereço, contato, CNAE e CRT 1; segmento fica em branco (lanchonete é ambíguo)", () => {
    const m = mapearDadosCnpj(RESTAURANTE);
    expect(m.campos).toMatchObject({
      razaoSocial: "BURGER STATION ALIMENTOS LTDA", nomeFantasia: "BURGER STATION", cnaePrincipal: "5611203", crt: "1",
      cep: "01001000", uf: "SP", logradouro: "RUA DAS FLORES", numero: "100", complemento: "LOJA 2", bairro: "CENTRO",
      municipio: "SAO PAULO", codigoMunicipioIbge: "3550308", telefoneFiscal: "1133334444", emailFiscal: "contato@burger.com.br", segmento: "",
    });
    expect(m.nome).toBe("Burger Station");
    expect(m.situacao).toEqual({ descricao: "ATIVA", ativa: true });
  });
  it("não duplica 'RUA' e não junta tipo que não é via comum (QUADRA)", () => {
    expect(mapearDadosCnpj({ ...RESTAURANTE, logradouro: "RUA DAS FLORES" }).campos.logradouro).toBe("RUA DAS FLORES");
    expect(mapearDadosCnpj(BANCO).campos.logradouro).toBe("SAUN QUADRA 5 BLOCO B TORRE I, II, III");
  });
  it("'SN' vira S/N; e-mail nulo, telefone curto e CEP/IBGE inválidos ficam em branco", () => {
    const m = mapearDadosCnpj({ ...BANCO, ddd_telefone_1: "123", cep: "7004", codigo_municipio_ibge: 5300 });
    expect(m.campos.numero).toBe("S/N");
    expect(m.campos.emailFiscal).toBe("");
    expect(m.campos.telefoneFiscal).toBe("");
    expect(m.campos.cep).toBe("");
    expect(m.campos.codigoMunicipioIbge).toBe("");
  });
  it("CRT: MEI=4, Simples=1, lucro presumido/real=3; sem sinal claro fica em branco (não chuta)", () => {
    expect(mapearDadosCnpj({ ...RESTAURANTE, opcao_pelo_mei: true }).campos.crt).toBe("4");
    expect(mapearDadosCnpj(RESTAURANTE).campos.crt).toBe("1");
    expect(mapearDadosCnpj(BANCO).campos.crt).toBe("3");
    expect(mapearDadosCnpj({ ...BANCO, regime_tributario: [] }).campos.crt).toBe("");
    expect(mapearDadosCnpj({ ...BANCO, regime_tributario: [{ ano: 2024, forma_de_tributacao: "IMUNE DO IRPJ" }] }).campos.crt).toBe("");
  });
  it("segmento só quando claro: restaurante e bar; resto em branco", () => {
    expect(mapearDadosCnpj({ ...RESTAURANTE, cnae_fiscal_descricao: "Restaurantes e similares" }).campos.segmento).toBe("Restaurante");
    expect(mapearDadosCnpj({ ...RESTAURANTE, cnae_fiscal_descricao: "Bares e outros estabelecimentos especializados em servir bebidas" }).campos.segmento).toBe("Bar");
    expect(mapearDadosCnpj(BANCO).campos.segmento).toBe("");
  });
  it("CNPJ não ativo gera aviso claro", () => {
    const m = mapearDadosCnpj({ ...RESTAURANTE, descricao_situacao_cadastral: "BAIXADA", situacao_cadastral: 8 });
    expect(m.situacao.ativa).toBe(false);
    expect(m.avisos.join(" ")).toMatch(/BAIXADA/);
  });
  it("resposta vazia não quebra: tudo em branco", () => {
    const m = mapearDadosCnpj({});
    expect(Object.values(m.campos).every((v) => v === "")).toBe(true);
  });
  it("tituloCaixa só para o nome de exibição", () => {
    expect(tituloCaixa("PADARIA DO ZE E FILHOS")).toBe("Padaria do Ze e Filhos");
  });
});

describe("aplicarDadosCnpj", () => {
  const mapa = mapearDadosCnpj(RESTAURANTE);
  it("formulário vazio: preenche tudo que a Receita trouxe, e avisa que IE e IM ficaram em branco", () => {
    const r = aplicarDadosCnpj({ nome: "", razaoSocial: "", inscricaoEstadual: "", inscricaoMunicipal: "" }, mapa);
    expect(r.form).toMatchObject({ nome: "Burger Station", razaoSocial: "BURGER STATION ALIMENTOS LTDA", crt: "1", uf: "SP", codigoMunicipioIbge: "3550308" });
    expect(r.preenchidos).toEqual(expect.arrayContaining(["razaoSocial", "logradouro", "codigoMunicipioIbge", "nome"]));
    expect(r.semDado).toEqual(expect.arrayContaining(["inscricaoEstadual", "inscricaoMunicipal", "segmento"]));
    expect(r.form.inscricaoEstadual).toBe("");
  });
  it("NÃO sobrescreve o que o usuário já preencheu; lista as diferenças", () => {
    const r = aplicarDadosCnpj({ nome: "Minha Burger", razaoSocial: "OUTRA RAZAO LTDA", logradouro: "", municipio: "SAO PAULO" }, mapa);
    expect(r.form.razaoSocial).toBe("OUTRA RAZAO LTDA");
    expect(r.form.nome).toBe("Minha Burger");
    expect(r.diferentes.map((d) => d.chave)).toContain("razaoSocial");
    expect(r.diferentes.find((d) => d.chave === "razaoSocial")).toMatchObject({ atual: "OUTRA RAZAO LTDA", receita: "BURGER STATION ALIMENTOS LTDA" });
    expect(r.form.logradouro).toBe("RUA DAS FLORES");           // o que estava vazio foi preenchido
    expect(r.diferentes.map((d) => d.chave)).not.toContain("municipio"); // igual (sem diferença de caixa)
  });
  it("com sobrescrever, usa os dados da Receita (menos o nome do sistema, que nunca é trocado)", () => {
    const r = aplicarDadosCnpj({ nome: "Minha Burger", razaoSocial: "OUTRA RAZAO LTDA" }, mapa, { sobrescrever: true });
    expect(r.form.razaoSocial).toBe("BURGER STATION ALIMENTOS LTDA");
    expect(r.form.nome).toBe("Minha Burger");
    expect(r.diferentes).toEqual([]);
  });
  it("não apaga campo preenchido quando a Receita não trouxe dado", () => {
    const r = aplicarDadosCnpj({ complemento: "Sala 5", emailFiscal: "meu@mail.com" }, mapearDadosCnpj({ ...RESTAURANTE, complemento: "", email: null }));
    expect(r.form.complemento).toBe("Sala 5");
    expect(r.form.emailFiscal).toBe("meu@mail.com");
  });
});

describe("consultarCnpj", () => {
  const resp = (status, corpo) => ({ status, ok: status >= 200 && status < 300, json: async () => corpo });
  it("chama a BrasilAPI só com o CNPJ (14 dígitos) e devolve os dados mapeados", async () => {
    const f = vi.fn(async () => resp(200, RESTAURANTE));
    const r = await consultarCnpj("11.222.333/0001-81", { fetchImpl: f });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe(`${URL_CNPJ}11222333000181`);
    expect(r.ok).toBe(true);
    expect(r.dados.campos.razaoSocial).toBe("BURGER STATION ALIMENTOS LTDA");
  });
  it("CNPJ inválido nem chama a rede", async () => {
    const f = vi.fn();
    const r = await consultarCnpj("11222333000180", { fetchImpl: f });
    expect(r).toMatchObject({ ok: false, codigo: "CNPJ_INVALIDO" });
    expect(f).not.toHaveBeenCalled();
  });
  it("CPF e CNPJ alfanumérico não são consultados (a base pública só cobre CNPJ numérico)", async () => {
    const f = vi.fn();
    expect((await consultarCnpj("12345678909", { fetchImpl: f })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it.each([[404, "NAO_ENCONTRADO"], [400, "CNPJ_INVALIDO"], [429, "LIMITE"], [500, "ERRO_SERVICO"]])("HTTP %s vira %s com mensagem em português", async (status, codigo) => {
    const r = await consultarCnpj("11222333000181", { fetchImpl: async () => resp(status, {}) });
    expect(r).toMatchObject({ ok: false, codigo });
    expect(r.motivo.length).toBeGreaterThan(10);
  });
  it("sem rede e tempo esgotado não lançam erro", async () => {
    const semRede = await consultarCnpj("11222333000181", { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
    expect(semRede).toMatchObject({ ok: false, codigo: "SEM_REDE" });
    const abort = await consultarCnpj("11222333000181", { fetchImpl: async () => { const e = new Error("abortado"); e.name = "AbortError"; throw e; } });
    expect(abort).toMatchObject({ ok: false, codigo: "TEMPO_ESGOTADO" });
  });
});
