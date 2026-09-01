import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./gerenciar-usuario-auth.js";

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C10D3 — Fase 5: testes comportamentais da rota Vercel
// /api/gerenciar-usuario-auth (mocking global.fetch — sem HML, sem SQL
// remoto, sem Supabase CLI). Cobre a causa raiz do gate anterior
// (R0H-C5C10D2): usuário existente só em tab_usuarios, sem auth.users,
// recebe reset de senha pela tela /admin/users.
// ════════════════════════════════════════════════════════════

const SUPABASE_URL = "https://test.supabase.co";
const SERVICE_KEY = "test-service-role-key-nao-deve-vazar";

const OPERADOR_EMAIL = "gestor@lojax.com";
const OPERADOR_LOJA = 9;

function encEmail(email) {
  return encodeURIComponent(String(email).trim().toLowerCase());
}

const COLS =
  "id,email,loja_id,ativo,super_admin,ids_acesso,nome,perfil,cargo_id,permissoes_acoes";

function operadorRow({ superAdmin = false } = {}) {
  return {
    id: 1,
    email: OPERADOR_EMAIL,
    loja_id: OPERADOR_LOJA,
    ativo: true,
    super_admin: superAdmin,
    ids_acesso: superAdmin ? [] : ["admin"],
    nome: "Gestor Teste",
    perfil: "Gestor",
    cargo_id: null,
    permissoes_acoes: {},
  };
}

// Rotas fixas de qualquer requisição autenticada: resolve o operador
// (GET /auth/v1/user) e o carrega de tab_usuarios (RBAC).
function rotasOperador(operador) {
  return [
    {
      method: "GET",
      test: (url) => url === `${SUPABASE_URL}/auth/v1/user`,
      respond: () => ({ status: 200, body: { email: OPERADOR_EMAIL } }),
    },
    {
      method: "GET",
      test: (url) =>
        url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(OPERADOR_EMAIL)}`),
      respond: () => ({ status: 200, body: [operador] }),
    },
  ];
}

function makeFetchMock(routes) {
  const calls = [];
  const fn = vi.fn(async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    const urlStr = String(url);
    calls.push({ url: urlStr, method, body: opts.body ? JSON.parse(opts.body) : undefined });
    const rota = routes.find((r) => r.method === method && r.test(urlStr));
    if (!rota) {
      throw new Error(`Unmocked fetch chamado no teste: ${method} ${urlStr}`);
    }
    const { status = 200, body = {} } = rota.respond(urlStr, opts);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: { get: () => "application/json" },
    };
  });
  return { fn, calls };
}

function makeReq(body) {
  return {
    method: "POST",
    headers: { authorization: "Bearer fake-jwt-do-operador" },
    body,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    _headers: {},
    body: null,
    setHeader(k, v) {
      this._headers[k] = v;
    },
    end(payload) {
      this.body = payload;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

beforeEach(() => {
  process.env.SUPABASE_URL = SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_ANON_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gerenciar-usuario-auth (Vercel) — atualizar: usuário só em tab_usuarios, SEM auth.users", () => {
  it("Fase 5 #1: solicita CRIAÇÃO em auth.users quando o usuário só existe em tab_usuarios", async () => {
    const targetEmail = "cozinha.hamburgueria@demo.com";
    const rowAntes = {
      id: 25, email: targetEmail, loja_id: OPERADOR_LOJA, ativo: true,
      super_admin: false, ids_acesso: ["kitchen"], nome: "Cozinha Burger Station",
      perfil: "Operador", cargo_id: null, permissoes_acoes: {},
    };
    const authIdCriado = "auth-uuid-novo";

    const routes = [
      ...rotasOperador(operadorRow()),
      // 1) SELECT do usuário alvo (RBAC + dados atuais)
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: [rowAntes] }),
      },
      // 2) encontrarAuthPorEmail: filtro direto → vazio
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?email=${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      // 3) fallback paginado → vazio (usuário não existe em auth.users)
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      // 4) CRIAÇÃO em auth.users (é isso que provaria a correção da causa raiz)
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users`,
        respond: () => ({ status: 200, body: { id: authIdCriado, email: targetEmail, email_confirmed_at: new Date().toISOString() } }),
      },
      // 5) update do perfil em tab_usuarios (mantém loja_id/ids_acesso)
      {
        method: "PATCH",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?id=eq.25`),
        respond: () => ({ status: 200, body: [{ ...rowAntes, nome: "Cozinha Burger Station" }] }),
      },
      // 6) grava hash legado (compat) via RPC — nunca texto claro
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/rest/v1/rpc/app_definir_senha_hash`,
        respond: () => ({ status: 200, body: { ok: true } }),
      },
      // 7) confirmação pós-gravação: releitura do Auth (não usa app_validar_login)
      {
        method: "GET",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users/${authIdCriado}`,
        respond: () => ({ status: 200, body: { id: authIdCriado, email: targetEmail, banned_until: null } }),
      },
    ];
    const { fn, calls } = makeFetchMock(routes);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(
      makeReq({
        acao: "atualizar",
        email: targetEmail,
        emailAnterior: targetEmail,
        senha: "novaSenha123",
        nome: "Cozinha Burger Station",
        lojaId: OPERADOR_LOJA,
        idsAcesso: ["kitchen"],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);

    // A criação em auth.users REALMENTE foi solicitada.
    const chamadaCriacao = calls.find((c) => c.method === "POST" && c.url === `${SUPABASE_URL}/auth/v1/admin/users`);
    expect(chamadaCriacao).toBeTruthy();
    expect(chamadaCriacao.body.email).toBe(targetEmail);
    expect(chamadaCriacao.body.password).toBe("novaSenha123");

    // Compatibilidade legada: hash gravado via RPC existente.
    expect(calls.some((c) => c.url === `${SUPABASE_URL}/rest/v1/rpc/app_definir_senha_hash`)).toBe(true);

    // Nunca chama app_validar_login como prova de sucesso do modo Supabase.
    expect(calls.some((c) => c.url.includes("app_validar_login"))).toBe(false);
  });

  it("Fase 5 #2: usuário JÁ existe em auth.users → backend solicita UPDATE de senha (não cria duplicata)", async () => {
    const targetEmail = "ja.existe@demo.com";
    const authIdExistente = "auth-uuid-existente";
    const rowAntes = {
      id: 30, email: targetEmail, loja_id: OPERADOR_LOJA, ativo: true,
      super_admin: false, ids_acesso: ["cashier"], nome: "Caixa Teste",
      perfil: "Operador", cargo_id: null, permissoes_acoes: {},
    };

    const routes = [
      ...rotasOperador(operadorRow()),
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: [rowAntes] }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?email=${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: { users: [{ id: authIdExistente, email: targetEmail, user_metadata: {} }] } }),
      },
      {
        method: "PUT",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users/${authIdExistente}`,
        respond: () => ({ status: 200, body: { id: authIdExistente, email: targetEmail } }),
      },
      {
        method: "PATCH",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?id=eq.30`),
        respond: () => ({ status: 200, body: [rowAntes] }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/rest/v1/rpc/app_definir_senha_hash`,
        respond: () => ({ status: 200, body: { ok: true } }),
      },
      {
        method: "GET",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users/${authIdExistente}`,
        respond: () => ({ status: 200, body: { id: authIdExistente, email: targetEmail, banned_until: null } }),
      },
    ];
    const { fn, calls } = makeFetchMock(routes);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(
      makeReq({ acao: "atualizar", email: targetEmail, emailAnterior: targetEmail, senha: "outraSenha456" }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    // PUT (update), nunca POST de criação — não duplica a conta.
    expect(calls.some((c) => c.method === "PUT" && c.url === `${SUPABASE_URL}/auth/v1/admin/users/${authIdExistente}`)).toBe(true);
    expect(calls.some((c) => c.method === "POST" && c.url === `${SUPABASE_URL}/auth/v1/admin/users`)).toBe(false);
  });
});

describe("gerenciar-usuario-auth (Vercel) — nenhum segredo na resposta", () => {
  it("Fase 5 #4/#5/#6: resposta não contém senha, senha_hash nem a service role key", async () => {
    const targetEmail = "sem.segredo@demo.com";
    const authId = "auth-uuid-x";
    const rowComHash = {
      id: 40, email: targetEmail, loja_id: OPERADOR_LOJA, ativo: true,
      super_admin: false, ids_acesso: ["cashier"], nome: "X",
      perfil: "Operador", cargo_id: null, permissoes_acoes: {},
      // mesmo se o banco devolvesse a coluna por engano, semSegredo() deve remover:
      senha_hash: "$2a$10$naoDeveVazar", senha: null,
    };
    const routes = [
      ...rotasOperador(operadorRow()),
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: [rowComHash] }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?email=${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users`,
        respond: () => ({ status: 200, body: { id: authId, email: targetEmail } }),
      },
      {
        method: "PATCH",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?id=eq.40`),
        respond: () => ({ status: 200, body: [rowComHash] }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/rest/v1/rpc/app_definir_senha_hash`,
        respond: () => ({ status: 200, body: { ok: true } }),
      },
      {
        method: "GET",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users/${authId}`,
        respond: () => ({ status: 200, body: { id: authId, email: targetEmail, banned_until: null } }),
      },
    ];
    const { fn } = makeFetchMock(routes);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ acao: "atualizar", email: targetEmail, emailAnterior: targetEmail, senha: "abc12345" }), res);

    expect(res.statusCode).toBe(200);
    const raw = res.body;
    expect(raw).not.toMatch(/senha_hash/i);
    expect(raw).not.toMatch(/"senha"/i);
    expect(raw.includes(SERVICE_KEY)).toBe(false);
    expect(raw.toLowerCase()).not.toContain("service_role");
  });
});

describe("gerenciar-usuario-auth (Vercel) — RBAC cross-tenant fail-closed", () => {
  it("Fase 5 #7/#8: gestor da loja X NÃO consegue alterar usuário da loja Y", async () => {
    const targetEmail = "usuario.lojay@demo.com";
    const rowLojaY = {
      id: 50, email: targetEmail, loja_id: 999, ativo: true,
      super_admin: false, ids_acesso: ["cashier"], nome: "Y",
      perfil: "Operador", cargo_id: null, permissoes_acoes: {},
    };
    const routes = [
      ...rotasOperador(operadorRow({ superAdmin: false })),
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: [rowLojaY] }),
      },
    ];
    const { fn, calls } = makeFetchMock(routes);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ acao: "atualizar", email: targetEmail, emailAnterior: targetEmail, senha: "tentativa123" }), res);

    expect(res.statusCode).toBe(403);
    expect(res.json().ok).toBeFalsy();
    // Fail-closed: nenhuma escrita em Auth ou tab_usuarios foi tentada.
    expect(calls.some((c) => c.method === "POST" || c.method === "PUT" || c.method === "PATCH")).toBe(false);
  });

  it("Fase 5 #9: super_admin consegue alterar usuário de QUALQUER loja", async () => {
    const targetEmail = "usuario.lojaz@demo.com";
    const authId = "auth-uuid-super";
    const rowLojaZ = {
      id: 60, email: targetEmail, loja_id: 777, ativo: true,
      super_admin: false, ids_acesso: ["cashier"], nome: "Z",
      perfil: "Operador", cargo_id: null, permissoes_acoes: {},
    };
    const routes = [
      ...rotasOperador(operadorRow({ superAdmin: true })),
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: [rowLojaZ] }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?email=${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users`,
        respond: () => ({ status: 200, body: { id: authId, email: targetEmail } }),
      },
      {
        method: "PATCH",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?id=eq.60`),
        respond: () => ({ status: 200, body: [rowLojaZ] }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/rest/v1/rpc/app_definir_senha_hash`,
        respond: () => ({ status: 200, body: { ok: true } }),
      },
      {
        method: "GET",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users/${authId}`,
        respond: () => ({ status: 200, body: { id: authId, email: targetEmail, banned_until: null } }),
      },
    ];
    const { fn } = makeFetchMock(routes);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ acao: "atualizar", email: targetEmail, emailAnterior: targetEmail, senha: "superSenha123" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });
});

describe("gerenciar-usuario-auth (Vercel) — Fase 2: verificação de sucesso não usa app_validar_login", () => {
  it("Fase 5 #10: o texto-fonte da rota não chama mais rpc/app_validar_login", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./gerenciar-usuario-auth.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/rest\/v1\/rpc\/app_validar_login/);
    expect(src).not.toMatch(/function credencialValida/);
    // A nova confirmação relê o Auth via Admin API.
    expect(src).toMatch(/async function confirmarAuthProvisionado/);
    expect(src).toMatch(/admin\/users\/\$\{authId\}/);
  });

  it("Fase 5 #10 (comportamental): quando a releitura do Auth falha, a operação falha (PASSWORD_INCONSISTENT), sem tentar autenticar com service role", async () => {
    const targetEmail = "confirmacao.falha@demo.com";
    const authId = "auth-uuid-falha";
    const rowAntes = {
      id: 70, email: targetEmail, loja_id: OPERADOR_LOJA, ativo: true,
      super_admin: false, ids_acesso: ["cashier"], nome: "F",
      perfil: "Operador", cargo_id: null, permissoes_acoes: {},
    };
    const routes = [
      ...rotasOperador(operadorRow()),
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?email=ilike.${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: [rowAntes] }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?email=${encEmail(targetEmail)}`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      {
        method: "GET",
        test: (url) => url.startsWith(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=200`),
        respond: () => ({ status: 200, body: { users: [] } }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users`,
        respond: () => ({ status: 200, body: { id: authId, email: targetEmail } }),
      },
      {
        method: "PATCH",
        test: (url) => url.startsWith(`${SUPABASE_URL}/rest/v1/tab_usuarios?id=eq.70`),
        respond: () => ({ status: 200, body: [rowAntes] }),
      },
      {
        method: "POST",
        test: (url) => url === `${SUPABASE_URL}/rest/v1/rpc/app_definir_senha_hash`,
        respond: () => ({ status: 200, body: { ok: true } }),
      },
      // Releitura pós-gravação falha (ex.: e-mail divergente) → fail-closed.
      {
        method: "GET",
        test: (url) => url === `${SUPABASE_URL}/auth/v1/admin/users/${authId}`,
        respond: () => ({ status: 200, body: { id: authId, email: "outro@email.com", banned_until: null } }),
      },
    ];
    const { fn, calls } = makeFetchMock(routes);
    vi.stubGlobal("fetch", fn);

    const res = makeRes();
    await handler(makeReq({ acao: "atualizar", email: targetEmail, emailAnterior: targetEmail, senha: "senhaQualquer1" }), res);

    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe("PASSWORD_INCONSISTENT");
    // Nenhuma chamada tentou autenticar (password grant) com a service role.
    expect(calls.some((c) => c.url.includes("/token?grant_type=password"))).toBe(false);
  });
});

describe("gerenciar-usuario-auth (Vercel) — Fase 5 #11: hash legado só server-side", () => {
  it("definirSenhaHash grava via RPC (crypt/gen_salt no Postgres) — nenhum bcrypt/hash local no JS", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./gerenciar-usuario-auth.js", import.meta.url), "utf8");
    expect(src).toMatch(/rpc\/app_definir_senha_hash/);
    expect(src).not.toMatch(/require\(['"]bcrypt/);
    expect(src).not.toMatch(/from ['"]bcrypt/);
    expect(src).not.toMatch(/crypto\.createHash/);
  });
});
