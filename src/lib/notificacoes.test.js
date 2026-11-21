import { describe, it, expect } from "vitest";
import { avaliarAtivacao, avaliarNovas, instrucoesInstalacao } from "./notificacoes";

const capOk = { https: true, suportado: true, vapidConfigurada: true, instalado: true, so: "windows", navegador: "chrome", instalacaoObrigatoria: false };
const passo = (g, id) => g.passos.find((p) => p.id === id);

describe("avaliarAtivacao", () => {
  it("pronto para ativar (app instalado, permissão ainda não pedida)", () => {
    const g = avaliarAtivacao({ cap: capOk, permissao: "default", inscrito: false });
    expect(g.podeAtivar).toBe(true);
    expect(g.mostrarInstalar).toBe(false);
    expect(g.aviso.tipo).toBe("info");
    expect(passo(g, "instalar").estado).toBe("ok");
    expect(passo(g, "testar").estado).toBe("bloqueado");
  });
  it("desktop/Android sem instalar: pode ativar, instalar é só recomendado", () => {
    const g = avaliarAtivacao({ cap: { ...capOk, instalado: false }, permissao: "default", inscrito: false });
    expect(g.podeAtivar).toBe(true);
    expect(g.mostrarInstalar).toBe(true);
    expect(passo(g, "instalar").estado).toBe("opcional");
  });
  it("iOS sem instalar: bloqueia e explica a Tela de Início", () => {
    const g = avaliarAtivacao({ cap: { ...capOk, instalado: false, so: "ios", suportado: false, instalacaoObrigatoria: true }, permissao: "unsupported", inscrito: false });
    expect(g.podeAtivar).toBe(false);
    expect(g.aviso.texto).toMatch(/Tela de Início/);
    expect(passo(g, "instalar").estado).toBe("pendente");
  });
  it("permissão negada: orienta liberar e bloqueia o interruptor", () => {
    const g = avaliarAtivacao({ cap: capOk, permissao: "denied", inscrito: false });
    expect(g.podeAtivar).toBe(false);
    expect(g.aviso.tipo).toBe("erro");
    expect(g.aviso.texto).toMatch(/bloqueadas/);
    expect(passo(g, "permissao").estado).toBe("bloqueado");
  });
  it("navegador sem suporte, sem https e sem VAPID", () => {
    expect(avaliarAtivacao({ cap: { ...capOk, suportado: false }, permissao: "default", inscrito: false }).aviso.texto).toMatch(/não suporta/);
    expect(avaliarAtivacao({ cap: { ...capOk, https: false, suportado: false }, permissao: "default", inscrito: false }).aviso.texto).toMatch(/https/);
    const v = avaliarAtivacao({ cap: { ...capOk, vapidConfigurada: false }, permissao: "default", inscrito: false });
    expect(v.podeAtivar).toBe(false);
    expect(v.aviso.texto).toMatch(/administrador/);
  });
  it("já inscrito: tudo ok e teste liberado", () => {
    const g = avaliarAtivacao({ cap: capOk, permissao: "granted", inscrito: true });
    expect(g.aviso.tipo).toBe("ok");
    expect(passo(g, "ativar").estado).toBe("ok");
    expect(passo(g, "testar").estado).toBe("pendente");
  });
});

describe("avaliarNovas", () => {
  const n = (id, lida = false) => ({ id, lida });
  it("primeira carga não conta nada como novo", () => {
    const r = avaliarNovas(null, [n(1), n(2)]);
    expect(r.novas).toEqual([]);
    expect(r.vistos.has(2)).toBe(true);
  });
  it("só avisa de não lidas ainda desconhecidas", () => {
    const r1 = avaliarNovas(null, [n(1)]);
    const r2 = avaliarNovas(r1.vistos, [n(3), n(2, true), n(1)]);
    expect(r2.novas.map((x) => x.id)).toEqual([3]);
    expect(avaliarNovas(r2.vistos, [n(3), n(2, true), n(1)]).novas).toEqual([]);
  });
});

describe("instrucoesInstalacao", () => {
  it("varia por aparelho", () => {
    expect(instrucoesInstalacao("ios", "safari")).toMatch(/Compartilhar/);
    expect(instrucoesInstalacao("android", "chrome")).toMatch(/Instalar aplicativo/);
    expect(instrucoesInstalacao("windows", "edge")).toMatch(/barra de endereço/);
  });
});
