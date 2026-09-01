import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C10D3 — Fase 5: prova estática do fluxo de usuários/Auth.
//
// A Edge Function (supabase/functions/gerenciar-usuario-auth/index.ts) usa
// import "npm:@supabase/supabase-js" (sintaxe Deno) e não roda sob Vitest/
// Node — por isso ela é auditada por asserções no TEXTO-FONTE (mesmo padrão
// já usado pelos testes de migration SQL deste repositório), em vez de
// execução mockada como a rota Vercel (ver api/gerenciar-usuario-auth.test.js).
// ════════════════════════════════════════════════════════════

const edgeFnPath = "supabase/functions/gerenciar-usuario-auth/index.ts";
const edgeFn = readFileSync(edgeFnPath, "utf8");

const vercelRoutePath = "api/gerenciar-usuario-auth.js";
const vercelRoute = readFileSync(vercelRoutePath, "utf8");

const authMessagesPath = "src/login/authMessages.js";
const authMessages = readFileSync(authMessagesPath, "utf8");

describe("Fase 1 — Edge Function nunca persiste senha em texto claro", () => {
  it("Fase 5 #3: nenhuma atribuição a row.senha nem campo `senha:` em montarRowApp", () => {
    expect(edgeFn).not.toMatch(/row\.senha\s*=/);
    expect(edgeFn).not.toMatch(/\bsenha\s*:\s*p\.senha\b/);
    expect(edgeFn).not.toMatch(/\bsenha\?\s*:\s*string\b/); // parâmetro `senha` já não existe em montarRowApp
  });

  it("montarRowApp não aceita mais `senha` como campo do parâmetro", () => {
    const idxFn = edgeFn.indexOf("function montarRowApp(p:");
    expect(idxFn).toBeGreaterThan(-1);
    const idxFechamento = edgeFn.indexOf("\n}", edgeFn.indexOf("return row;", idxFn));
    const corpo = edgeFn.slice(idxFn, idxFechamento);
    expect(corpo).not.toMatch(/\bsenha\b/);
  });

  it("tab_usuarios.senha permanece intocado (nenhuma referência de escrita à coluna)", () => {
    expect(edgeFn).not.toMatch(/\.senha\s*=/);
    expect(edgeFn).not.toMatch(/["']senha["']\s*:/);
  });

  it("mantém criação/atualização em auth.users via Admin API (createUser/updateUserById)", () => {
    expect(edgeFn).toMatch(/admin\.auth\.admin\.createUser\(/);
    expect(edgeFn).toMatch(/admin\.auth\.admin\.updateUserById\(/);
  });

  it("mantém RBAC (operadorDoToken), isolamento de tenant (podeGerenciarLoja) e super_admin explícito", () => {
    expect(edgeFn).toMatch(/async function operadorDoToken/);
    expect(edgeFn).toMatch(/function podeGerenciarLoja/);
    expect(edgeFn).toMatch(/operador\.superAdmin/);
    expect(edgeFn).toMatch(/superAdmin: !!u\.super_admin/);
  });

  it("mantém checagem de usuário ativo e resolução de loja correta (lojaEfetiva)", () => {
    expect(edgeFn).toMatch(/u\.ativo === false/);
    expect(edgeFn).toMatch(/lojaEfetiva/);
  });

  it("Fase 5 #11: compatibilidade legada de senha_hash usa SOMENTE a RPC existente app_definir_senha_hash (nenhum mecanismo criptográfico novo)", () => {
    expect(edgeFn).toMatch(/admin\.rpc\(\s*["']app_definir_senha_hash["']/);
    // "bcrypt" só pode aparecer em comentário descrevendo o algoritmo já
    // usado pela RPC (Postgres) — nunca como import/lib JS local.
    expect(edgeFn).not.toMatch(/from\s+["']npm:bcrypt/);
    expect(edgeFn).not.toMatch(/import\(["']bcrypt/);
    expect(edgeFn).not.toMatch(/crypto\.subtle/);
    expect(edgeFn).not.toMatch(/gen_salt/); // gen_salt só existe dentro da RPC SQL, não no Deno
  });

  it("nunca retorna senha, senha_hash ou a service role no payload de resposta (json({...}) devolvido ao chamador)", () => {
    // A string "senha_hash" aparece legitimamente em comentários e no nome
    // da RPC app_definir_senha_hash — o que importa é que nenhum objeto
    // devolvido via json({...}) inclua esses campos.
    const chamadasJson = edgeFn.match(/\bjson\(\{[^}]*\}/g) || [];
    expect(chamadasJson.length).toBeGreaterThan(0);
    for (const c of chamadasJson) {
      expect(c).not.toMatch(/SERVICE_ROLE_KEY/);
      expect(c).not.toMatch(/senha_hash/);
      expect(c).not.toMatch(/\bsenha\s*:/);
    }
  });

  it("nenhum `.select()` (leitura ou escrita) em tab_usuarios pede a coluna senha/senha_hash", () => {
    const selects = edgeFn.match(/\.select\([^)]*\)/g) || [];
    expect(selects.length).toBeGreaterThan(0);
    for (const s of selects) {
      expect(s).not.toMatch(/senha/);
    }
  });

  it("os `.select()` que devolvem o perfil gravado (upsert/update de criar e atualizar) usam a allowlist COLS_USUARIO_SEGURAS", () => {
    const ocorrencias = edgeFn.match(/\.select\(COLS_USUARIO_SEGURAS\)/g) || [];
    // Uma para "criar" (upsert) e uma para cada ramo de "atualizar" (update/upsert) = 3.
    expect(ocorrencias.length).toBe(3);
    expect(edgeFn).toMatch(/const COLS_USUARIO_SEGURAS =/);
  });

  it("hash nunca é gerado no browser — todo o arquivo roda server-side (Deno.serve, service role)", () => {
    expect(edgeFn).toMatch(/Deno\.serve\(/);
    expect(edgeFn).toMatch(/SERVICE_ROLE_KEY/);
  });
});

describe("Fase 2 — rota Vercel não usa app_validar_login como prova do modo Supabase", () => {
  it("Fase 5 #10: nenhuma chamada a rpc/app_validar_login no arquivo", () => {
    expect(vercelRoute).not.toMatch(/rpc\/app_validar_login/);
  });

  it("credencialValida (verificação antiga baseada no RPC legado) foi removida", () => {
    expect(vercelRoute).not.toMatch(/function credencialValida/);
    expect(vercelRoute).not.toMatch(/await credencialValida\(/);
  });

  it("confirmarAuthProvisionado relê o Auth via Admin API (id + e-mail + não-banido), sem login via service role", () => {
    expect(vercelRoute).toMatch(/async function confirmarAuthProvisionado/);
    expect(vercelRoute).toMatch(/authAdmin\(`\/admin\/users\/\$\{authId\}`\)/);
    expect(vercelRoute).toMatch(/banned_until/);
    expect(vercelRoute).not.toMatch(/grant_type=password/);
    expect(vercelRoute).not.toMatch(/signInWithPassword/);
  });

  it("as três ações (criar/perfil/atualizar) chamam confirmarAuthProvisionado após gravar a senha", () => {
    const ocorrencias = vercelRoute.match(/await confirmarAuthProvisionado\(/g) || [];
    expect(ocorrencias.length).toBe(3);
  });
});

describe("Fase 3 — mensagem de login não mascara email_not_confirmed como senha incorreta", () => {
  it("email_not_confirmed tem mensagem distinta de 'E-mail ou senha incorretos.'", () => {
    const idxConfirmado = authMessages.indexOf("email_not_confirmed");
    expect(idxConfirmado).toBeGreaterThan(-1);
    const trechoAntes = authMessages.slice(Math.max(0, idxConfirmado - 200), idxConfirmado + 300);
    expect(trechoAntes).not.toMatch(/return "E-mail ou senha incorretos\."/);
  });

  it("a checagem de email_not_confirmed vem ANTES da checagem genérica de credencial inválida", () => {
    const idxConfirmado = authMessages.indexOf('includes("email_not_confirmed")');
    const idxGenerica = authMessages.indexOf('includes("incorret")');
    expect(idxConfirmado).toBeGreaterThan(-1);
    expect(idxGenerica).toBeGreaterThan(-1);
    expect(idxConfirmado).toBeLessThan(idxGenerica);
  });

  it("não revela detalhe técnico sensível na nova mensagem (sem stack/hash/token)", () => {
    const idx = authMessages.indexOf("Conta ainda não confirmada");
    expect(idx).toBeGreaterThan(-1);
    const linha = authMessages.slice(idx - 10, idx + 120);
    expect(linha).not.toMatch(/hash|token|service_role|stack/i);
  });
});

describe("Fase 5 #12/#13/#14 — nenhuma Migration 133; 131/132 permanecem byte-idênticas", () => {
  it("nenhum arquivo de Migration 133 existe em supabase/migrations", () => {
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^133[_.]/.test(f));
    expect(arquivos).toEqual([]);
  });

  it("Migration 131 permanece byte-idêntica (SHA-256)", () => {
    const buf = readFileSync("supabase/migrations/131_canonical_application_table_acl_hardening.sql");
    const hash = createHash("sha256").update(buf).digest("hex");
    expect(hash).toBe("b52f23523b86d35e3e60f905b28b544b82529201c71058a44a9f4d4272be7278");
  });

  it("Migration 132 permanece byte-idêntica (SHA-256)", () => {
    const buf = readFileSync("supabase/migrations/132_criar_pedido_autenticado_seguro.sql");
    const hash = createHash("sha256").update(buf).digest("hex");
    expect(hash).toBe("9df3baac30e4e2b29b5a095be6cb45744b3ffbb28891cc60a30147f73ff26161");
  });
});
