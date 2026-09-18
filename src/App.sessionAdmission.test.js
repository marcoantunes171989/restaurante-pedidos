import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mensagemErroAcesso, mensagemPorCodigoAuth } from "./login/authMessages.js";
import { ACCESS_HEARTBEAT_MS } from "./lib/accessControl/constants.js";

const appSource = readFileSync("src/App.jsx", "utf8");
const apiSource = readFileSync("src/lib/accessControl/api.js", "utf8");
const hookSource = readFileSync("src/hooks/useUserSessionHeartbeat.js", "utf8");

describe("PDB-I1B — admissão canônica no fluxo de auth", () => {
  it("login legado e login Supabase exigem admissão antes de currentUser", () => {
    const inicioLegacy = appSource.indexOf("async function login(credsOverride)");
    const inicioSupabase = appSource.indexOf("async function loginComSupabaseAuth");
    const fimSupabase = appSource.indexOf("async function logout()");
    const corpoLegacy = appSource.slice(inicioLegacy, inicioSupabase);
    const corpoSupabase = appSource.slice(inicioSupabase, fimSupabase);

    expect(corpoLegacy.indexOf("exigirAdmissaoCanonica")).toBeGreaterThan(-1);
    expect(corpoLegacy.indexOf("exigirAdmissaoCanonica")).toBeLessThan(corpoLegacy.indexOf("aplicarLogin("));
    expect(corpoSupabase.indexOf("exigirAdmissaoCanonica")).toBeGreaterThan(-1);
    expect(corpoSupabase.indexOf("exigirAdmissaoCanonica")).toBeLessThan(corpoSupabase.indexOf("CHAVE_RESTORE_ONCE"));
    expect(corpoSupabase).toMatch(/logoutSupabaseAuth/);
  });

  it("bootstrap de JWT existente não aplica currentUser sem admissão", () => {
    const inicio = appSource.indexOf("Restaura sessão no F5");
    const fim = appSource.indexOf("Sincroniza a URL com a tela de login");
    const corpo = appSource.slice(inicio, fim);
    expect(corpo.indexOf("exigirAdmissaoCanonica")).toBeGreaterThan(-1);
    expect(corpo.indexOf("exigirAdmissaoCanonica")).toBeLessThan(corpo.indexOf("aplicarLogin(u"));
    expect(corpo).toMatch(/ehBloqueioManutencao/);
    expect(corpo).toMatch(/logoutSupabaseAuth/);
  });

  it("logout tenta close canônico via encerrarSessaoAcesso e não prende o usuário", () => {
    const inicio = appSource.indexOf("async function logout()");
    const fim = appSource.indexOf("logoutRef.current = logout;");
    const corpo = appSource.slice(inicio, fim);
    expect(corpo).toMatch(/encerrarSessaoAcesso/);
    expect(corpo).toMatch(/best-effort/);
    expect(apiSource).toMatch(/encerrarSessaoCanonica/);
    const idxCanonical = apiSource.indexOf("try { await encerrarSessaoCanonica(); }");
    const idxLegacy = apiSource.indexOf('supabase.rpc("app_sessao_encerrar"');
    expect(idxCanonical).toBeGreaterThan(-1);
    expect(idxCanonical).toBeLessThan(idxLegacy);
  });

  it("manutenção é distinguível de senha inválida e não persiste senha para retry", () => {
    expect(mensagemPorCodigoAuth("MAINTENANCE_LOGIN_LOCKED")).toMatch(/manutenção/i);
    expect(mensagemPorCodigoAuth("MAINTENANCE_LOGIN_LOCKED")).not.toMatch(/senha/i);
    expect(mensagemPorCodigoAuth("INVALID_CREDENTIALS")).toMatch(/senha/i);
    expect(mensagemErroAcesso("MAINTENANCE_LOGIN_LOCKED")).toMatch(/manutenção/i);
    expect(mensagemErroAcesso("Invalid login credentials")).toBe("E-mail ou senha incorretos.");
    expect(appSource).toMatch(/setLoginForm\(\(f\) => \(\{ \.\.\.f, password: "" \}\)\)/);
  });

  it("heartbeat canônico entra no timer de 45s existente, sem segundo interval", () => {
    expect(ACCESS_HEARTBEAT_MS).toBe(45_000);
    expect(hookSource).toMatch(/setInterval\(tick, ACCESS_HEARTBEAT_MS\)/);
    expect(hookSource).toMatch(/MAINTENANCE_LOGIN_LOCKED/);
    expect(hookSource).toMatch(/result\?\.status === "maintenance"/);
    const intervals = hookSource.match(/setInterval\(/g) || [];
    expect(intervals).toHaveLength(1);
    expect(apiSource).toMatch(/heartbeatSessaoCanonica/);
    expect(apiSource).toMatch(/app_canonical_session_heartbeat/);
  });

  it("não persiste password no payload de admissão/close", () => {
    expect(apiSource).not.toMatch(/p_password/);
    expect(apiSource).not.toMatch(/p_access_token/);
    expect(apiSource).not.toMatch(/p_refresh_token/);
  });
});
