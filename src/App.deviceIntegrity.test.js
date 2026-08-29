// @vitest-environment jsdom
//
// Heartbeat de dispositivo (App.jsx) após takeover de mesa (migration 125):
// se o servidor rejeitar o heartbeat com mesa_em_uso_outro_dispositivo ou
// device_session_mismatch enquanto este tablet ainda acha que está
// vinculado a uma mesa, o app precisa invalidar a associação local
// (setTableNumber("")) em vez de continuar operando silenciosamente como
// dono da mesa. `erroExigeNovaSelecaoMesa` é o predicado puro que decide
// isso — testado isoladamente (o efeito em si mora dentro do componente
// gigante RestaurantePedidoApp, não vale a pena montá-lo inteiro aqui).
//
// Gate 8.29 — lifecycle de logout do tablet: `logout()` precisa liberar a
// mesa (mesa:null) ANTES de encerrarSessaoAcesso()/logoutSupabaseAuth()
// invalidarem a prova de sessão (session_token/JWT) exigida por
// app_dispositivo_registrar (migration 125); e o heartbeat periódico
// precisa ficar mudo durante esse cleanup (logoutEmAndamentoRef), senão
// pode reescrever mesa:"<atual>" por cima da liberação em andamento.
// A ORDEM relativa dentro de logout() e o guard do heartbeat, por serem
// puro sequenciamento dentro do componente gigante (não vale a pena montar
// inteiro aqui), são cobertos por sentinela estrutural sobre o código-fonte
// real — os mesmos que travam se alguém reordenar/remover os trechos.
//
// Gate 8.29.1 — `liberarMesaDispositivoNoLogout` (a peça com lógica de
// verdade: decide SE chama a RPC e nunca deixa uma falha propagar) foi
// extraída para src/lib/deviceLifecycle.js (só para remover a regressão de
// lint react-refresh/only-export-components de App.jsx; nenhum
// comportamento mudou) — seus testes de runtime agora moram em
// src/lib/deviceLifecycle.test.js, sem precisar importar este arquivo
// inteiro. Aqui continuamos testando só a ORDEM em que logout() a chama
// (sentinela estrutural sobre o texto-fonte, abaixo).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: () => Promise.resolve({ data: { ok: true }, error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }),
    storage: { from: () => ({}) },
    channel: () => ({ on: () => ({ subscribe: () => {} }) }),
    removeChannel: () => {},
  }),
}));

const { erroExigeNovaSelecaoMesa } = await import("./App.jsx");
const appSource = readFileSync("src/App.jsx", "utf8");

describe("erroExigeNovaSelecaoMesa — heartbeat após takeover (migration 125)", () => {
  it("exige nova seleção quando o servidor recusa por mesa já tomada por outro dispositivo", () => {
    expect(erroExigeNovaSelecaoMesa("mesa_em_uso_outro_dispositivo")).toBe(true);
  });

  it("exige nova seleção quando a sessão local não bate mais (device_session_mismatch)", () => {
    expect(erroExigeNovaSelecaoMesa("device_session_mismatch")).toBe(true);
  });

  it("NÃO exige nova seleção para erros transitórios comuns (rede, timeout, etc.)", () => {
    expect(erroExigeNovaSelecaoMesa("Failed to fetch")).toBe(false);
    expect(erroExigeNovaSelecaoMesa("timeout")).toBe(false);
    expect(erroExigeNovaSelecaoMesa("")).toBe(false);
    expect(erroExigeNovaSelecaoMesa(undefined)).toBe(false);
  });
});

describe("logout() — ordem segura e trava do heartbeat (estrutural, Gate 8.29)", () => {
  const inicioLogout = appSource.indexOf("async function logout() {");
  const fimLogout = appSource.indexOf("logoutRef.current = logout;");
  const corpoLogout = appSource.slice(inicioLogout, fimLogout);

  it("função logout() existe e foi localizada para inspeção", () => {
    expect(inicioLogout).toBeGreaterThan(-1);
    expect(fimLogout).toBeGreaterThan(inicioLogout);
  });

  it("trava o heartbeat (logoutEmAndamentoRef) ANTES de liberar a mesa", () => {
    const idxTrava = corpoLogout.indexOf("logoutEmAndamentoRef.current = true");
    const idxLiberarMesa = corpoLogout.indexOf("liberarMesaDispositivoNoLogout(");
    expect(idxTrava).toBeGreaterThan(-1);
    expect(idxLiberarMesa).toBeGreaterThan(idxTrava);
  });

  it("libera a mesa ANTES de encerrarSessaoAcesso() e de logoutSupabaseAuth()", () => {
    const idxLiberarMesa = corpoLogout.indexOf("liberarMesaDispositivoNoLogout(");
    // "encerrarSessaoAcesso({" (com a chave) é a CHAMADA real — o comentário
    // logo acima menciona "encerrarSessaoAcesso()" (sem argumento) só como
    // referência textual, e apareceria antes por engano se buscado sem a chave.
    const idxEncerrarSessao = corpoLogout.indexOf("encerrarSessaoAcesso({");
    const idxLogoutAuth = corpoLogout.indexOf("await logoutSupabaseAuth()");
    expect(idxLiberarMesa).toBeGreaterThan(-1);
    expect(idxEncerrarSessao).toBeGreaterThan(idxLiberarMesa);
    expect(idxLogoutAuth).toBeGreaterThan(idxLiberarMesa);
  });

  it("reabre o heartbeat (logoutEmAndamentoRef = false) só no final, depois de tudo", () => {
    const idxLogoutAuth = corpoLogout.indexOf("logoutSupabaseAuth()");
    const idxDestrava = corpoLogout.lastIndexOf("logoutEmAndamentoRef.current = false");
    expect(idxDestrava).toBeGreaterThan(idxLogoutAuth);
  });

  it("heartbeat (reportar) ignora o tick enquanto logoutEmAndamentoRef estiver ativo", () => {
    const idxReportar = appSource.indexOf("const reportar = () => {");
    expect(idxReportar).toBeGreaterThan(-1);
    const trechoReportar = appSource.slice(idxReportar, idxReportar + 400);
    expect(trechoReportar).toMatch(/if\s*\(\s*logoutEmAndamentoRef\.current\s*\)\s*return;/);
  });
});

describe("definirMesaTablet — troca direta permanece atômica (estrutural, Gate 8.29)", () => {
  const idxFuncao = appSource.indexOf("const definirMesaTablet = async (numero)");
  const trechoFuncao = appSource.slice(idxFuncao, idxFuncao + 800);

  it("setTableNumber só ocorre DEPOIS do await registrarDispositivo (nunca antes)", () => {
    const idxAwait = trechoFuncao.indexOf("await registrarDispositivo(");
    const idxSet = trechoFuncao.indexOf("setTableNumber(String(numero))");
    expect(idxAwait).toBeGreaterThan(-1);
    expect(idxSet).toBeGreaterThan(idxAwait);
  });

  it("troca é UMA única chamada a registrarDispositivo (sem mesa:null antes de registrar a nova)", () => {
    const chamadas = trechoFuncao.match(/registrarDispositivo\(/g) || [];
    expect(chamadas).toHaveLength(1);
  });
});

describe("nenhuma escrita direta em tab_dispositivos (regressão, Gate 8.29)", () => {
  it("App.jsx não chama .from('tab_dispositivos')", () => {
    expect(appSource).not.toMatch(/\.from\(\s*['"]tab_dispositivos['"]\s*\)/);
  });
});
