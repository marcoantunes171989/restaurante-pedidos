import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copiarItemPedido, itemPersistidoDoCarrinho, mensagemDeItemRecusado } from "./pedidoItem.js";

const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const sql = ler("supabase/migrations/217_preco_do_pedido_no_servidor.sql");
const app = ler("src/App.jsx");
const caixa = ler("src/pages/pdv/CashierPdv.jsx");
const semComentarios = sql.replace(/--[^\n]*/g, "");
// O comportamento no banco é conferido em supabase/tests/preco-217-integration.sql (PostgreSQL local).

describe("migration 217 — preço do pedido conferido no servidor", () => {
  it("é a única migration 217, em uma transação, sem alterar dados", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^217[_.]/.test(f))).toEqual(["217_preco_do_pedido_no_servidor.sql"]);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    expect(semComentarios).not.toMatch(/\b(delete\s+from|update\s+public\.|insert\s+into|truncate)\b/i);
  });

  it("confere na criação e na troca de itens, só para quem está logado", () => {
    expect(sql).toContain("before insert or update of itens on public.tab_pedidos");
    expect(sql).toContain("if v_papel <> 'authenticated' then return new; end if;");
    ["item_preco_abaixo_do_cadastro", "item_sem_produto_no_cadastro", "item_invalido"].forEach((c) => expect(sql).toContain(c));
  });

  it("não expõe as funções de apoio", () => {
    ["app_pp_numero(jsonb)", "app_pp_preco_minimo(bigint, jsonb)", "app_pp_item_ja_vendido(jsonb, jsonb)", "app_pp_conferir_preco_pedido()"]
      .forEach((f) => expect(sql).toContain(`revoke all on function public.${f} from public, anon, authenticated;`));
    expect(semComentarios).not.toMatch(/\bgrant\b/i);
  });
});

describe("app — itens do pedido e recusas do banco", () => {
  it("os itens enviados pelo painel levam o produto, que o banco usa para achar o preço", () => {
    expect(itemPersistidoDoCarrinho({ id: 5, name: "Suco", quantity: 1, price: 10 }).productId).toBe(5);
    expect(copiarItemPedido({ productId: 5, name: "Suco", quantity: 1, price: 10 }).productId).toBe(5);
    expect(caixa).toContain("const productId = produtoIdDoItem({ productId: produto.id });");
  });

  it("explica a recusa pelo nome do item", () => {
    expect(mensagemDeItemRecusado({ message: "item_preco_abaixo_do_cadastro", details: "Suco" })).toContain('O preço de "Suco" está abaixo do cadastro');
    expect(mensagemDeItemRecusado({ message: "item_sem_produto_no_cadastro" })).toContain("um item não está no cadastro");
    expect(mensagemDeItemRecusado({ message: "item_invalido", details: "Suco" })).toContain("quantidade e o preço");
    expect(mensagemDeItemRecusado({ message: "outro erro" })).toBeNull();
    expect(mensagemDeItemRecusado(null)).toBeNull();
  });

  it("separar contas grava no destino antes de tirar da origem", () => {
    const f = app.slice(app.indexOf("async function separarItensPedidos"), app.indexOf('auditar("separar_itens_mesa"'));
    expect(f.indexOf("editarItensPedido(pedidoDestino.id")).toBeGreaterThan(0);
    expect(f.indexOf("editarItensPedido(pedidoDestino.id")).toBeLessThan(f.indexOf("editarItensPedido(orderId, novosItens)"));
    expect(f.indexOf("inserirPedido(newOrder)")).toBeLessThan(f.indexOf("editarItensPedido(orderId, novosItens)"));
    expect(f).toContain("destino === mesaOrigem");
  });

  it("o caixa não anuncia sucesso quando a alteração é recusada", () => {
    expect(caixa).toContain("if (await alterarQtdItem(orderId, index, 0) === false) return;");
    expect(caixa).toContain("if (await editarItensPedido(pedidoComanda.id, itens) === false) return;");
    expect(caixa).toContain("if (await editarItensPedido(alvo.id, itens) === false) return;");
  });
});
