// @vitest-environment jsdom
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERVALO_VERIFICACAO_SESSAO_MS, estadoSessaoAuth, vigiarSessaoAuth } from "./sessaoAuth.js";

const SESSAO = { access_token: "token-de-teste" };

function authFalso(inicial = { session: SESSAO, error: null }) {
  const ouvintes = new Set();
  const auth = {
    resposta: inicial,
    getSession: vi.fn(async () => ({ data: { session: auth.resposta.session }, error: auth.resposta.error })),
    onAuthStateChange: (callback) => {
      ouvintes.add(callback);
      return { data: { subscription: { unsubscribe: () => ouvintes.delete(callback) } } };
    },
    emitir: (evento, sessao) => ouvintes.forEach((callback) => callback(evento, sessao)),
    ouvintes,
  };
  return auth;
}
const AUSENTE = { session: null, error: null };
const SEM_REDE = { session: null, error: { name: "AuthRetryableFetchError", status: 0 } };

describe("estadoSessaoAuth", () => {
  it("presente, ausente e indefinida", async () => {
    expect(await estadoSessaoAuth(authFalso())).toBe("presente");
    expect(await estadoSessaoAuth(authFalso(AUSENTE))).toBe("ausente");
    expect(await estadoSessaoAuth(authFalso(SEM_REDE))).toBe("indefinida");
  });

  it("exceção do getSession não vira ausência", async () => {
    expect(await estadoSessaoAuth({ getSession: async () => { throw new Error("lock timeout"); } })).toBe("indefinida");
  });
});

describe("vigiarSessaoAuth", () => {
  let parar = null;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { parar?.(); parar = null; vi.useRealTimers(); });

  const avancar = (ms) => vi.advanceTimersByTimeAsync(ms);

  it("não avisa enquanto a sessão existe", async () => {
    const aoPerder = vi.fn();
    parar = vigiarSessaoAuth({ auth: authFalso(), aoPerder });
    await avancar(INTERVALO_VERIFICACAO_SESSAO_MS * 4);
    expect(aoPerder).not.toHaveBeenCalled();
  });

  it("percebe pela conferência periódica o armazenamento apagado sem evento", async () => {
    const auth = authFalso();
    const aoPerder = vi.fn();
    parar = vigiarSessaoAuth({ auth, aoPerder });
    await avancar(10);
    auth.resposta = AUSENTE;
    await avancar(INTERVALO_VERIFICACAO_SESSAO_MS);
    expect(aoPerder).toHaveBeenCalledTimes(1);
  });

  it.each(["focus", "online", "storage"])("confere na hora no evento %s da janela", async (evento) => {
    const auth = authFalso();
    const aoPerder = vi.fn();
    parar = vigiarSessaoAuth({ auth, aoPerder });
    await avancar(10);
    auth.resposta = AUSENTE;
    window.dispatchEvent(new Event(evento));
    await avancar(0);
    expect(aoPerder).toHaveBeenCalledTimes(1);
  });

  it("não chama o Auth de dentro do callback de evento", async () => {
    const auth = authFalso();
    parar = vigiarSessaoAuth({ auth, aoPerder: vi.fn() });
    await avancar(10);
    const antes = auth.getSession.mock.calls.length;
    auth.emitir("SIGNED_OUT", null);
    expect(auth.getSession.mock.calls.length).toBe(antes);
    await avancar(1);
    expect(auth.getSession.mock.calls.length).toBe(antes + 1);
  });

  it("ignora o SIGNED_OUT emitido pelo logout em andamento", async () => {
    const auth = authFalso();
    const aoPerder = vi.fn();
    let saindo = false;
    parar = vigiarSessaoAuth({ auth, aoPerder, suprimir: () => saindo });
    await avancar(10);
    saindo = true;
    auth.resposta = AUSENTE;
    auth.emitir("SIGNED_OUT", null);
    saindo = false; // logout terminou antes do temporizador
    await avancar(10);
    expect(aoPerder).not.toHaveBeenCalled();
  });

  it("falha de rede nunca avisa", async () => {
    const aoPerder = vi.fn();
    const auth = authFalso(SEM_REDE);
    parar = vigiarSessaoAuth({ auth, aoPerder });
    window.dispatchEvent(new Event("online"));
    await avancar(INTERVALO_VERIFICACAO_SESSAO_MS * 10);
    expect(aoPerder).not.toHaveBeenCalled();
  });

  it("vários gatilhos juntos avisam uma vez enquanto o aviso é tratado", async () => {
    const auth = authFalso(AUSENTE);
    let saiu = false;
    let concluir;
    const aoPerder = vi.fn(() => new Promise((ok) => { concluir = () => { saiu = true; ok(); }; }));
    parar = vigiarSessaoAuth({ auth, aoPerder, suprimir: () => saiu });
    await avancar(10);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("storage"));
    await avancar(INTERVALO_VERIFICACAO_SESSAO_MS * 2);
    concluir();
    await avancar(INTERVALO_VERIFICACAO_SESSAO_MS);
    expect(aoPerder).toHaveBeenCalledTimes(1);
  });

  it("cleanup remove ouvintes e temporizadores", async () => {
    const auth = authFalso();
    const aoPerder = vi.fn();
    vigiarSessaoAuth({ auth, aoPerder })();
    auth.resposta = AUSENTE;
    window.dispatchEvent(new Event("focus"));
    await avancar(INTERVALO_VERIFICACAO_SESSAO_MS * 3);
    expect(aoPerder).not.toHaveBeenCalled();
    expect(auth.ouvintes.size).toBe(0);
  });
});

// As regras acima dependem de como o supabase-js responde: conferidas com o cliente real, sem rede.
describe("estadoSessaoAuth com o supabase-js instalado", () => {
  const CHAVE = "sb-teste";
  const sessaoVencida = JSON.stringify({
    access_token: "a", refresh_token: "r", token_type: "bearer", expires_at: 1, user: { id: "u" },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  async function consultar(fetchFalso) {
    const cliente = createClient("https://pedido-prime-test.invalid", "chave-de-teste", {
      auth: { storageKey: CHAVE, autoRefreshToken: false },
      global: { fetch: fetchFalso },
    });
    const consulta = async () => {
      const estado = estadoSessaoAuth(cliente.auth);
      await vi.advanceTimersByTimeAsync(60_000);
      return estado;
    };
    return consulta;
  }

  it("sem chave no armazenamento: ausente", async () => {
    const consulta = await consultar(vi.fn());
    expect(await consulta()).toBe("ausente");
  });

  it("token vencido e rede fora: indefinida, e a sessão continua guardada", async () => {
    localStorage.setItem(CHAVE, sessaoVencida);
    const consulta = await consultar(vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await consulta()).toBe("indefinida");
    expect(await consulta()).toBe("indefinida");
    expect(localStorage.getItem(CHAVE)).not.toBeNull();
  });

  it("renovação recusada pelo servidor: a biblioteca apaga a sessão e ela passa a ausente", async () => {
    localStorage.setItem(CHAVE, sessaoVencida);
    const consulta = await consultar(vi.fn(async () => new Response(
      JSON.stringify({ code: "refresh_token_not_found", message: "Invalid Refresh Token" }),
      { status: 400, headers: { "content-type": "application/json" } },
    )));
    await consulta();
    expect(localStorage.getItem(CHAVE)).toBeNull();
    expect(await consulta()).toBe("ausente");
  });
});
