import { describe, it, expect, vi } from "vitest";
import {
  mensagemErroFiscal, buscarEmitenteFiscal, buscarConfigFiscalVenda, salvarConfigFiscalVenda,
  configVendaParaSelo, listarSeriesFiscais, salvarSerieFiscal, reservarDocumentoFiscal,
  descartarDocumentoFiscal, resumoCredenciaisFiscais, enviarCredencialFiscal, arquivoParaBase64, testarConexaoSefaz,
} from "./fiscalApi.js";

describe("enviarCredencialFiscal (API do servidor)", () => {
  const supa = (token = "tok-usuario") => ({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: token ? { access_token: token } : null } }) } });
  it("envia com o login do usuário e devolve a resposta do servidor", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, titular: "X", diasRestantes: 300 }) });
    const r = await enviarCredencialFiscal(supa(), { acao: "certificado", lojaId: 7, pfxBase64: "QUJD", senha: "s" }, { fetchFn });
    expect(r).toMatchObject({ ok: true, titular: "X" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/fiscal-credencial");
    expect(init.headers.authorization).toBe("Bearer tok-usuario");
    expect(JSON.parse(init.body)).toMatchObject({ acao: "certificado", lojaId: 7 });
  });
  it("sem login → erro sem chamar o servidor", async () => {
    const fetchFn = vi.fn();
    await expect(enviarCredencialFiscal(supa(null), { acao: "csc" }, { fetchFn })).rejects.toThrow(/login/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("recusa do servidor vira erro com a mensagem dele", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ ok: false, code: "CNPJ_DIVERGENTE", erro: "O certificado é de outra empresa." }) });
    await expect(enviarCredencialFiscal(supa(), { acao: "certificado" }, { fetchFn })).rejects.toMatchObject({ code: "CNPJ_DIVERGENTE", message: "O certificado é de outra empresa." });
  });
  it("falha de rede → mensagem simples", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(enviarCredencialFiscal(supa(), { acao: "csc" }, { fetchFn })).rejects.toThrow(/conexão/i);
  });
});

describe("testarConexaoSefaz", () => {
  it("chama /api/fiscal-emitir com acao status e devolve o resultado", async () => {
    const supa = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) } };
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, operando: true, cStat: 107, xMotivo: "Servico em Operacao" }) });
    const r = await testarConexaoSefaz(supa, { lojaId: 7 }, { fetchFn });
    expect(r).toMatchObject({ operando: true, cStat: 107 });
    expect(fetchFn.mock.calls[0][0]).toBe("/api/fiscal-emitir");
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ acao: "status", lojaId: 7, modelo: 65, ambiente: "homologacao" });
  });
});

describe("arquivoParaBase64", () => {
  it("converte o conteúdo do arquivo para base64 sem o prefixo data:", async () => {
    const arquivo = new Blob([new Uint8Array([65, 66, 67])]);
    expect(await arquivoParaBase64(arquivo)).toBe("QUJD");
  });
});

const ok = (data) => vi.fn().mockResolvedValue({ data, error: null });

describe("mensagemErroFiscal", () => {
  it("traduz códigos das RPCs da 175", () => {
    expect(mensagemErroFiscal("FORBIDDEN")).toMatch(/permissão/i);
    expect(mensagemErroFiscal("PRODUCAO_BLOQUEADA")).toMatch(/certificado/i);
    expect(mensagemErroFiscal("NUMERO_JA_USADO", { minimo: 7 })).toMatch(/7/);
    expect(mensagemErroFiscal("SEM_SERIE")).toMatch(/série/i);
    expect(mensagemErroFiscal("???")).toMatch(/não foi possível/i);
  });
});

describe("buscarEmitenteFiscal", () => {
  it("usa a RPC e devolve o emitente no formato do app", async () => {
    const rpc = ok({ ok: true, emitente: { id: 1, loja_id: 7, razao_social: "X LTDA", nfce_habilitada: true } });
    const e = await buscarEmitenteFiscal({ rpc }, 7);
    expect(rpc).toHaveBeenCalledWith("app_fiscal_emitente_da_loja", { p_loja_id: 7 });
    expect(e).toMatchObject({ lojaId: 7, razaoSocial: "X LTDA", nfceHabilitada: true });
  });
  it("sem cadastro → null", async () => {
    expect(await buscarEmitenteFiscal({ rpc: ok({ ok: true, emitente: null }) }, 7)).toBeNull();
  });
  it("RPC ainda não instalada (175 pendente) → usa o caminho antigo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const legado = vi.fn().mockResolvedValue({ lojaId: 7 });
    expect(await buscarEmitenteFiscal({ rpc }, 7, { legado })).toEqual({ lojaId: 7 });
    expect(legado).toHaveBeenCalledWith(7);
  });
  it("sem loja → null sem chamar o servidor", async () => {
    const rpc = vi.fn();
    expect(await buscarEmitenteFiscal({ rpc }, null)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("erro inesperado não derruba a tela", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("rede"));
    expect(await buscarEmitenteFiscal({ rpc }, 7)).toBeNull();
  });
});

describe("configuração de venda", () => {
  it("lê e converte para o selo do PDV", async () => {
    const c = await buscarConfigFiscalVenda({ rpc: ok({ ok: true, mapa_meios: { pix: "17" }, taxa_servico_tratamento: "fora_da_nota" }) }, 7);
    expect(c).toEqual({ mapaMeios: { pix: "17" }, taxaServicoTratamento: "fora_da_nota" });
    expect(configVendaParaSelo(c)).toEqual({ mapaMeios: { pix: "17" }, regras: { taxaServico: "fora_da_nota" } });
  });
  it("175 pendente → configuração vazia (selo mostra pendências, não quebra)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
    expect(await buscarConfigFiscalVenda({ rpc }, 7)).toEqual({ mapaMeios: {}, taxaServicoTratamento: null });
  });
  it("salvar valida localmente o formato dos códigos (2 dígitos) antes do servidor", async () => {
    const rpc = vi.fn();
    await expect(salvarConfigFiscalVenda({ rpc }, 7, { mapaMeios: { pix: "PIX" } })).rejects.toMatchObject({ code: "MAPA_INVALIDO" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("salvar repassa os parâmetros e traduz recusa do servidor", async () => {
    const rpc = ok({ ok: false, code: "FORBIDDEN" });
    await expect(salvarConfigFiscalVenda({ rpc }, 7, { mapaMeios: { pix: "17" }, taxaServicoTratamento: null }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).toHaveBeenCalledWith("app_fiscal_salvar_config_venda", { p_loja_id: 7, p_mapa_meios: { pix: "17" }, p_taxa_servico_tratamento: null });
  });
});

describe("séries e documentos", () => {
  it("lista séries no formato do app", async () => {
    const s = await listarSeriesFiscais({ rpc: ok({ ok: true, series: [{ id: 1, modelo: 65, serie: 1, ambiente: "homologacao", proximo_numero: 3, ativa: true }] }) }, 7);
    expect(s).toEqual([{ id: 1, modelo: 65, serie: 1, ambiente: "homologacao", proximoNumero: 3, ativa: true }]);
  });
  it("salvar série: erro do servidor vira mensagem com o mínimo", async () => {
    await expect(salvarSerieFiscal({ rpc: ok({ ok: false, code: "NUMERO_JA_USADO", minimo: 9 }) }, 7, { modelo: 65, serie: 1, ambiente: "homologacao", proximoNumero: 2 }))
      .rejects.toThrow(/9/);
  });
  it("reserva exige chave de idempotência e repassa a mesma em nova tentativa", async () => {
    const rpc = ok({ ok: true, documento_id: "d1", numero: 1, serie: 1, modelo: 65, ambiente: "homologacao", status: "reservado", reutilizado: false });
    await expect(reservarDocumentoFiscal({ rpc }, { lojaId: 7, modelo: 65, ambiente: "homologacao" })).rejects.toMatchObject({ code: "CHAVE_IDEMPOTENCIA_OBRIGATORIA" });
    const k = "8f6c1a7e-1d2b-4c3d-9e8f-0a1b2c3d4e5f";
    const r = await reservarDocumentoFiscal({ rpc }, { lojaId: 7, modelo: 65, ambiente: "homologacao", idempotencyKey: k, valorTotal: 44, qtdItens: 2, pedidosIds: ["P1"] });
    expect(r).toMatchObject({ documentoId: "d1", numero: 1, reutilizado: false });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_idempotency_key: k, p_valor_total: 44, p_pedidos_ids: ["P1"] });
  });
  it("descartar exige motivo", async () => {
    await expect(descartarDocumentoFiscal({ rpc: vi.fn() }, "d1", "")).rejects.toMatchObject({ code: "MOTIVO_OBRIGATORIO" });
  });
  it("resumo de credenciais nunca expõe referência de segredo", async () => {
    const r = await resumoCredenciaisFiscais({ rpc: ok({ ok: true, credenciais: [{ tipo: "certificado_a1", titular: "X", validade_fim: "2027-01-01", cadastrado: true, vault_secret_id: "nao-devia" }] }) }, 7);
    expect(r[0]).not.toHaveProperty("vaultSecretId");
    expect(r[0]).not.toHaveProperty("vault_secret_id");
    expect(r[0]).toMatchObject({ tipo: "certificado_a1", titular: "X", cadastrado: true });
  });
});
