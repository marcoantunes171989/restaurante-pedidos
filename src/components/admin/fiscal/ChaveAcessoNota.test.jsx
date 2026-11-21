// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChaveAcessoNota from "./ChaveAcessoNota";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const CHAVE = "35261144422195000133650010000000021482135790";
let root, el;
const montar = (nota) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); act(() => root.render(<ChaveAcessoNota nota={nota} />)); };
afterEach(() => { if (root) act(() => root.unmount()); el?.remove(); root = el = null; });
const q = (id) => el.querySelector(`[data-testid="${id}"]`);

describe("Chave de acesso da nota", () => {
  it("autorizada em produção: chave em blocos, link direto igual ao QR Code e portal, abrindo em nova aba", () => {
    montar({ chave: CHAVE, status: "autorizado", ambiente: "producao", modelo: 65 });
    expect(q("chave-texto").textContent).toBe("3526 1144 4221 9500 0133 6500 1000 0000 0214 8213 5790");
    const direta = q("link-consulta-direta");
    expect(direta.getAttribute("href")).toBe(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE}|3|1`);
    expect(direta.getAttribute("target")).toBe("_blank");
    expect(direta.getAttribute("rel")).toContain("noopener");
    expect(q("link-consulta-portal").getAttribute("href")).toBe("https://www.nfce.fazenda.sp.gov.br/consulta");
    expect(el.textContent).toContain("Ambiente de produção");
  });
  it("homologação usa o host de homologação e avisa que é nota de teste", () => {
    montar({ chave: CHAVE, status: "autorizado", ambiente: "homologacao", modelo: 65 });
    expect(q("link-consulta-direta").getAttribute("href")).toContain("homologacao.nfce.fazenda.sp.gov.br");
    expect(el.textContent).toContain("sem valor fiscal");
  });
  it("nota rejeitada: mostra e copia a chave, mas não oferece consulta (a SEFAZ não tem a nota)", () => {
    montar({ chave: CHAVE, status: "rejeitado", ambiente: "producao", modelo: 65 });
    expect(q("chave-texto")).not.toBeNull();
    expect(q("link-consulta-direta")).toBeNull();
    expect(q("link-consulta-portal")).toBeNull();
  });
  it("sem chave (ainda não reservada) não mostra nada", () => {
    montar({ chave: null, status: "reservado", ambiente: "producao", modelo: 65 });
    expect(q("chave-acesso")).toBeNull();
  });
  it("Copiar chave grava só os 44 dígitos na área de transferência", async () => {
    const gravar = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText: gravar }, configurable: true });
    montar({ chave: CHAVE, status: "autorizado", ambiente: "producao", modelo: 65 });
    await act(async () => { q("btn-copiar-chave").click(); });
    expect(gravar).toHaveBeenCalledWith(CHAVE);
    expect(q("btn-copiar-chave").textContent).toBe("Chave copiada");
  });
});
