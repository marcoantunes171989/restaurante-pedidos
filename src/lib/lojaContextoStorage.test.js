// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  CHAVE_LOJA_CONTEXTO,
  lerLojaContextoPersistido,
  limparLojaContextoPersistido,
  resolverLojaContextoPersistido,
  salvarLojaContextoPersistido,
} from "./lojaContextoStorage";

const superAdmin = { id: 1, superAdmin: true };
const outroSuper = { id: 9, superAdmin: true };
const gestor = { id: 2, superAdmin: false, lojaId: 10 };
const lojas = [{ id: 4, nome: "Burger Station" }, { id: 7, nome: "Sushi House" }];

afterEach(() => {
  localStorage.removeItem(CHAVE_LOJA_CONTEXTO);
});

describe("persistência da empresa em foco", () => {
  it("grava e lê lojaId + userId", () => {
    salvarLojaContextoPersistido(1, 4);
    expect(lerLojaContextoPersistido()).toEqual({ userId: 1, lojaId: 4 });
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

  it("JSON inválido não quebra", () => {
    localStorage.setItem(CHAVE_LOJA_CONTEXTO, "{");
    expect(lerLojaContextoPersistido()).toBeNull();
  });
});

describe("resolverLojaContextoPersistido", () => {
  const persistido = { userId: 1, lojaId: 4 };

  it("restaura a empresa do super admin no remount", () => {
    expect(resolverLojaContextoPersistido(superAdmin, persistido, lojas)).toBe(4);
  });

  it("ignora storage de outro usuário", () => {
    expect(resolverLojaContextoPersistido(outroSuper, persistido, lojas)).toBeNull();
  });

  it("gestor não usa o storage — a loja vem do cadastro", () => {
    expect(resolverLojaContextoPersistido(gestor, persistido, lojas)).toBeNull();
  });

  it("descarta loja que não existe mais", () => {
    expect(resolverLojaContextoPersistido(superAdmin, persistido, [{ id: 7 }])).toBeNull();
  });

  it("sem lista de lojas ainda, mantém o id para o título hidratar depois", () => {
    expect(resolverLojaContextoPersistido(superAdmin, persistido, [])).toBe(4);
  });
});
