// @vitest-environment node
import { describe, it, expect } from "vitest";
import { COD_UF } from "./ufs.js";
import { statusServico } from "./emissor.js";

describe("código IBGE da UF (cUF) no servidor fiscal", () => {
  it("cobre as 27 UFs, com códigos de 2 dígitos", () => {
    expect(Object.keys(COD_UF)).toHaveLength(27);
    for (const [uf, c] of Object.entries(COD_UF)) expect(c, uf).toMatch(/^[0-9]{2}$/);
    expect(COD_UF.SP).toBe("35");
    expect(COD_UF.RJ).toBe("33");
    expect(COD_UF.MG).toBe("31");
    expect(COD_UF.DF).toBe("53");
    expect(COD_UF.TO).toBe("17");
  });
  it("o emissor deixa de recusar UFs fora de SP (consulta do status chega ao envio)", async () => {
    const enviado = [];
    const r = await statusServico({
      uf: "BA", modelo: 65, ambiente: "homologacao", pfx: "x", senha: "y",
      endereco: ({ uf, modelo, ambiente, servico }) => `https://exemplo.test/${uf}/${modelo}/${ambiente}/${servico}`,
      enviar: async ({ url, dados }) => { enviado.push({ url, dados }); return { ok: true, xml: '<retConsStatServ versao="4.00"><tpAmb>2</tpAmb><verAplic>SIM</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>29</cUF><dhRecbto>2026-11-19T12:00:00-03:00</dhRecbto></retConsStatServ>' }; },
    });
    expect(r.operando).toBe(true);
    expect(enviado[0].url).toBe("https://exemplo.test/BA/65/homologacao/StatusServico");
    expect(enviado[0].dados).toContain("<cUF>29</cUF>");
  });
  it("UF inexistente continua recusada", async () => {
    await expect(statusServico({ uf: "ZZ", modelo: 65, ambiente: "homologacao", pfx: "x", senha: "y" })).rejects.toThrow(/não configurada/);
  });
});
