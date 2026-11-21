import { describe, it, expect } from "vitest";
import { escolherDestinatarios, acessosOperacionais } from "../../supabase/functions/notificacoes-push/destinatarios.js";

const garcom = { id: 10, ids_acesso: ["op_pedidos"], super_admin: false, ativo: true };
const caixa = { id: 11, ids_acesso: ["op_caixa"], super_admin: false, ativo: true };
const semAcessos = { id: 12, ids_acesso: [], super_admin: false, ativo: true };
const inativo = { id: 13, ids_acesso: ["admin"], super_admin: false, ativo: false };
const root = { id: 1, ids_acesso: [], super_admin: true, ativo: true };
const ids = (l) => l.map((u) => u.id).sort((a, b) => a - b);

describe("escolherDestinatarios", () => {
  it("novo pedido: todo usuário ativo da loja, independente do acesso", () => {
    const r = escolherDestinatarios({ evento: "novo_pedido", usuariosLoja: [garcom, caixa, semAcessos, inativo], superAdminsEmFoco: [], prefs: [] });
    expect(ids(r)).toEqual([10, 11, 12]);
  });
  it("caixa: só quem tem acesso ao Caixa", () => {
    const r = escolherDestinatarios({ evento: "caixa_aguardando", usuariosLoja: [garcom, caixa, semAcessos], superAdminsEmFoco: [], prefs: [] });
    expect(ids(r)).toEqual([11]);
  });
  it("super admin logado na loja recebe os dois tipos", () => {
    for (const evento of ["novo_pedido", "caixa_aguardando"]) {
      const r = escolherDestinatarios({ evento, usuariosLoja: [garcom], superAdminsEmFoco: [root], prefs: [] });
      expect(ids(r)).toContain(1);
    }
  });
  it("não duplica quando o super admin também aparece na lista da loja", () => {
    const r = escolherDestinatarios({ evento: "novo_pedido", usuariosLoja: [{ ...root, loja_id: 9 }], superAdminsEmFoco: [root], prefs: [] });
    expect(r.filter((u) => u.id === 1).length).toBe(1);
  });
  it("só super admin entra pela lista de foco (usuário comum não)", () => {
    const r = escolherDestinatarios({ evento: "novo_pedido", usuariosLoja: [], superAdminsEmFoco: [garcom], prefs: [] });
    expect(r).toEqual([]);
  });
  it("preferências: push desligado e tipo desligado valem para todos, inclusive super admin", () => {
    const prefs = [
      { usuario_id: 10, push_ativo: false },
      { usuario_id: 11, alerta_novo_pedido: false },
      { usuario_id: 1, alerta_caixa: false },
    ];
    const base = { usuariosLoja: [garcom, caixa], superAdminsEmFoco: [root], prefs };
    expect(ids(escolherDestinatarios({ evento: "novo_pedido", ...base }))).toEqual([1]);
    expect(ids(escolherDestinatarios({ evento: "caixa_aguardando", ...base }))).toEqual([11]);
  });
});

describe("acessosOperacionais", () => {
  it("legado kitchen/cashier e total por admin", () => {
    expect(acessosOperacionais(["kitchen"], false)).toMatchObject({ pedidos: true, caixa: false });
    expect(acessosOperacionais(["cashier"], false).caixa).toBe(true);
    expect(acessosOperacionais(["admin"], false).caixa).toBe(true);
  });
});
