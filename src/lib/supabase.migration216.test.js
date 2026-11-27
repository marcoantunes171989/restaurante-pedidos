import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O comportamento no banco é conferido por supabase/tests/protecao-216-integration.sql (Postgres descartável).
const ler = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");
const sql = ler("supabase/migrations/216_protecao_funcoes_publicas.sql");
const codigo = sql.replace(/--(?!@trava@)[^\n]*/g, "");
const cardapio = ler("src/CardapioPublico.jsx");

// Assinatura → migration anterior que define o corpo em uso.
const FUNCOES = [
  ["pub_buscar_cliente(bigint, text)", "057_pub_buscar_cliente.sql"],
  ["pub_saldo_fidelidade(bigint, text)", "073_fidelidade_resgate.sql"],
  ["pub_upsert_cliente(bigint, text, text)", "050_cardapio_publico.sql"],
  ["pub_solicitar_conta(bigint, text)", "050_cardapio_publico.sql"],
  ["pub_solicitar_conta(bigint, text, boolean)", "073_fidelidade_resgate.sql"],
  ["pub_criar_chamado(bigint, text, text, text)", "050_cardapio_publico.sql"],
  ["pub_criar_lead(text, text, text, text, integer, text)", "072_leads.sql"],
  ["pub_pesquisa_satisfacao(text, bigint, text, text, text, jsonb, text)", "059_pesquisa_satisfacao.sql"],
  ["pub_acompanhar_pedidos(bigint, text, text)", "195_pub_acompanhar_pedidos.sql"],
];

const definicoes = (texto) => [...texto.matchAll(/create or replace function public\.(\w+)\s*\(([^)]*)\)\s*returns[\s\S]*?as (\$\w*\$)([\s\S]*?)\3/gi)]
  .map(([, nome, parametros, , corpo]) => {
    const lista = parametros.split(",").map((p) => p.trim().replace(/\s+/g, " "));
    return { assinatura: `${nome}(${lista.map((p) => p.split(" ")[1]).join(", ")})`, parametros: lista, corpo };
  });
const novas = definicoes(sql);

describe("migration 216 — validações e limites nas funções públicas", () => {
  it("é a única migration 216, em uma transação, sem apagar tabela nem conceder acesso", () => {
    expect(readdirSync("supabase/migrations").filter((f) => /^216[_.]/.test(f))).toEqual(["216_protecao_funcoes_publicas.sql"]);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    expect(codigo).not.toMatch(/\b(drop\s|truncate\s)/i);
    expect(codigo).not.toMatch(/\bgrant\s/i);
    // A única limpeza é a do próprio contador.
    expect([...codigo.matchAll(/delete from (\S+)/gi)].map((m) => m[1])).toEqual(["public.tab_limite_publico"]);
  });

  it("redefine as nove funções com a mesma assinatura e os mesmos nomes de parâmetro, todas marcadas", () => {
    expect(novas.map((d) => d.assinatura).filter((a) => a.startsWith("pub_")).sort()).toEqual(FUNCOES.map(([a]) => a).sort());
    for (const [assinatura, arquivo] of FUNCOES) {
      const nova = novas.find((d) => d.assinatura === assinatura);
      const anterior = definicoes(ler(`supabase/migrations/${arquivo}`)).find((d) => d.assinatura === assinatura);
      expect(nova.parametros, assinatura).toEqual(anterior.parametros);
      expect(nova.corpo, assinatura).toContain("[protecao 216]");
    }
    expect([...sql.matchAll(/language plpgsql( volatile)? security definer set search_path = public as/g)]).toHaveLength(10);
  });

  it("só parte das versões conhecidas: o corpo anterior de cada função está na conferência (LF e CRLF)", () => {
    const conferencia = sql.slice(0, sql.indexOf("── 1)"));
    for (const [assinatura, arquivo] of FUNCOES) {
      const corpo = definicoes(ler(`supabase/migrations/${arquivo}`)).find((d) => d.assinatura === assinatura).corpo;
      expect(conferencia).toContain(`'public.${assinatura}'`);
      expect(conferencia, assinatura).toContain(md5(corpo));
      expect(conferencia, assinatura).toContain(md5(corpo.replace(/\n/g, "\r\n")));
    }
    expect(sql.indexOf("precheck 216")).toBeLessThan(sql.indexOf("create table"));
  });

  it("o contador e a função de limite ficam fora do alcance do navegador e não guardam IP em texto", () => {
    expect(codigo).toContain("revoke all on table public.tab_limite_publico from public, anon, authenticated;");
    expect(codigo).toContain("revoke all on table public.tab_limite_publico_sal from public, anon, authenticated;");
    expect(codigo).toContain("revoke all on function public.app_limite_publico(text, bigint, text, integer, integer) from public, anon, authenticated;");
    expect(codigo).toContain("alter table public.tab_limite_publico enable row level security;");
    expect(codigo).toMatch(/v_origem := md5\(coalesce\(v_sal, ''\)/);
  });

  it("os limites são os aprovados", () => {
    const chamadas = [...codigo.matchAll(/app_limite_publico\('(\w+)', [\w]+, \w+, (\d+), (\d+)\)/g)].map((m) => m.slice(1).join(" "));
    expect(chamadas.sort()).toEqual(["chamado 60 10", "cliente_novo 20 10", "conta 20 10", "conta 20 10", "lead 5 60", "saldo 30 10"]);
    expect(codigo).toContain("case when v_por_telefone then 60 else 150 end");
    expect(codigo).toContain(">= 100");
    expect(codigo).toContain(">= 60");
  });

  it("não devolve nome, devolve telefone só a quem consultou por ele e fecha as consultas antigas", () => {
    const acompanhar = novas.find((d) => d.assinatura.startsWith("pub_acompanhar_pedidos")).corpo;
    expect(acompanhar).toContain("'cliente', null");
    expect(acompanhar).not.toMatch(/p\.cliente\b(?!_)/);
    expect(acompanhar).toContain("'cliente_telefone', case when v_por_telefone then p.cliente_telefone end");
    expect(novas.find((d) => d.assinatura.startsWith("pub_buscar_cliente")).corpo).not.toMatch(/tab_clientes/);
    expect(codigo).toContain("p.proname in ('pub_pedidos_comanda', 'pub_pedidos_cliente')");
    expect(codigo).toContain("revoke all on function %s from public, anon, authenticated");
  });

  it("mantém a trava de manutenção só onde o banco já tem", () => {
    expect([...sql.matchAll(/^ {2}--@trava@$/gm)]).toHaveLength(2);
    expect(sql).toContain("case when v_duas then v_trava else '' end");
    expect(sql).toContain("case when v_tres then v_trava else '' end");
  });
});

const estado = { respostas: [] };
const rpcMock = vi.fn(async () => estado.respostas.shift() || { data: null, error: null });
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: rpcMock, from: () => ({}), storage: { from: () => ({}) }, channel: () => ({ on: () => ({ subscribe: () => {} }) }), removeChannel: () => {} }),
}));
const { rpcSolicitarContaPublico } = await import("./supabase.js");

describe("tela — pedir a conta", () => {
  beforeEach(() => { estado.respostas = []; rpcMock.mockClear(); });

  it("com pontos, o limite de uso sobe para a tela sem repetir o pedido sem os pontos", async () => {
    estado.respostas = [{ data: null, error: { code: "PT429", message: "Muitas tentativas. Aguarde alguns minutos." } }];
    await expect(rpcSolicitarContaPublico({ lojaId: 1, comanda: "ABC-000001", usarPontos: true })).rejects.toMatchObject({ code: "PT429" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("sem a função de pontos no banco, usa a assinatura antiga", async () => {
    estado.respostas = [{ data: null, error: { code: "PGRST202", message: "Could not find the function" } }];
    await rpcSolicitarContaPublico({ lojaId: 1, comanda: "ABC-000001", usarPontos: true });
    expect(rpcMock.mock.calls[1]).toEqual(["pub_solicitar_conta", { p_loja_id: 1, p_comanda: "ABC-000001" }]);
  });
});

describe("tela — nome lembrado no aparelho", () => {
  let guardado;
  beforeEach(() => {
    guardado = new Map();
    vi.stubGlobal("localStorage", { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lembra por loja e telefone, aceitando máscara, e guarda só os cinco últimos", async () => {
    const { nomeLembrado, lembrarNome } = await import("./nomeNoAparelho.js");
    lembrarNome(1, "(11) 91111-0001", " Ana Souza ");
    expect(nomeLembrado(1, "11911110001")).toBe("Ana Souza");
    expect(nomeLembrado(2, "11911110001")).toBe("");
    expect(nomeLembrado(1, "11911110002")).toBe("");
    lembrarNome(1, "11911110001", "Ana S.");
    expect(nomeLembrado(1, "11911110001")).toBe("Ana S.");
    for (let i = 2; i <= 6; i += 1) lembrarNome(1, `1191111000${i}`, `Pessoa ${i}`);
    expect(nomeLembrado(1, "11911110001")).toBe("");
    expect(nomeLembrado(1, "11911110002")).toBe("Pessoa 2");
  });

  it("ignora dados incompletos e segue sem erro quando o armazenamento falha", async () => {
    const { nomeLembrado, lembrarNome } = await import("./nomeNoAparelho.js");
    lembrarNome(1, "119", "Ana");
    lembrarNome(1, "11911110001", "A");
    expect(guardado.size).toBe(0);
    guardado.set("pedidoPrime:cliente:1", "{quebrado");
    expect(nomeLembrado(1, "11911110001")).toBe("");
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); } });
    expect(() => lembrarNome(1, "11911110001", "Ana")).not.toThrow();
    expect(nomeLembrado(1, "11911110001")).toBe("");
  });

  it("o cardápio preenche o nome pelo aparelho, sem perguntar ao banco", () => {
    expect(cardapio).not.toMatch(/rpcBuscarClientePublico|buscarClientePorTelefone/);
    expect(cardapio).toContain("nomeLembrado(loja.id, telDig)");
    expect(cardapio.match(/lembrarNome\(loja\.id, telDig, cliente\)/g)).toHaveLength(2);
  });
});
