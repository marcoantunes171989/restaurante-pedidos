// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ParametrosCaixa from "./ParametrosCaixa";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, el;
const montar = async (props) => {
  el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => root.render(<ParametrosCaixa lojaId={9} semBanco={<p>cartao-antigo</p>} {...props} />));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
};
afterEach(() => { act(() => root?.unmount()); el?.remove(); root = el = null; });
const q = (id) => el.querySelector(`[data-testid="${id}"]`);
const digitar = async (id, valor) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(q(id), valor);
  q(id).dispatchEvent(new Event("input", { bubbles: true }));
});
const enviar = async () => act(async () => { el.querySelector('button[type="submit"]').click(); await new Promise((r) => setTimeout(r, 10)); });

const CONFIG = {
  taxaServico: { enabled: true, percent: 10, chargingRule: "opcional", partialStrategy: "proporcional_itens" },
  desconto: { percentualMax: 15, valorMax: null }, acrescimo: { percentualMax: null, valorMax: 20 }, definido: true,
};
const banco = () => ({ rpc: vi.fn(async (nome, args) => ({ data: nome === "app_parametros_caixa" ? CONFIG : { ...args.p_config, definido: true }, error: null })) });

describe("Configurações › Parâmetros do caixa", () => {
  it("carrega os limites da empresa e salva o que foi digitado", async () => {
    const supabase = banco();
    await montar({ supabase });
    expect(q("param-descontoPercentual").value).toBe("15");
    expect(q("param-acrescimoValor").value).toBe("20");
    await digitar("param-descontoValor", "50,00");
    await enviar();
    const [, args] = supabase.rpc.mock.calls.find(([n]) => n === "app_salvar_parametros_caixa");
    expect(args.p_loja_id).toBe(9);
    expect(args.p_config.desconto).toEqual({ percentualMax: 15, valorMax: 50 });
    expect(el.textContent).toContain("Parâmetros salvos");
  });
  it("não envia percentual acima de 99,99%", async () => {
    const supabase = banco();
    await montar({ supabase });
    await digitar("param-acrescimoPercentual", "100");
    await enviar();
    expect(supabase.rpc.mock.calls.some(([n]) => n === "app_salvar_parametros_caixa")).toBe(false);
    expect(el.querySelector('[role="alert"]').textContent).toContain("99,99%");
  });
  it("banco sem a migration 218 mostra o cartão anterior", async () => {
    await montar({ supabase: { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "x" } }) } });
    expect(el.textContent).toBe("cartao-antigo");
  });
});
