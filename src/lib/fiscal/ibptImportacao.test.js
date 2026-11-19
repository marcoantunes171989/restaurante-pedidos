import { describe, it, expect } from "vitest";
import { csvGrande } from "./ibptFixture.js";
import { parseCsvIbpt, decodificarCsvIbpt, ufDoNomeArquivo, vigenciaParaIso, conferirTabelaIbpt, tabelaParaEnvio, MIN_NCM_TABELA } from "./ibpt.js";

describe("importação pela tela", () => {
  const HOJE = new Date(2026, 10, 19, 12, 0, 0);
  it("decodifica Windows-1252 sem corromper acentos", () => {
    expect(decodificarCsvIbpt(new Uint8Array([0x70, 0xe3, 0x6f]))).toBe("pão");
  });
  it("UF pelo nome do arquivo", () => {
    expect(ufDoNomeArquivo("TabelaIBPTaxSP24.2.B.csv")).toBe("SP");
    expect(ufDoNomeArquivo("tabelaibptaxmg26.2.a.csv")).toBe("MG");
    expect(ufDoNomeArquivo("tabela.csv")).toBe("");
    expect(ufDoNomeArquivo("TabelaIBPTaxXX1.csv")).toBe("");
  });
  it("vigência dd/mm/aaaa → ISO", () => {
    expect(vigenciaParaIso("30/09/2024")).toBe("2024-09-30");
    expect(vigenciaParaIso("")).toBe("");
  });
  it("tabela boa e vigente: sem bloqueios, com meta", () => {
    const t = parseCsvIbpt(csvGrande(), "SP");
    const c = conferirTabelaIbpt({ tabela: t, uf: "SP", ufLoja: "SP", agora: HOJE });
    expect(c.ok).toBe(true);
    expect(c.bloqueios).toEqual([]);
    expect(c.resumo).toMatchObject({ uf: "SP", versao: "26.2.A", chave: "ABC123", qtdNcm: 1200, vigenciaInicio: "01/07/2026", vigenciaFim: "31/12/2099" });
  });
  it("bloqueios: vencida, poucos NCMs, sem UF", () => {
    const vencida = conferirTabelaIbpt({ tabela: parseCsvIbpt(csvGrande(1200, { fim: "30/09/2024" }), "SP"), uf: "SP", ufLoja: "SP", agora: HOJE });
    expect(vencida.ok).toBe(false);
    expect(vencida.bloqueios.join(" ")).toContain("vencida em 30/09/2024");
    const poucos = conferirTabelaIbpt({ tabela: parseCsvIbpt(csvGrande(50), "SP"), uf: "SP", ufLoja: "SP", agora: HOJE });
    expect(poucos.bloqueios.join(" ")).toContain(`mínimo ${MIN_NCM_TABELA}`);
    const semUf = conferirTabelaIbpt({ tabela: parseCsvIbpt(csvGrande(), ""), uf: "", ufLoja: "SP", agora: HOJE });
    expect(semUf.bloqueios).toContain("Escolha a UF da tabela.");
  });
  it("admin de loja só importa a UF da própria loja; super admin só recebe aviso", () => {
    const t = parseCsvIbpt(csvGrande(), "MG");
    const admin = conferirTabelaIbpt({ tabela: t, uf: "MG", ufLoja: "SP", ehSuper: false, agora: HOJE });
    expect(admin.ok).toBe(false);
    expect(admin.bloqueios.join(" ")).toContain("UF da sua loja (SP)");
    const sup = conferirTabelaIbpt({ tabela: t, uf: "MG", ufLoja: "SP", ehSuper: true, agora: HOJE });
    expect(sup.ok).toBe(true);
    expect(sup.avisos.join(" ")).toContain("diferente da UF da loja");
  });
  it("não volta para vigência anterior à já gravada; mesma versão só avisa", () => {
    const t = parseCsvIbpt(csvGrande(1200, { fim: "31/12/2099" }), "SP");
    const maisNova = conferirTabelaIbpt({ tabela: t, uf: "SP", ufLoja: "SP", existente: { vigenciaFim: "30/06/2100", versao: "x", chave: "y" }, agora: HOJE });
    expect(maisNova.ok).toBe(false);
    expect(maisNova.bloqueios.join(" ")).toContain("mais nova");
    const igual = conferirTabelaIbpt({ tabela: t, uf: "SP", ufLoja: "SP", existente: { vigenciaFim: "31/12/2099", versao: "26.2.A", chave: "ABC123" }, agora: HOJE });
    expect(igual.ok).toBe(true);
    expect(igual.avisos.join(" ")).toContain("já está importada");
  });
  it("corpo da função do banco com datas ISO e NCMs", () => {
    const b = tabelaParaEnvio(parseCsvIbpt(csvGrande(1200), "SP"), "sp");
    expect(b.p_uf).toBe("SP");
    expect(b.p_meta).toEqual({ versao: "26.2.A", chave: "ABC123", fonte: "IBPT/empresometro.com.br", vigencia_inicio: "2026-07-01", vigencia_fim: "2099-12-31" });
    expect(Object.keys(b.p_ncm)).toHaveLength(1200);
  });
});
