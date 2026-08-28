import { describe, expect, it, vi } from "vitest";

// cadastrarEmpresa() seeda 5 categorias padrão para toda loja nova
// (migration 124 moveu esse insert de tab_categorias direto para a RPC
// app_criar_categoria). Este teste comprova que a ordem sequencial
// original (1..5, pré-124) continua sendo enviada explicitamente via
// p_ordem — sem isso, as 5 categorias cairiam todas no default da coluna
// (ordem=0, migration 010) e ficariam desordenadas/empatadas no cardápio.
//
// Mocka @supabase/supabase-js inteiro: nenhuma chamada de rede real é
// feita (ambiente DEV, sem acesso a HML/PROD nesta suíte).
const rpcMock = vi.fn(async (nome, params) => {
  if (nome === "app_criar_loja") {
    return { data: { id: 42, nome: params.p_nome, prefixo: params.p_prefixo, ativo: true, plano: params.p_plano }, error: null };
  }
  if (nome === "app_criar_categoria") {
    return { data: { id: Math.random(), nome: params.p_nome, ativo: true, ordem: params.p_ordem, loja_id: params.p_loja_id }, error: null };
  }
  return { data: null, error: null };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: rpcMock,
    from: () => ({
      insert: () => Promise.resolve({ data: null, error: { message: "not mocked" } }),
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

// import.meta.env já traz VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY válidas
// via .env.local (mesmo carregamento do Vite usado por `npm run dev`/build)
// — supabase.js falha rápido no import se estiverem ausentes/inválidas.
const { cadastrarEmpresa } = await import("./supabase.js");

describe("cadastrarEmpresa — seed de categorias padrão", () => {
  it("preserva a ordem sequencial original (1..5) das 5 categorias padrão", async () => {
    rpcMock.mockClear();

    await cadastrarEmpresa({ nomeLoja: "Loja Teste", prefixo: "TST" });

    const chamadasCategoria = rpcMock.mock.calls.filter(([nome]) => nome === "app_criar_categoria");

    expect(chamadasCategoria).toHaveLength(5);
    expect(chamadasCategoria.map(([, params]) => params.p_nome)).toEqual([
      "Entradas", "Pratos principais", "Lanches", "Bebidas", "Sobremesas",
    ]);
    expect(chamadasCategoria.map(([, params]) => params.p_ordem)).toEqual([1, 2, 3, 4, 5]);
    // Todas na loja recém-criada (id retornado por app_criar_loja), nunca em outra.
    chamadasCategoria.forEach(([, params]) => expect(params.p_loja_id).toBe(42));
  });
});
