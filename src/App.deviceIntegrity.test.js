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
// Gate 8.36 — forward-fix: logout() agora é IDEMPOTENTE (reentrância guard
// no início). O popstate handler agora aguarda (await) logoutRef.current()
// antes de forcarUrlLogin(), e o heartbeat de tab_dispositivos passa a
// depender de currentUser (some em /login).
//
// Gate 8.36.1 — separa as duas responsabilidades que o Gate 8.36 tinha
// acoplado em logoutEmAndamentoRef:
//
// - logoutEmAndamentoRef volta a ser SOMENTE um guard de reentrância de
//   logout(): true durante a execução, false em finally (mesmo em falha
//   inesperada) — uma chamada de logout() futura legítima NUNCA fica presa
//   por um logout anterior já concluído.
// - sessaoDispositivoPronta (state próprio) passa a representar "existe uma
//   sessão de dispositivo pronta para este lifecycle": zerada (false) no
//   início do logout (antes de qualquer await) e SÓ volta a true depois de
//   um novo app_sessao_iniciar bem-sucedido (onSessionStarted em
//   useUserSessionHeartbeat.js). É quem continua bloqueando heartbeat/
//   revogação em /login e durante um login que ainda não terminou — não o
//   guard de reentrância.
// - a opção do hook antes chamada isLocalLogoutInProgress virou
//   shouldSuppressRevocation, com semântica mais ampla: suprime a
//   revogação remota quando logoutEmAndamentoRef.current É true OU quando
//   sessaoDispositivoPronta É false (não só durante o logout em si).
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

  it("é idempotente: guard de reentrância (return antecipado) ANTES de travar o heartbeat", () => {
    const idxGuard = corpoLogout.indexOf("if (logoutEmAndamentoRef.current) return;");
    const idxTrava = corpoLogout.indexOf("logoutEmAndamentoRef.current = true");
    expect(idxGuard).toBeGreaterThan(-1);
    expect(idxTrava).toBeGreaterThan(idxGuard);
  });

  it("bloqueia sessaoDispositivoPronta logo após travar o guard de reentrância, ANTES de liberar a mesa (Gate 8.36.1)", () => {
    const idxTrava = corpoLogout.indexOf("logoutEmAndamentoRef.current = true");
    const idxBloqueiaSessao = corpoLogout.indexOf("setSessaoDispositivoPronta(false)");
    const idxLiberarMesa = corpoLogout.indexOf("liberarMesaDispositivoNoLogout(");
    expect(idxBloqueiaSessao).toBeGreaterThan(idxTrava);
    expect(idxLiberarMesa).toBeGreaterThan(idxBloqueiaSessao);
  });

  it("VOLTA para false em finally, incondicionalmente — não é indicador permanente de sessão (Gate 8.36.1)", () => {
    const idxFinally = corpoLogout.lastIndexOf("} finally {");
    expect(idxFinally).toBeGreaterThan(-1);
    const trechoFinally = corpoLogout.slice(idxFinally);
    expect(trechoFinally).toMatch(/logoutEmAndamentoRef\.current\s*=\s*false/);
    // O reset mora FORA do try (dentro do finally), então roda mesmo se
    // alguma etapa do lifecycle lançar uma falha inesperada.
    const idxTry = corpoLogout.indexOf("try {");
    expect(idxTry).toBeGreaterThan(-1);
    expect(idxFinally).toBeGreaterThan(idxTry);
  });

  it("heartbeat (reportar) ignora o tick enquanto logoutEmAndamentoRef estiver ativo, sem usuário, ou sem sessão do dispositivo pronta", () => {
    const idxReportar = appSource.indexOf("const reportar = () => {");
    expect(idxReportar).toBeGreaterThan(-1);
    const trechoReportar = appSource.slice(idxReportar, idxReportar + 500);
    expect(trechoReportar).toMatch(/if\s*\(\s*logoutEmAndamentoRef\.current\s*\|\|\s*!currentUserRef\.current\s*\|\|\s*!sessaoDispositivoProntaRef\.current\s*\)\s*return;/);
  });

  it("o efeito de heartbeat de tab_dispositivos também exige sessaoDispositivoPronta no guard externo e nas deps", () => {
    const idxEfeito = appSource.indexOf("if (!dbReady || !currentUser?.id || !sessaoDispositivoPronta) return;");
    expect(idxEfeito).toBeGreaterThan(-1);
    const idxDeps = appSource.indexOf("}, [dbReady, currentUser?.id, lojaAtual, tableNumber, sessaoDispositivoPronta]);");
    expect(idxDeps).toBeGreaterThan(idxEfeito);
  });
});

describe("useUserSessionHeartbeat — sessaoDispositivoPronta habilitada após novo login (Gate 8.36.1)", () => {
  it("App.jsx passa shouldSuppressRevocation e onSessionStarted ao hook", () => {
    const idxHook = appSource.indexOf("useUserSessionHeartbeat(currentUser, {");
    const idxFimHook = appSource.indexOf("});", idxHook);
    const trechoHook = appSource.slice(idxHook, idxFimHook);
    // shouldSuppressRevocation combina AS DUAS condições: logout local em
    // andamento OU sessão do dispositivo ainda não pronta.
    expect(trechoHook).toMatch(/shouldSuppressRevocation:\s*\(\)\s*=>\s*logoutEmAndamentoRef\.current\s*\|\|\s*!sessaoDispositivoPronta/);
    // onSessionStarted não mexe mais em logoutEmAndamentoRef — só habilita
    // sessaoDispositivoPronta.
    expect(trechoHook).toMatch(/onSessionStarted:\s*\(\)\s*=>\s*\{\s*setSessaoDispositivoPronta\(true\);?\s*\}/);
    expect(trechoHook).not.toMatch(/onSessionStarted:[\s\S]*?logoutEmAndamentoRef\.current\s*=\s*false/);
  });

  it("onSessionRevoked tem defesa em profundidade contra logout local em andamento", () => {
    const idxHook = appSource.indexOf("useUserSessionHeartbeat(currentUser, {");
    const idxFimHook = appSource.indexOf("});", idxHook);
    const trechoHook = appSource.slice(idxHook, idxFimHook);
    expect(trechoHook).toMatch(/onSessionRevoked:\s*\(\)\s*=>\s*\{\s*[\s\S]*?if\s*\(\s*logoutEmAndamentoRef\.current\s*\)\s*return;/);
  });
});

describe("popstate aguarda logout() antes de forçar a URL de login (Gate 8.36)", () => {
  const idxOnPop = appSource.indexOf("const onPop = async () => {");
  const idxFimOnPop = appSource.indexOf("window.addEventListener(\"popstate\", onPop);");
  const corpoOnPop = appSource.slice(idxOnPop, idxFimOnPop);

  it("handler onPop existe e é assíncrono", () => {
    expect(idxOnPop).toBeGreaterThan(-1);
  });

  it("faz await de logoutRef.current() antes de forcarUrlLogin(), dentro de try/finally", () => {
    const idxAwaitLogout = corpoOnPop.indexOf("await logoutRef.current()");
    const idxFinally = corpoOnPop.indexOf("} finally {");
    const idxForcarUrlNoFinally = corpoOnPop.indexOf("forcarUrlLogin();", idxFinally);
    expect(idxAwaitLogout).toBeGreaterThan(-1);
    expect(idxFinally).toBeGreaterThan(idxAwaitLogout);
    expect(idxForcarUrlNoFinally).toBeGreaterThan(idxFinally);
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
