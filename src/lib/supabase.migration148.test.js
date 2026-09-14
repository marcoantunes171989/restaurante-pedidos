import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sqlPath = "supabase/migrations/148_maintenance_rpc_guard_device_heartbeat.sql";
const sql = readFileSync(sqlPath, "utf8");
const sqlSemComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
  .join("\n");

const migration125 = readFileSync(
  "supabase/migrations/125_dispositivos_sessao_seguros.sql",
  "utf8",
);
const migration140 = readFileSync("supabase/migrations/140_maintenance_state.sql", "utf8");
const migration141 = readFileSync("supabase/migrations/141_maintenance_operations.sql", "utf8");
const migration142 = readFileSync("supabase/migrations/142_maintenance_write_assert.sql", "utf8");
const migration143 = readFileSync(
  "supabase/migrations/143_maintenance_rpc_guard_allowlist.sql",
  "utf8",
);
const migration144 = readFileSync(
  "supabase/migrations/144_maintenance_table_guard_triggers.sql",
  "utf8",
);
const migration145 = readFileSync(
  "supabase/migrations/145_maintenance_rpc_guard_cupons.sql",
  "utf8",
);
const migration146 = readFileSync(
  "supabase/migrations/146_maintenance_rpc_guard_produtos.sql",
  "utf8",
);
const migration147 = readFileSync(
  "supabase/migrations/147_maintenance_rpc_guard_admin_final.sql",
  "utf8",
);

const NOME_FN = "app_dispositivo_registrar";

const GUARD_RE =
  /perform\s+public\.app_assert_business_write_allowed\s*\(\s*null\s*,\s*null\s*\)\s*;/i;

function guardsEm(texto) {
  return (
    texto.match(
      /perform\s+public\.app_assert_business_write_allowed\s*\(\s*null\s*,\s*null\s*\)\s*;/gi,
    ) || []
  );
}

function grantsDe(texto) {
  return texto.match(/\bgrant\b[^;]*;/gi) || [];
}

function revokesDe(texto) {
  return texto.match(/\brevoke\b[^;]*;/gi) || [];
}

function trechoFuncao(texto, nome) {
  const re = new RegExp(`create or replace function public\\.${nome}\\s*\\([\\s\\S]*?\\$\\$;`, "i");
  const match = texto.match(re);
  expect(match, `função ${nome} não encontrada`).toBeTruthy();
  return match[0];
}

function corpoDaFuncao(texto, nome) {
  const trecho = trechoFuncao(texto, nome);
  const match = trecho.match(/as\s+\$\$([\s\S]*?)\$\$;/i);
  expect(match, `corpo de ${nome} não encontrado`).toBeTruthy();
  return match[1];
}

function semGuard(trecho) {
  return trecho.replace(
    /\r?\n[ \t]*perform public\.app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)\s*;[ \t]*/gi,
    "",
  );
}

function normalizar(texto) {
  return texto.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();
}

function idxPrimeiroDml(corpo) {
  const padroes = [/\binsert\s+into\s+public\./i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i];
  const idxs = padroes.map((re) => corpo.search(re)).filter((idx) => idx >= 0);
  expect(idxs.length, "DML não encontrado no corpo").toBeGreaterThan(0);
  return Math.min(...idxs);
}

describe("migration 148 — existência e transação", () => {
  it("arquivo 148 existe, é legível e é único", () => {
    expect(sql.length).toBeGreaterThan(0);
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^148[_.]/.test(f));
    expect(arquivos).toEqual(["148_maintenance_rpc_guard_device_heartbeat.sql"]);
  });

  it("é transacional (BEGIN/COMMIT)", () => {
    expect(sql).toMatch(/^\s*begin\s*;/im);
    expect(sql).toMatch(/^\s*commit\s*;/im);
  });

  it("COMMIT é o último statement executável", () => {
    const semFinal = sqlSemComentarios.replace(/\s+$/, "");
    expect(semFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });
});

describe("migration 148 — 125 e 140–147 intactas", () => {
  it("não modifica o arquivo da migration 125", () => {
    expect(migration125).toMatch(
      /create or replace function public\.app_dispositivo_registrar\s*\(/i,
    );
    expect(migration125).not.toMatch(/app_assert_business_write_allowed/i);
    expect(migration125).toMatch(/device_session_mismatch/i);
    expect(migration125).toMatch(/mesa_em_uso_outro_dispositivo/i);
  });

  it("não modifica as migrations 140, 141 e 142", () => {
    expect(migration140).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration141).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration142).toMatch(/create function public\.app_assert_business_write_allowed/i);
    expect(migration142).not.toMatch(/app_dispositivo_registrar/i);
  });

  it("não modifica as migrations 143 a 147", () => {
    expect(migration143).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration144).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration145).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration146).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration147).not.toMatch(/app_dispositivo_registrar/i);
    expect(migration143).toMatch(/app_criar_mesa|app_atualizar_mesa/i);
    expect(migration144).toMatch(/postcheck 144/i);
    expect(migration145).toMatch(/app_criar_cupom/i);
    expect(migration146).toMatch(/app_criar_produto/i);
    expect(migration147).toMatch(/app_atualizar_loja/i);
  });
});

describe("migration 148 — precheck fail-closed", () => {
  it("possui precheck 148 antes do CREATE OR REPLACE", () => {
    expect(sql).toMatch(/precheck 148/i);
    const idxPrecheck = sql.search(/precheck 148/i);
    const idxCreate = sql.search(/create or replace function public\.app_dispositivo_registrar/i);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(idxPrecheck);
  });

  it("exige assert da 142 e a RPC existente, e recusa se 148 já aplicada conceitualmente", () => {
    expect(sqlSemComentarios).toMatch(
      /public\.app_assert_business_write_allowed\(uuid, text\) não existe \(migration 142 ausente\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /já contém o guard \(migration 148 já aplicada conceitualmente\)/i,
    );
    expect(sqlSemComentarios).toMatch(new RegExp(NOME_FN, "i"));
  });

  it("rejeita ambiguidade/overload não previsto (exatamente 1 função)", () => {
    expect(sqlSemComentarios).toMatch(
      /esperado exatamente 1 overload de app_dispositivo_registrar/i,
    );
    expect(sqlSemComentarios).toMatch(/proname = 'app_dispositivo_registrar'/i);
  });

  it("precheck valida owner/SECURITY DEFINER/search_path/ACL do assert e da RPC antes do CREATE OR REPLACE", () => {
    const idxCreate = sql.search(/create or replace function public\.app_dispositivo_registrar/i);
    const blocoPrecheck = sqlSemComentarios.slice(
      sqlSemComentarios.search(/precheck 148/i),
      sqlSemComentarios.search(/create or replace function public\.app_dispositivo_registrar/i),
    );
    expect(idxCreate).toBeGreaterThan(-1);
    expect(blocoPrecheck).toMatch(/owner deveria ser postgres/i);
    expect(blocoPrecheck).toMatch(/deveria ser SECURITY DEFINER/i);
    expect(blocoPrecheck).toMatch(/proconfig deveria conter search_path=public/i);
    expect(blocoPrecheck).toMatch(/anon NÃO deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/service_role NÃO deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/authenticated deveria ter EXECUTE/i);
    expect(blocoPrecheck).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
  });

  it("tira um snapshot do ACL (proacl) da RPC antes do CREATE OR REPLACE", () => {
    expect(sqlSemComentarios).toMatch(/_mig148_acl_snapshot/i);
    expect(sqlSemComentarios).toMatch(/insert into pg_temp\._mig148_acl_snapshot/i);
    const idxSnapshot = sqlSemComentarios.search(/insert into pg_temp\._mig148_acl_snapshot/i);
    const idxCreate = sqlSemComentarios.search(
      /create or replace function public\.app_dispositivo_registrar/i,
    );
    expect(idxSnapshot).toBeGreaterThan(-1);
    expect(idxSnapshot).toBeLessThan(idxCreate);
  });

  it("precheck confirma existência das RPCs/objetos fora de escopo sem redefini-los", () => {
    const foraDeEscopo = [
      "app_sessao_heartbeat",
      "app_page_stay_iniciar",
      "app_page_stay_encerrar",
      "app_dispositivo_renomear",
      "app_dispositivo_remover",
      "app_dispositivo_bloquear",
      "app_dispositivo_desbloquear",
    ];
    for (const nome of foraDeEscopo) {
      expect(sqlSemComentarios).toMatch(new RegExp(nome, "i"));
      expect(sqlSemComentarios).not.toMatch(
        new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nome}`, "i"),
      );
    }
  });
});

describe("migration 148 — exatamente 1 CREATE OR REPLACE e a assinatura correta", () => {
  it("contém exatamente 1 CREATE OR REPLACE FUNCTION", () => {
    const creates = sqlSemComentarios.match(/create\s+or\s+replace\s+function/gi) || [];
    expect(creates).toHaveLength(1);
  });

  it("recria exatamente app_dispositivo_registrar, com args e return type corretos", () => {
    const encontrados = [
      ...sqlSemComentarios.matchAll(
        /create\s+or\s+replace\s+function\s+public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\s+(jsonb)/gi,
      ),
    ].map((item) => ({
      nome: item[1],
      args: item[2].replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(),
      ret: item[3].toLowerCase(),
    }));
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0].nome).toBe(NOME_FN);
    expect(encontrados[0].ret).toBe("jsonb");
    expect(encontrados[0].args).toMatch(/^p_device_id\s+text,/i);
    expect(encontrados[0].args).toMatch(/p_session_token\s+uuid\s+default\s+null/i);
  });

  it("não recria nenhuma outra RPC nem redefine o assert", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_assert_business_write_allowed/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_sessao_heartbeat/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_page_stay_iniciar/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_page_stay_encerrar/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_dispositivo_renomear/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_dispositivo_remover/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_dispositivo_bloquear/i,
    );
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_dispositivo_desbloquear/i,
    );
  });

  it("preserva SECURITY DEFINER, search_path=public, language plpgsql e o return type jsonb", () => {
    const trecho = trechoFuncao(sqlSemComentarios, NOME_FN);
    expect(trecho).toMatch(/returns jsonb/i);
    expect(trecho).toMatch(/security definer/i);
    expect(trecho).toMatch(/set search_path\s*=\s*public/i);
    expect(trecho).toMatch(/language plpgsql/i);
  });
});

describe("migration 148 — guard único antes da primeira mutação", () => {
  it("contém exatamente 1 PERFORM do assert (null, null)", () => {
    expect(guardsEm(sqlSemComentarios)).toHaveLength(1);
  });

  it("não usa operation_id nem segundo argumento preenchido", () => {
    const performs = [
      ...sqlSemComentarios.matchAll(
        /perform\s+public\.app_assert_business_write_allowed\s*\(([^)]*)\)/gi,
      ),
    ];
    expect(performs).toHaveLength(1);
    expect(performs[0][1].replace(/\s+/g, "")).toMatch(/^null,null$/i);

    const corpo = corpoDaFuncao(sqlSemComentarios, NOME_FN);
    expect(corpo).not.toMatch(/operation_id/i);
  });

  it("exatamente 1 guard, depois de toda autenticação/ownership/advisory-lock e imediatamente antes do INSERT/UPSERT, sem DML de negócio antes", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, NOME_FN);
    const guards = guardsEm(corpo);
    expect(guards).toHaveLength(1);

    const idxBegin = corpo.search(/\bbegin\b/i);
    const idxNotAuth = corpo.search(/not_authenticated/i);
    const idxSessionMismatch = corpo.search(/device_session_mismatch/i);
    const idxAdvisoryLock = corpo.search(/pg_advisory_xact_lock/i);
    const idxMesaConflito = corpo.search(/mesa_em_uso_outro_dispositivo/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxDml = idxPrimeiroDml(corpo);
    const idxInsert = corpo.search(/insert\s+into\s+public\.tab_dispositivos/i);

    expect(idxBegin).toBeGreaterThan(-1);
    expect(idxNotAuth).toBeGreaterThan(-1);
    expect(idxSessionMismatch).toBeGreaterThan(-1);
    expect(idxAdvisoryLock).toBeGreaterThan(-1);
    expect(idxMesaConflito).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxBegin);
    expect(idxGuard).toBeGreaterThan(idxNotAuth);
    expect(idxGuard).toBeGreaterThan(idxSessionMismatch);
    expect(idxGuard).toBeGreaterThan(idxAdvisoryLock);
    expect(idxGuard).toBeGreaterThan(idxMesaConflito);
    expect(idxDml).toBeGreaterThan(idxGuard);
    expect(idxInsert).toBeGreaterThan(idxGuard);
    expect(idxInsert).toBe(idxDml);

    // Nenhuma mutação (INSERT/UPDATE/DELETE) de negócio antes do guard.
    const antesDoGuard = corpo.slice(0, idxGuard);
    expect(antesDoGuard).not.toMatch(/\binsert\s+into\s+public\./i);
    expect(antesDoGuard).not.toMatch(/\bupdate\s+public\./i);
    expect(antesDoGuard).not.toMatch(/\bdelete\s+from\s+public\./i);

    const depoisDoInsert = corpo.slice(idxInsert);
    expect(guardsEm(depoisDoInsert)).toHaveLength(0);
  });

  it("não coloca o guard no início da função", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, NOME_FN);
    const semEspaco = corpo.replace(/^\s+/, "");
    expect(semEspaco).not.toMatch(/^perform\s+public\.app_assert_business_write_allowed/i);
  });

  it("guard vem depois do bloco de exclusividade de mesa (advisory lock) inteiro e antes do único INSERT", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, NOME_FN);
    const idxFimBlocoMesa = corpo.search(/mesa_em_uso_outro_dispositivo'\s*;\s*\n\s*end if;\s*\n\s*end if;/i);
    const idxGuard = corpo.search(GUARD_RE);
    const idxInsert = corpo.search(/insert\s+into\s+public\.tab_dispositivos/i);
    expect(idxFimBlocoMesa).toBeGreaterThan(-1);
    expect(idxGuard).toBeGreaterThan(idxFimBlocoMesa);
    expect(idxInsert).toBeGreaterThan(idxGuard);

    const inserts = [...corpo.matchAll(/insert\s+into\s+public\.tab_dispositivos/gi)];
    expect(inserts).toHaveLength(1);
    expect(corpo).toMatch(/on conflict \(device_id\) do update set/i);
  });
});

describe("migration 148 — auth, ownership e validações preservados", () => {
  it("corpo idêntico ao original (migration 125) após remover o único guard", () => {
    const atual = trechoFuncao(sql, NOME_FN);
    const original = trechoFuncao(migration125, NOME_FN);
    expect(normalizar(semGuard(atual))).toBe(normalizar(original));
  });

  it("preserva auth, ownership (session_token), tenant, exclusividade de mesa e retorno completo", () => {
    const corpo = corpoDaFuncao(sqlSemComentarios, NOME_FN);
    expect(corpo).toMatch(/not_authenticated/);
    expect(corpo).toMatch(/forbidden/);
    expect(corpo).toMatch(/loja_obrigatoria/);
    expect(corpo).toMatch(/loja_invalida/);
    expect(corpo).toMatch(/device_invalido/);
    expect(corpo).toMatch(/device_session_mismatch/);
    expect(corpo).toMatch(/tab_user_sessions/);
    expect(corpo).toMatch(/mesa_invalida/);
    expect(corpo).toMatch(/device_loja_conflito/);
    expect(corpo).toMatch(/pg_advisory_xact_lock/);
    expect(corpo).toMatch(/mesa_em_uso_outro_dispositivo/);
    expect(corpo).toMatch(/return jsonb_build_object\(/);
    expect(corpo).toMatch(/'mesa', r\.mesa/);
  });
});

describe("migration 148 — grants/ACL intocados", () => {
  it("não adiciona nenhum GRANT ou REVOKE", () => {
    expect(grantsDe(sqlSemComentarios)).toHaveLength(0);
    expect(revokesDe(sqlSemComentarios)).toHaveLength(0);
  });

  it("não usa ALTER DEFAULT PRIVILEGES", () => {
    expect(sqlSemComentarios).not.toMatch(/alter\s+default\s+privileges/i);
  });

  it("não concede EXECUTE do assert a ninguém", () => {
    expect(sqlSemComentarios).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.app_assert_business_write_allowed/i,
    );
  });

  it("prova que o ACL (proacl) é comparado byte-a-byte entre precheck e postcheck", () => {
    expect(sqlSemComentarios).toMatch(
      /select proacl into v_acl_antes from pg_temp\._mig148_acl_snapshot/i,
    );
    expect(sqlSemComentarios).toMatch(/select p\.proacl::text into v_acl_depois/i);
    expect(sqlSemComentarios).toMatch(/ACL mudou \(antes=%, depois=%\)/i);
  });
});

describe("migration 148 — proibições de escopo", () => {
  it("não cria table, trigger, policy, index nem altera state/operations/release", () => {
    expect(sqlSemComentarios).not.toMatch(/create\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+trigger/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+policy/i);
    expect(sqlSemComentarios).not.toMatch(/create\s+index/i);
    expect(sqlSemComentarios).not.toMatch(/alter\s+table/i);
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_maintenance_/i);
    expect(sqlSemComentarios).not.toMatch(/insert\s+into\s+public\.app_release_/i);
    expect(sqlSemComentarios).not.toMatch(/update\s+public\.app_release_/i);
  });

  it("a única tabela permanente que cria é temporária (snapshot de ACL), com ON COMMIT DROP", () => {
    const creates = [...sqlSemComentarios.matchAll(/create\s+([a-z ]*?)table\s+([^\s(]+)/gi)];
    expect(creates).toHaveLength(1);
    expect(creates[0][1].toLowerCase()).toContain("temporary");
    expect(creates[0][2]).toMatch(/_mig148_acl_snapshot/i);
    expect(sqlSemComentarios).toMatch(/on commit drop/i);
  });

  it("não usa GUC (set_config/current_setting) nem bypass genérico", () => {
    expect(sqlSemComentarios).not.toMatch(/set_config/i);
    expect(sqlSemComentarios).not.toMatch(/current_setting/i);
    expect(sqlSemComentarios).not.toMatch(/bypass/i);
  });

  it("não cria frontend/API nem NOTIFY pgrst", () => {
    expect(sqlSemComentarios).not.toMatch(/notify pgrst/i);
    expect(sqlSemComentarios).not.toMatch(/src\//);
    expect(sqlSemComentarios).not.toMatch(/App\.jsx/);
    expect(sqlSemComentarios).not.toMatch(/supabase\.js/);
  });

  it("não toca a migration 064 nem contém token/segredo hardcoded", () => {
    expect(sqlSemComentarios).not.toMatch(/064_push_notificacoes/i);
    expect(sql).not.toContain("GITHUB_READ_TOKEN");
    expect(sql).not.toContain("GITHUB_RELEASE_TOKEN");
    expect(sql).not.toContain("VERCEL_TOKEN");
    expect(sql).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(sql).not.toMatch(/Bearer\s+\S+/i);
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(sql).not.toMatch(/sk_live_/);
  });
});

describe("migration 148 — postchecks fail-closed", () => {
  it("possui postcheck 148 antes do COMMIT e não executa o assert", () => {
    expect(sql).toMatch(/postcheck 148/i);
    const idxPostcheck = sql.search(/postcheck 148/i);
    const idxCommit = sql.search(/^\s*commit\s*;/im);
    expect(idxPostcheck).toBeGreaterThan(-1);
    expect(idxCommit).toBeGreaterThan(idxPostcheck);
    expect(sqlSemComentarios).not.toMatch(/select\s+public\.app_assert_business_write_allowed/i);
  });

  it("prova RPC count = 1", () => {
    expect(sqlSemComentarios).toMatch(/esperado exatamente 1 RPC app_dispositivo_registrar/i);
  });

  it("prova owner=postgres, SECURITY DEFINER, VOLATILE, search_path, pronargs/pronargdefaults preservados", () => {
    expect(sqlSemComentarios).toMatch(/pg_get_userbyid\(p\.proowner\)/);
    expect(sqlSemComentarios).toMatch(/owner deveria ser postgres/);
    expect(sqlSemComentarios).toMatch(/prosecdef deveria ser true \(SECURITY DEFINER\)/);
    expect(sqlSemComentarios).toMatch(/esperado v \/ VOLATILE/);
    expect(sqlSemComentarios).toContain("search_path=public");
    expect(sqlSemComentarios).toMatch(/pronargs=% \(esperado 8\)/i);
    expect(sqlSemComentarios).toMatch(/pronargdefaults=% \(esperado 7\)/i);
    expect(sqlSemComentarios).toMatch(/anon NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/service_role NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toMatch(/authenticated deveria continuar com EXECUTE/);
    expect(sqlSemComentarios).toMatch(/PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/);
    expect(sqlSemComentarios).toContain("aclexplode(");
    expect(sqlSemComentarios).toMatch(/grantee = 0/);
  });

  it("prova o return type correto (jsonb)", () => {
    expect(sqlSemComentarios).toMatch(/return type deveria ser jsonb/i);
  });

  it("prova guard presente exatamente 1 vez, com (null, null), sem operation_id", () => {
    expect(sqlSemComentarios).toMatch(/guard deveria aparecer exatamente 1 vez/);
    expect(sqlSemComentarios).toMatch(/app_assert_business_write_allowed\(\s*null\s*,\s*null\s*\)/);
    expect(sqlSemComentarios).toMatch(
      /regexp_matches\(v_prosrc,\s*'app_assert_business_write_allowed'/,
    );
    expect(sqlSemComentarios).toMatch(/não deveria referenciar operation_id/i);
  });

  it("prova que ownership/session-token, advisory-lock de mesa e o INSERT/UPSERT são preservados", () => {
    expect(sqlSemComentarios).toMatch(
      /perdeu a verificação de ownership \(tab_user_sessions\/device_session_mismatch\)/i,
    );
    expect(sqlSemComentarios).toMatch(
      /perdeu o advisory lock\/checagem de exclusividade de mesa/i,
    );
    expect(sqlSemComentarios).toMatch(/perdeu o INSERT em tab_dispositivos/i);
    expect(sqlSemComentarios).toMatch(/perdeu o ON CONFLICT DO UPDATE em tab_dispositivos/i);
  });

  it("prova posicionamento do guard: depois do advisory lock e imediatamente antes do INSERT, sem INSERT de negócio antes", () => {
    expect(sqlSemComentarios).toMatch(/guard deveria vir antes do INSERT/i);
    expect(sqlSemComentarios).toMatch(/guard deveria vir depois do advisory lock de mesa/i);
    expect(sqlSemComentarios).toMatch(/há um INSERT de negócio antes do guard/i);
  });

  it("prova que as RPCs/objetos fora de escopo não recebem o guard (verificação pós-migration)", () => {
    const idxPostcheckHeader = sql.search(/POSTCHECK fail-closed/i);
    expect(idxPostcheckHeader).toBeGreaterThan(-1);
    const blocoPostcheck = sql
      .slice(idxPostcheckHeader)
      .split("\n")
      .map((linha) => linha.replace(/\r$/, "").replace(/--.*$/, ""))
      .join("\n");
    const foraDeEscopo = [
      "app_sessao_heartbeat",
      "app_page_stay_iniciar",
      "app_page_stay_encerrar",
      "app_dispositivo_renomear",
      "app_dispositivo_remover",
      "app_dispositivo_bloquear",
      "app_dispositivo_desbloquear",
    ];
    for (const nome of foraDeEscopo) {
      expect(blocoPostcheck).toMatch(new RegExp(nome, "i"));
    }
    expect(blocoPostcheck).toMatch(
      /public\.% NÃO deveria conter o guard de manutenção \(fora de escopo B10-B\)/i,
    );
    expect(blocoPostcheck).toMatch(/prosrc ilike '%app_assert_business_write_allowed%'/i);
  });

  it("prova que o assert continua sem EXECUTE para PUBLIC/anon/authenticated/service_role", () => {
    expect(sql).toMatch(/assert — PUBLIC \(grantee=0 no ACL\) NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/assert — anon NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/assert — authenticated NÃO deveria ter EXECUTE/i);
    expect(sql).toMatch(/assert — service_role NÃO deveria ter EXECUTE/i);
  });
});

describe("migration 148 — observability, admin device RPCs e release infra intocados", () => {
  it("não referencia release executor / landing analytics / notificacoes-push", () => {
    expect(sqlSemComentarios).not.toMatch(/app_release_executar|release_executor/i);
    expect(sqlSemComentarios).not.toMatch(/landing_analytics|tab_landing_sessions/i);
    expect(sqlSemComentarios).not.toMatch(/push_notificacoes|app_push_/i);
  });

  it("não redefine app_dispositivos_listar (observability de dispositivos)", () => {
    expect(sqlSemComentarios).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.app_dispositivos_listar/i,
    );
  });
});
