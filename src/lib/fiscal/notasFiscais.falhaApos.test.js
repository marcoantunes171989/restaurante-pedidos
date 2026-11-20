import { describe, it, expect } from "vitest";
import { explicarNota, textoDiagnostico } from "./notasFiscais";

describe("falha técnica depois do envio", () => {
  const doc = { id: "d", modelo: 65, serie: 1, numero: 1, ambiente: "homologacao", status: "enviado", xMotivo: "Falha técnica depois do envio (a SEFAZ pode ter recebido a nota: consulte antes de reenviar): Error" };
  it("manda consultar antes de reenviar", () => {
    const e = explicarNota(doc);
    expect(e.titulo).toBe("Falha técnica depois do envio");
    expect(e.passos.join(" ")).toMatch(/Consultar na SEFAZ antes de reenviar/);
  });
  it("cabeçalho do diagnóstico sem duplicar o tipo", () => {
    expect(textoDiagnostico(doc).split("\n")[0]).toBe("NFC-e nº 1 · série 1 · homologação");
  });
});
