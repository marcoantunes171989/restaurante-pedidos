// @vitest-environment jsdom
// Validade dos pontos (migration 228): o que a tela pede ao banco e mostra.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarPontos, comSinal, diaDoRelatorio, linhaCsvDosPontos, registrarVencimentos, rotuloDoLancamento } from "../../../lib/relatorios/pontos.js";
import PontosUsadosVencidos from "./PontosUsadosVencidos.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (tela) => { el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el); await act(async () => root.render(tela)); };
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; document.body.innerHTML = ""; });
const texto = () => document.body.textContent.replace(/\s/g, " ");
const banco = (respostas) => ({ rpc: vi.fn(async (nome) => ({ data: respostas[nome] ?? null, error: null })) });

const LINHA = { id: 9, quando: "2026-11-27T18:00:00Z", grupo: "usado", pontos: -300, valor: 3, clienteId: 4, cliente: "Bia", telefone: "11922222222", vendaId: 2, pedidos: ["PED-9"], cupom: "DEZ", notas: [{ modelo: 65, numero: 12, status: "autorizado", ambiente: "producao" }] };
const RELATORIO = { total: 1, resumo: { usados: 300, valorUsado: 3, vencidos: 80, aVencer: 40, emCirculacao: 500, clientes: 1 }, porDia: [{ dia: "2026-11-27", usados: 300, vencidos: 80 }], linhas: [LINHA] };

describe("textos dos pontos", () => {
  it("nomeia ganho, uso, vencimento e os estornos", () => {
    expect(rotuloDoLancamento({ tipo: "earn", pontos: 5 })).toBe("Ganho");
    expect(rotuloDoLancamento({ tipo: "earn", pontos: -5 })).toBe("Estorno de ganho");
    expect(rotuloDoLancamento({ tipo: "redeem", pontos: -5 })).toBe("Uso");
    expect(rotuloDoLancamento({ tipo: "redeem", pontos: 5 })).toBe("Estorno de uso");
    expect(rotuloDoLancamento({ tipo: "expire", pontos: -5 })).toBe("Vencimento");
    expect(rotuloDoLancamento({ tipo: "expire", pontos: 5 })).toBe("Vencimento desfeito");
    expect(rotuloDoLancamento({ tipo: "adjust", pontos: 5 })).toBe("Ajuste");
    expect([comSinal(5), comSinal(-1200), comSinal(0)]).toEqual(["+5", "−1.200", "0"]);
    expect(diaDoRelatorio("2026-11-27")).toBe("27/11/2026");
  });
  it("exportação leva nota, cupom e valor", () => {
    const csv = linhaCsvDosPontos(LINHA);
    expect(csv).toContain("NFC-e 12 · autorizada");
    expect(csv).toContain("DEZ");
    expect(csv).toContain(-300);
  });
  it("registrar vencimentos nunca atrapalha a tela", async () => {
    expect(await registrarVencimentos(null, 1)).toBeNull();
    expect(await registrarVencimentos({ rpc: async () => ({ data: null, error: { code: "PGRST202" } }) }, 1)).toBeNull();
    expect(await registrarVencimentos({ rpc: async () => { throw new Error("sem rede"); } }, 1)).toBeNull();
    expect(await buscarPontos({ rpc: async () => ({ data: null, error: { code: "42883" } }) }, { lojaId: 1 })).toEqual({ ausente: true });
  });
});

describe("pontos usados e vencidos", () => {
  it("registra os vencimentos antes de ler, mostra os totais e abre o histórico do cliente", async () => {
    const supabase = banco({
      app_pontos_relatorio: RELATORIO,
      app_pontos_cliente: { cliente: { id: 4, nome: "Bia" }, saldo: 500, aVencer: [{ pontos: 40, venceEm: "2026-12-20T02:59:59Z" }], movimentos: [{ id: 1, tipo: "expire", pontos: -80, quando: LINHA.quando }], compras: [{ vendaId: 2, quando: LINHA.quando, total: 50, formas: [], itens: "5× Burger", estornada: true }] },
    });
    await montar(<PontosUsadosVencidos supabase={supabase} lojaId={9} />);
    expect(supabase.rpc.mock.calls.map((c) => c[0])).toEqual(["app_pontos_expirar", "app_pontos_relatorio"]);
    expect(supabase.rpc.mock.calls[1][1]).toMatchObject({ p_loja_id: 9, p_pagina: 1, p_tipo: null });
    expect(texto()).toContain("R$ 3,00 em pagamentos");
    expect(texto()).toContain("Pontos vencidos");
    expect(texto()).toContain("PED-9 · NFC-e 12 · autorizada");
    expect(texto()).toContain("27/11/2026");
    await act(async () => document.querySelector('[data-testid="ponto-9"]').click());
    expect(supabase.rpc).toHaveBeenLastCalledWith("app_pontos_cliente", { p_loja_id: 9, p_cliente_id: 4 });
    expect(texto()).toContain("Vencimento");
    expect(texto()).toContain("5× Burger");
    expect(texto()).toContain("Estornada");
    expect(texto()).toContain("40 pts em 19/12/2026");
  });
  it("sem empresa não consulta; banco sem a migration avisa", async () => {
    const vazio = banco({});
    await montar(<PontosUsadosVencidos supabase={vazio} lojaId={null} />);
    expect(vazio.rpc).not.toHaveBeenCalled();
    act(() => root.unmount());
    await montar(<PontosUsadosVencidos supabase={{ rpc: vi.fn(async () => ({ data: null, error: { code: "PGRST202" } })) }} lojaId={9} />);
    expect(texto()).toContain("ainda não disponíveis");
  });
});

describe("banco", () => {
  const sql = readFileSync("supabase/migrations/228_validade_dos_pontos.sql", "utf8").replace(/\r\n/g, "\n");
  it("tabelas novas fechadas, consumo imutável e painel só de quem administra", () => {
    expect(sql).toContain("alter table public.tab_fidelidade_lote enable row level security;");
    expect(sql).toContain("revoke all on table public.tab_fidelidade_lote, public.tab_fidelidade_consumo from public, anon, authenticated;");
    expect(sql).toContain("create trigger trg_fid_consumo_imutavel before update or delete on public.tab_fidelidade_consumo");
    expect(sql.match(/if p_loja_id is null or not public\.app_pp_gestor_da_loja\(p_loja_id\) then raise exception 'forbidden'; end if;/g)).toHaveLength(2);
    expect(sql).not.toMatch(/delete from public\.tab_fidelidade|update public\.tab_fidelidade_transacoes/);
  });
});
