// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { rotaOperacaoMobile, abrirOperacaoMobile } from "./operacaoMobileNav";

describe("Operação Mobile: helper de navegação", () => {
  it("aponta sempre para /operacional (nunca /app/tablet)", () => {
    expect(rotaOperacaoMobile("https://app.pedidoprime.com")).toBe(
      "https://app.pedidoprime.com/operacional",
    );
  });

  it("navega na MESMA aba (location.assign), preservando sessionStorage/JWT da aba", () => {
    const assign = vi.fn();
    const loc = { origin: "https://app.pedidoprime.com", assign };
    abrirOperacaoMobile(loc);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("https://app.pedidoprime.com/operacional");
  });

  it("nunca abre nova aba (window.open quebraria a herança de sessionStorage com noopener)", () => {
    const openSpy = vi.spyOn(window, "open");
    abrirOperacaoMobile({ origin: "https://app.pedidoprime.com", assign: vi.fn() });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe("regressão: item 'Operação Mobile' do menu Admin (src/App.jsx)", () => {
  const src = readFileSync("src/App.jsx", "utf8");
  const inicio = src.indexOf('it.id === "operacaomobile"');
  const bloco = src.slice(inicio, inicio + 400);

  it("handler não usa window.open (evitando a causa raiz do bug: nova aba sem sessionStorage)", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(bloco).not.toContain("window.open");
    expect(bloco).toContain("abrirOperacaoMobile");
  });

  it("preserva a regra de NÃO restaurar rota protegida após login por credenciais", () => {
    // aplicarLogin: pós-credenciais sempre pousa na home do perfil, nunca na
    // URL anterior — não pode voltar a existir um redirect genérico aqui.
    expect(src).toContain("Credenciais / pós-reload de login: SEMPRE home do perfil.");
  });

  it("mantém o guard de acesso operacional na rota /operacional (aplicarRota)", () => {
    // Usuário sem acessosOperacionais continua caindo no fallback seguro.
    const opMatch = src.indexOf("const opMatch = pathname.match(/^\\/operacional");
    const opBloco = src.slice(opMatch, opMatch + 400);
    expect(opMatch).toBeGreaterThan(-1);
    expect(opBloco).toContain("if (!temAcessoOperacional(user)) {");
    expect(opBloco).toContain("irParaFallbackSeguro(user);");
  });

  it("mantém logoutSupabaseAuth como proteção contra JWT órfão sem marcador de sessão", () => {
    expect(src).toContain("await logoutSupabaseAuth();");
  });
});
