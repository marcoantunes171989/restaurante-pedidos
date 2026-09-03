// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { montarContextoPlanoCozinha } from "./adminCozinhaNav";
import {
  CHAVE_LOJA_CONTEXTO,
  hidratarLojaContextoPersistido,
  lerLojaContextoPersistido,
  limparLojaContextoPersistido,
  persistirLojaContextoSePronto,
  podeMontarPainelCozinha,
  resolverLojaContextoPersistido,
  salvarLojaContextoPersistido,
} from "./lojaContextoStorage";

const superAdmin = { id: 1, superAdmin: true, active: true };
const superInativo = { id: 1, superAdmin: true, active: false };
const outroSuper = { id: 9, superAdmin: true, active: true };
const gestor = { id: 2, superAdmin: false, active: true, lojaId: 10 };
const lojas = [
  { id: 4, nome: "Burger Station", active: true },
  { id: 7, nome: "Sushi House", active: true },
  { id: 8, nome: "Loja Inativa", active: false },
];

afterEach(() => {
  try { localStorage.removeItem(CHAVE_LOJA_CONTEXTO); } catch { /* ignore */ }
});

describe("persistência da empresa em foco", () => {
  it("grava e lê somente userId + lojaId", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
    const raw = JSON.parse(localStorage.getItem(CHAVE_LOJA_CONTEXTO));
    expect(Object.keys(raw).sort()).toEqual(["lojaId", "userId"]);
    expect(JSON.stringify(raw)).not.toMatch(/email|token|jwt|password|senha/i);
  });

  it("não persiste sem userId — remove a chave", () => {
    salvarLojaContextoPersistido(1, 4);
    salvarLojaContextoPersistido(null, 4);
    expect(lerLojaContextoPersistido()).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("remove a chave quando a empresa é limpa (visão geral)", () => {
    salvarLojaContextoPersistido(1, 4);
    salvarLojaContextoPersistido(1, null);
    expect(lerLojaContextoPersistido()).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("limpar apaga o storage", () => {
    salvarLojaContextoPersistido(1, 4);
    limparLojaContextoPersistido();
    expect(lerLojaContextoPersistido()).toBeNull();
  });

  it("JSON inválido não quebra e remove a entrada", () => {
    localStorage.setItem(CHAVE_LOJA_CONTEXTO, "{");
    expect(lerLojaContextoPersistido()).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("JSON sem userId é inválido e some do storage", () => {
    localStorage.setItem(CHAVE_LOJA_CONTEXTO, JSON.stringify({ lojaId: 4 }));
    expect(lerLojaContextoPersistido()).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });
});

describe("resolverLojaContextoPersistido", () => {
  const persistido = { userId: 1, lojaId: 4 };

  it("restaura a empresa do super admin ativo quando a loja está autorizada", () => {
    expect(resolverLojaContextoPersistido(superAdmin, persistido, lojas)).toBe(4);
  });

  it("userId diferente não restaura", () => {
    expect(resolverLojaContextoPersistido(outroSuper, persistido, lojas)).toBeNull();
  });

  it("userId ausente não restaura", () => {
    expect(resolverLojaContextoPersistido(superAdmin, { userId: null, lojaId: 4 }, lojas)).toBeNull();
  });

  it("gestor não usa o storage — a loja vem do cadastro", () => {
    expect(resolverLojaContextoPersistido(gestor, persistido, lojas)).toBeNull();
  });

  it("descarta loja que não existe na lista atual", () => {
    expect(resolverLojaContextoPersistido(superAdmin, persistido, [{ id: 7, active: true }])).toBeNull();
  });

  it("lista vazia não autoriza — espera as lojas atuais", () => {
    expect(resolverLojaContextoPersistido(superAdmin, persistido, [])).toBeNull();
  });

  it("loja explicitamente inativa não restaura", () => {
    expect(resolverLojaContextoPersistido(superAdmin, { userId: 1, lojaId: 8 }, lojas)).toBeNull();
  });

  it("usuário inativo não restaura", () => {
    expect(resolverLojaContextoPersistido(superInativo, persistido, lojas)).toBeNull();
  });
});

describe("hidratarLojaContextoPersistido — caminho real do App", () => {
  it("mesmo userId + loja autorizada restaura Burger Station", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(hidratarLojaContextoPersistido(superAdmin, lojas)).toBe(4);
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
  });

  it("userId diferente não restaura e remove a chave", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(hidratarLojaContextoPersistido(outroSuper, lojas)).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("loja fora da lista não restaura e remove a chave", () => {
    salvarLojaContextoPersistido(1, 99);
    expect(hidratarLojaContextoPersistido(superAdmin, lojas)).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("loja inativa não restaura e remove a chave", () => {
    salvarLojaContextoPersistido(1, 8);
    expect(hidratarLojaContextoPersistido(superAdmin, lojas)).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("gestor comum ignora contexto de super admin e limpa o leftover", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(hidratarLojaContextoPersistido(gestor, lojas)).toBeNull();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("troca de usuário não herda a seleção anterior", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(hidratarLojaContextoPersistido(outroSuper, lojas)).toBeNull();
    salvarLojaContextoPersistido(9, 7);
    expect(hidratarLojaContextoPersistido(outroSuper, lojas)).toBe(7);
    expect(hidratarLojaContextoPersistido(superAdmin, lojas)).toBeNull();
  });

  it("sem usuário autenticado não aplica lojaId e não apaga o storage", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(hidratarLojaContextoPersistido(null, lojas)).toBeNull();
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
  });
});

describe("persistirLojaContextoSePronto — evita corrida com hidratação", () => {
  it("estado inicial null não apaga storage antes da hidratação", () => {
    salvarLojaContextoPersistido(1, 4);
    const gravou = persistirLojaContextoSePronto({
      hydrated: false,
      user: superAdmin,
      lojaId: null,
    });
    expect(gravou).toBe(false);
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
  });

  it("seleção manual válida persiste depois da hidratação", () => {
    persistirLojaContextoSePronto({ hydrated: true, user: superAdmin, lojaId: 4 });
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
    persistirLojaContextoSePronto({ hydrated: true, user: superAdmin, lojaId: 7 });
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 7 });
  });

  it("não regrava se o valor hidratado não mudou", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(persistirLojaContextoSePronto({ hydrated: true, user: superAdmin, lojaId: 4 })).toBe(false);
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
  });

  it("Visão geral remove a chave depois da hidratação", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(persistirLojaContextoSePronto({ hydrated: true, user: superAdmin, lojaId: null })).toBe(true);
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("gestor não grava contexto de super admin", () => {
    persistirLojaContextoSePronto({ hydrated: true, user: gestor, lojaId: 4 });
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });

  it("logout remove a chave", () => {
    salvarLojaContextoPersistido(1, 4);
    limparLojaContextoPersistido();
    expect(localStorage.getItem(CHAVE_LOJA_CONTEXTO)).toBeNull();
  });
});

describe("podeMontarPainelCozinha", () => {
  it("contexto inválido ou ainda não hidratado não monta KitchenView do super admin", () => {
    expect(podeMontarPainelCozinha({
      permitido: true, superAdmin: true, hydrated: false, lojaId: 4, lojas,
    })).toBe(false);
    expect(podeMontarPainelCozinha({
      permitido: true, superAdmin: true, hydrated: true, lojaId: 99, lojas,
    })).toBe(false);
    expect(podeMontarPainelCozinha({
      permitido: true, superAdmin: true, hydrated: true, lojaId: 8, lojas,
    })).toBe(false);
  });

  it("super admin hidratado com Burger Station pode montar", () => {
    expect(podeMontarPainelCozinha({
      permitido: true, superAdmin: true, hydrated: true, lojaId: 4, lojas,
    })).toBe(true);
  });

  it("Visão geral hidratada pode montar sem nome de empresa", () => {
    expect(podeMontarPainelCozinha({
      permitido: true, superAdmin: true, hydrated: true, lojaId: null, lojas,
    })).toBe(true);
  });

  it("gestor autorizado não depende da hidratação de super admin", () => {
    expect(podeMontarPainelCozinha({
      permitido: true, superAdmin: false, hydrated: false, lojaId: 10, lojas,
    })).toBe(true);
  });
});

describe("deep-link /admin/cozinha recupera Burger Station", () => {
  it("hidratação validada alimenta o contexto de plano da Cozinha", () => {
    salvarLojaContextoPersistido(1, 4);
    const lojaId = hidratarLojaContextoPersistido(superAdmin, lojas);
    expect(lojaId).toBe(4);
    expect(lojas.find((l) => l.id === lojaId).nome).toBe("Burger Station");
    const ctx = montarContextoPlanoCozinha(superAdmin, {
      lojaContexto: lojaId,
      assinaturas: [{ lojaId: 4, planoId: 2 }],
      planos: [{ id: 2, slug: "profissional" }],
      planoModulos: [{ planoId: 2, moduloSlug: "kitchen", podeAcessar: true }],
    });
    expect(ctx.assinatura.lojaId).toBe(4);
    expect(ctx.isSuperAdmin).toBe(true);
  });
});

describe("storage indisponível", () => {
  it("não quebra leitura, gravação, hidratação nem persistência", () => {
    const proto = Storage.prototype;
    const getItem = proto.getItem;
    const setItem = proto.setItem;
    const removeItem = proto.removeItem;
    proto.getItem = () => { throw new Error("quota"); };
    proto.setItem = () => { throw new Error("quota"); };
    proto.removeItem = () => { throw new Error("quota"); };
    try {
      expect(lerLojaContextoPersistido()).toBeNull();
      expect(() => salvarLojaContextoPersistido(1, 4)).not.toThrow();
      expect(() => limparLojaContextoPersistido()).not.toThrow();
      expect(hidratarLojaContextoPersistido(superAdmin, lojas)).toBeNull();
      expect(() => persistirLojaContextoSePronto({
        hydrated: true, user: superAdmin, lojaId: 4,
      })).not.toThrow();
    } finally {
      proto.getItem = getItem;
      proto.setItem = setItem;
      proto.removeItem = removeItem;
    }
  });
});
