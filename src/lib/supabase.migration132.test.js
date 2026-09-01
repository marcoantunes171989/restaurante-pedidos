import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Migration 132 — RPCs app_criar_pedido(...) + sete RPCs de atualização
// (app_pedido_atualizar_status/marcar_setor_pronto/atualizar_itens/
// atualizar_cliente/transferir_mesa/solicitar_conta_mesa/marcar_pago): fecham
// os únicos caminhos de escrita restantes do fluxo INTERNO autenticado
// (tablet/PDV/cozinha/caixa) em tab_pedidos, sem reabrir INSERT nem UPDATE
// direto na tabela.
//
// Revisão independente (gate R0H-C5C5) endureceu cinco blockers em cima da
// primeira versão (gate R0H-C5C3): (1) autorização funcional agora é
// verificada SERVER-SIDE (capability por ids_acesso), não só no frontend;
// (2) app_pedido_atualizar_status agora valida a TRANSIÇÃO (state machine),
// não só o enum de destino; (3) a antiga app_pedido_atualizar_pagamento foi
// dividida em app_pedido_solicitar_conta (autoridade de pedir a conta) e
// app_pedido_marcar_pago (autoridade de registrar pagamento); (4)
// CardapioPublico.jsx não pode mais importar nenhuma RPC interna app_* de
// pedido; (5) a validação final de PUBLIC usa ACL real
// (aclexplode+grantee=0), não has_function_privilege('public', ...).
//
// Revisão independente (gate R0H-C5C6) resolveu dois cruzamentos de regra:
// (1) app_pedido_solicitar_conta (por pedido, Promise.all) foi substituída
// por app_pedido_solicitar_conta_mesa (por MESA, atômica — trava e valida
// TODOS os pedidos elegíveis da mesa como entregues ANTES de atualizar
// qualquer um, reproduzindo a invariável real de requestBill); (2)
// app_pedido_marcar_pago documenta explicitamente a exceção comprovada de
// negócio (cashier pode marcar 'entregue' a partir de
// recebido/preparando/finalizado — nunca de cancelado) em vez de usar uma
// condição genérica sem justificar cada origem.
//
// Este teste lê o SQL real do arquivo (estrutura, ainda sem Postgres) e os
// wrappers JS (src/lib/supabase.js) que passaram a chamar as RPCs em vez de
// `.from('tab_pedidos').insert(...)` / `.from('tab_pedidos').update(...)`.
const sqlPath = "supabase/migrations/132_criar_pedido_autenticado_seguro.sql";
const sql = readFileSync(sqlPath, "utf8");
const semComentarios = sql
  .split("\n")
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n");

const jsPath = "src/lib/supabase.js";
const js = readFileSync(jsPath, "utf8");

const appJsPath = "src/App.jsx";
const appJs = readFileSync(appJsPath, "utf8");

const cardapioJsPath = "src/CardapioPublico.jsx";
const cardapioJs = readFileSync(cardapioJsPath, "utf8");

const migration131Path = "supabase/migrations/131_canonical_application_table_acl_hardening.sql";
const migration131 = readFileSync(migration131Path, "utf8");

// Extrai o corpo de uma função pelo nome canônico (até o próximo
// "create or replace function" ou um limite generoso — nunca o arquivo
// inteiro, para os testes de "não grava X" ficarem precisos).
function corpoDaFuncao(nome) {
  const idx = semComentarios.indexOf(`create or replace function public.${nome}(`);
  expect(idx, `função ${nome} não encontrada`).toBeGreaterThan(-1);
  const idxProxima = semComentarios.indexOf("create or replace function public.", idx + 10);
  return semComentarios.slice(idx, idxProxima > -1 ? idxProxima : idx + 6000);
}

describe("migration 132 — existência e transação", () => {
  it("arquivo existe e é legível", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("é transacional (begin ... commit)", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it("COMMIT é o último statement executável do arquivo", () => {
    const semComentariosSemFinal = semComentarios.replace(/\s+$/, "");
    expect(semComentariosSemFinal.toLowerCase().endsWith("commit;")).toBe(true);
  });

  it("exatamente uma Migration 132 ativa no diretório de migrations", () => {
    const arquivos = readdirSync("supabase/migrations").filter((f) => /^132[_.]/.test(f));
    expect(arquivos).toEqual(["132_criar_pedido_autenticado_seguro.sql"]);
  });

  it("não usa NOTIFY depois de COMMIT", () => {
    const idxCommit = semComentarios.search(/^commit;/m);
    const depois = semComentarios.slice(idxCommit + "commit;".length);
    expect(depois.trim()).toBe("");
  });
});

describe("migration 132 — precheck e validação final fail-closed", () => {
  it("contém precheck com RAISE EXCEPTION prefixado 'precheck 132:' antes do primeiro CREATE FUNCTION", () => {
    const idxPrecheck = semComentarios.search(/raise exception 'precheck 132:/);
    const idxCreate = semComentarios.search(/create or replace function public\.app_criar_pedido/);
    expect(idxPrecheck).toBeGreaterThan(-1);
    expect(idxCreate).toBeGreaterThan(-1);
    expect(idxPrecheck).toBeLessThan(idxCreate);
  });

  it("contém validação final com RAISE EXCEPTION prefixado 'validação 132:' depois do último GRANT", () => {
    const idxUltimoGrant = semComentarios.lastIndexOf("grant execute on function public.app_pedido_marcar_pago");
    const idxValidacao = semComentarios.search(/raise exception 'validação 132:/);
    expect(idxUltimoGrant).toBeGreaterThan(-1);
    expect(idxValidacao).toBeGreaterThan(-1);
    expect(idxUltimoGrant).toBeLessThan(idxValidacao);
  });

  it("validação final confere SECURITY DEFINER e search_path=public via pg_proc", () => {
    expect(semComentarios).toMatch(/p\.prosecdef,\s*p\.proconfig/);
    expect(semComentarios).toMatch(/search_path=public/);
  });

  it("precheck confirma tab_usuarios.ids_acesso (base da autorização funcional server-side)", () => {
    expect(semComentarios).toMatch(/'email','ativo','super_admin','loja_id','ids_acesso'/);
  });
});

describe("migration 132 — RPC app_criar_pedido é SECURITY DEFINER", () => {
  it("função é declarada security definer com search_path fixo", () => {
    expect(semComentarios).toMatch(
      /create or replace function public\.app_criar_pedido\(/,
    );
    expect(semComentarios).toMatch(/security definer\s+set search_path = public/);
  });

  it("gera o id do pedido no servidor (não recebe p_id como parâmetro)", () => {
    const idxAssinatura = semComentarios.indexOf("create or replace function public.app_criar_pedido(");
    const matchFechamento = /\)\s*\n\s*returns public\.tab_pedidos/.exec(semComentarios.slice(idxAssinatura));
    expect(matchFechamento).not.toBeNull();
    const assinatura = semComentarios.slice(idxAssinatura, idxAssinatura + matchFechamento.index);
    expect(assinatura).not.toMatch(/p_id\s/);
    expect(semComentarios).toMatch(/v_id\s*:=\s*'PED-'/);
  });

  it("status e status_pagamento iniciais são literais fixos no servidor ('recebido'/'aberto'), não parâmetros", () => {
    expect(sql).toMatch(/'recebido',\s*-- status inicial/);
    expect(sql).toMatch(/'aberto',\s*-- status_pagamento inicial/);
    const idxAssinatura = semComentarios.indexOf("create or replace function public.app_criar_pedido(");
    const matchFechamento = /\)\s*\n\s*returns public\.tab_pedidos/.exec(semComentarios.slice(idxAssinatura));
    expect(matchFechamento).not.toBeNull();
    const assinatura = semComentarios.slice(idxAssinatura, idxAssinatura + matchFechamento.index);
    expect(assinatura).not.toMatch(/p_status\b/);
  });

  it("capability server-side: tablet OU cashier (ou super_admin) — não confia só no canAccess do frontend", () => {
    const corpo = corpoDaFuncao("app_criar_pedido");
    expect(corpo).toMatch(/'tablet' = any\(coalesce\(v_caller\.ids_acesso, '\{\}'::text\[\]\)\)/);
    expect(corpo).toMatch(/'cashier' = any\(coalesce\(v_caller\.ids_acesso, '\{\}'::text\[\]\)\)/);
    expect(corpo).toMatch(/if not coalesce\(v_caller\.super_admin, false\) then\s*\n\s*if not \(/);
  });
});

describe("migration 132 — tenant sempre resolvido no servidor (bloqueio de escrita cross-tenant)", () => {
  it("app_criar_pedido: não-super usa v_caller.loja_id, nunca p_loja_id do cliente diretamente", () => {
    expect(semComentarios).toMatch(/v_loja\s*:=\s*v_caller\.loja_id;/);
  });

  it("app_criar_pedido: super precisa informar p_loja_id explicitamente e ele é validado contra tab_lojas", () => {
    expect(semComentarios).toMatch(/if\s+p_loja_id\s+is\s+null\s+then\s*\n\s*raise exception 'loja_obrigatoria';/);
    expect(semComentarios).toMatch(/not exists \(select 1 from public\.tab_lojas l where l\.id = p_loja_id\)/);
  });

  it("caller precisa existir em tab_usuarios e estar ativo (fail-closed em not_authenticated/forbidden)", () => {
    expect(semComentarios).toMatch(/raise exception 'not_authenticated';/);
    expect(semComentarios).toMatch(/coalesce\(v_caller\.ativo, false\) is not true then\s*\n\s*raise exception 'forbidden';/);
  });

  it("o INSERT final de app_criar_pedido grava loja_id a partir de v_loja (resolvida no servidor), não de um parâmetro cru", () => {
    const idxInsert = semComentarios.indexOf("insert into public.tab_pedidos (");
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxInsert);
    const blocoInsert = semComentarios.slice(idxInsert, idxReturning);
    expect(blocoInsert).toMatch(/v_loja/);
    expect(blocoInsert).not.toMatch(/p_loja_id/);
  });
});

describe("migration 132 — validações mínimas de mesa/comanda/itens (fail-closed)", () => {
  it("mesa vazia é rejeitada (mesa_obrigatoria)", () => {
    expect(semComentarios).toMatch(/raise exception 'mesa_obrigatoria';/);
  });

  it("comanda vazia é rejeitada (comanda_obrigatoria)", () => {
    expect(semComentarios).toMatch(/raise exception 'comanda_obrigatoria';/);
  });

  it("itens precisa ser array JSON não vazio na criação (itens_obrigatorios)", () => {
    expect(semComentarios).toMatch(/jsonb_typeof\(p_itens\)\s*<>\s*'array'/);
    expect(semComentarios).toMatch(/jsonb_array_length\(p_itens\)\s*=\s*0/);
    expect(semComentarios).toMatch(/raise exception 'itens_obrigatorios';/);
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C5 — Blocker 1: autorização funcional SERVER-SIDE.
// Matriz derivada dos canAccess() reais de cada call site (não
// inventada) — ver cabeçalho da migration para as evidências.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C5 Blocker 1 — autorização funcional server-side (não só frontend)", () => {
  const CAP_ESPERADA = {
    app_pedido_marcar_setor_pronto: ["kitchen"],
    app_pedido_atualizar_itens: ["cashier"],
    app_pedido_atualizar_cliente: ["cashier"],
    app_pedido_transferir_mesa: ["cashier"],
    app_pedido_solicitar_conta_mesa: ["tablet", "cashier"],
    app_pedido_marcar_pago: ["cashier"],
  };

  for (const [fn, caps] of Object.entries(CAP_ESPERADA)) {
    it(`${fn} verifica capability (${caps.join("/")}) via ids_acesso, não apenas ativo=true`, () => {
      const corpo = corpoDaFuncao(fn);
      for (const cap of caps) {
        expect(corpo).toMatch(
          new RegExp(`'${cap}' = any\\(coalesce\\(v_caller\\.ids_acesso, '\\{\\}'::text\\[\\]\\)\\)`),
        );
      }
    });

    it(`${fn} deixa super_admin bypassar a checagem de capability (mesmo padrão de tenant)`, () => {
      const corpo = corpoDaFuncao(fn);
      expect(corpo).toMatch(/if not coalesce\(v_caller\.super_admin, false\) then/);
    });
  }

  it("app_pedido_atualizar_status verifica capability por TRANSIÇÃO (matriz kitchen/cashier/tablet), não uma capability fixa única", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_status");
    expect(corpo).toMatch(/v_cap_ok := 'kitchen' = any\(v_ids\) or 'cashier' = any\(v_ids\);/);
    expect(corpo).toMatch(/v_cap_ok := 'kitchen' = any\(v_ids\) or 'tablet' = any\(v_ids\);/);
    expect(corpo).toMatch(/v_cap_ok := 'kitchen' = any\(v_ids\);/);
    expect(corpo).toMatch(/if not v_cap_ok then\s*\n\s*raise exception 'forbidden';/);
  });

  it("nenhuma RPC de atualização autoriza só com ativo=true sem checar capability alguma (exceto a checagem de tenant, que é ortogonal)", () => {
    const fns = [
      "app_pedido_atualizar_status",
      "app_pedido_marcar_setor_pronto",
      "app_pedido_atualizar_itens",
      "app_pedido_atualizar_cliente",
      "app_pedido_transferir_mesa",
      "app_pedido_solicitar_conta_mesa",
      "app_pedido_marcar_pago",
    ];
    for (const fn of fns) {
      const corpo = corpoDaFuncao(fn);
      expect(corpo).toMatch(/ids_acesso/);
    }
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C5 — Blocker 2: state machine server-side do status.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C5 Blocker 2 — state machine de status server-side", () => {
  it("app_pedido_atualizar_status valida a transição (não só o enum de destino) e falha com transicao_status_invalida", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_status");
    expect(corpo).toMatch(/raise exception 'transicao_status_invalida';/);
    expect(corpo).toMatch(/v_pedido\.status = 'recebido'\s+and v_status in \('preparando', 'finalizado', 'cancelado'\)/);
    expect(corpo).toMatch(/v_pedido\.status = 'preparando' and v_status in \('finalizado', 'cancelado'\)/);
    expect(corpo).toMatch(/v_pedido\.status = 'finalizado' and v_status in \('entregue', 'cancelado'\)/);
  });

  it("cancelamento respeita a regra real: de 'finalizado' só kitchen pode cancelar (tablet não)", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_status");
    expect(corpo).toMatch(
      /if v_pedido\.status = 'finalizado' then\s*\n\s*v_cap_ok := 'kitchen' = any\(v_ids\);/,
    );
  });

  it("a state machine não permite pular direto de 'recebido'/'preparando' para 'entregue' (só via 'finalizado')", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_status");
    const clauseRecebido = /v_pedido\.status = 'recebido'\s+and v_status in \(([^)]*)\)/.exec(corpo);
    const clausePreparando = /v_pedido\.status = 'preparando' and v_status in \(([^)]*)\)/.exec(corpo);
    expect(clauseRecebido).not.toBeNull();
    expect(clausePreparando).not.toBeNull();
    expect(clauseRecebido[1]).not.toMatch(/entregue/);
    expect(clausePreparando[1]).not.toMatch(/entregue/);
  });

  it("app_pedido_marcar_setor_pronto usa a mesma transicao_status_invalida no subconjunto alcançável (nunca cancela nem entrega)", () => {
    const corpo = corpoDaFuncao("app_pedido_marcar_setor_pronto");
    expect(corpo).toMatch(/raise exception 'transicao_status_invalida';/);
    expect(corpo).not.toMatch(/'cancelado'/);
    expect(corpo).not.toMatch(/'entregue'/);
  });

  it("app_pedido_marcar_pago bloqueia marcar 'entregue' quando o pedido já está cancelado", () => {
    const corpo = corpoDaFuncao("app_pedido_marcar_pago");
    expect(corpo).toMatch(/if v_status = 'entregue' and v_pedido\.status = 'cancelado' then\s*\n\s*raise exception 'transicao_status_invalida';/);
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C5 — Blocker 3: separar solicitar conta de marcar pago.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C5 Blocker 3 — solicitar conta e marcar pago são autoridades separadas", () => {
  it("app_pedido_atualizar_pagamento (genérica, antiga) não existe mais no arquivo", () => {
    expect(semComentarios).not.toMatch(/app_pedido_atualizar_pagamento/);
  });

  it("app_pedido_solicitar_conta_mesa não recebe status_pagamento nem status como parâmetro", () => {
    const idxAssinatura = semComentarios.indexOf("create or replace function public.app_pedido_solicitar_conta_mesa(");
    const matchFechamento = /\)\s*\n\s*returns setof public\.tab_pedidos/.exec(semComentarios.slice(idxAssinatura));
    expect(matchFechamento).not.toBeNull();
    const assinatura = semComentarios.slice(idxAssinatura, idxAssinatura + matchFechamento.index);
    expect(assinatura).not.toMatch(/p_status/);
    expect(assinatura).toMatch(/p_mesa\s+text/);
  });

  it("app_pedido_solicitar_conta_mesa só pode fixar 'solicitado' — nunca escreve status_pagamento = 'pago'", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    expect(corpo).toMatch(/status_pagamento = 'solicitado'/);
    // status_pagamento <> 'pago' aparece só como FILTRO de leitura (exclui
    // pedidos já pagos, mesmo filtro de currentTableOrders) — nunca como
    // atribuição.
    expect(corpo).not.toMatch(/status_pagamento\s*=\s*'pago'/);
    expect(corpo).toMatch(/status_pagamento <> 'pago'/);
  });

  it("app_pedido_marcar_pago não recebe status_pagamento como parâmetro (fixa 'pago' no servidor)", () => {
    const idxAssinatura = semComentarios.indexOf("create or replace function public.app_pedido_marcar_pago(");
    const matchFechamento = /\)\s*\n\s*returns public\.tab_pedidos/.exec(semComentarios.slice(idxAssinatura));
    expect(matchFechamento).not.toBeNull();
    const assinatura = semComentarios.slice(idxAssinatura, idxAssinatura + matchFechamento.index);
    expect(assinatura).not.toMatch(/p_status_pagamento/);
    const corpo = corpoDaFuncao("app_pedido_marcar_pago");
    expect(corpo).toMatch(/status_pagamento = 'pago'/);
  });

  it("app_pedido_marcar_pago restringe p_status a null|'entregue' (nunca aceita o enum inteiro de status)", () => {
    const corpo = corpoDaFuncao("app_pedido_marcar_pago");
    expect(corpo).toMatch(/if v_status is not null and v_status <> 'entregue' then\s*\n\s*raise exception 'status_invalido';/);
  });

  it("app_pedido_solicitar_conta_mesa e app_pedido_marcar_pago exigem capabilities diferentes (tablet/cashier vs. cashier apenas)", () => {
    const corpoSolicitar = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    const corpoPagar = corpoDaFuncao("app_pedido_marcar_pago");
    expect(corpoSolicitar).toMatch(/'tablet' = any/);
    expect(corpoPagar).not.toMatch(/'tablet' = any/);
    expect(corpoPagar).toMatch(/'cashier' = any/);
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C5 — Blocker 4: CardapioPublico não chama RPC interna.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C5 Blocker 4 — CardapioPublico.jsx não importa/chama RPC app_* administrativa de pedido", () => {
  const WRAPPERS_INTERNOS = [
    "atualizarPedido",
    "atualizarStatusPedido",
    "marcarSetorProntoPedido",
    "atualizarItensPedido",
    "atualizarClientePedido",
    "transferirMesaPedido",
    "atualizarPagamentoPedido",
    "solicitarContaPedido",
    "solicitarContaMesa",
    "marcarPagoPedido",
  ];

  for (const wrapper of WRAPPERS_INTERNOS) {
    it(`CardapioPublico.jsx não referencia ${wrapper}`, () => {
      expect(cardapioJs).not.toMatch(new RegExp(`\\b${wrapper}\\b`));
    });
  }

  it("CardapioPublico.jsx não faz UPDATE/INSERT direto em tab_pedidos", () => {
    expect(cardapioJs).not.toMatch(/\.from\(\s*['"]tab_pedidos['"]\s*\)/);
  });

  it("o fallback morto (cardapioViaRpc()===false) foi removido — confirmarSolicitarConta usa só a RPC pública", () => {
    const idxFn = cardapioJs.indexOf("async function confirmarSolicitarConta()");
    expect(idxFn).toBeGreaterThan(-1);
    const corpo = cardapioJs.slice(idxFn, idxFn + 1200);
    expect(corpo).toMatch(/rpcSolicitarContaPublico/);
    expect(corpo).not.toMatch(/\belse\b/);
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C5 — Blocker 5: validação de PUBLIC via ACL real.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C5 Blocker 5 — validação do pseudo-role PUBLIC via aclexplode + grantee=0", () => {
  it("validação final NÃO usa has_function_privilege('public', ...)", () => {
    expect(semComentarios).not.toMatch(/has_function_privilege\('public',/);
  });

  it("validação final usa aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) com grantee=0 e privilege_type='EXECUTE'", () => {
    expect(semComentarios).toMatch(/aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/);
    expect(semComentarios).toMatch(/acl\.grantee = 0/);
    expect(semComentarios).toMatch(/acl\.privilege_type = 'EXECUTE'/);
  });

  it("o padrão usado é o mesmo já consolidado nas migrations 126/127/128/130 (mesma expressão literal)", () => {
    const padraoConsolidado = "aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))";
    const semComentarios130 = readFileSync("supabase/migrations/130_reparo_acl_helpers_tenant.sql", "utf8");
    expect(semComentarios130).toContain(padraoConsolidado);
    expect(semComentarios).toContain(padraoConsolidado);
  });
});

describe("migration 132 — ACL geral (anon fora, authenticated dentro, PUBLIC fora) nas oito RPCs", () => {
  const FNS_ACL = [
    { fn: "app_criar_pedido", assinatura: "app_criar_pedido(text, text, jsonb, text, text, text, text, numeric, bigint)" },
    { fn: "app_pedido_atualizar_status", assinatura: "app_pedido_atualizar_status(text, text, text)" },
    { fn: "app_pedido_marcar_setor_pronto", assinatura: "app_pedido_marcar_setor_pronto(text, text, text[])" },
    { fn: "app_pedido_atualizar_itens", assinatura: "app_pedido_atualizar_itens(text, jsonb)" },
    { fn: "app_pedido_atualizar_cliente", assinatura: "app_pedido_atualizar_cliente(text, text, text)" },
    { fn: "app_pedido_transferir_mesa", assinatura: "app_pedido_transferir_mesa(text, text)" },
    { fn: "app_pedido_solicitar_conta_mesa", assinatura: "app_pedido_solicitar_conta_mesa(text, bigint)" },
    { fn: "app_pedido_marcar_pago", assinatura: "app_pedido_marcar_pago(text, text, text)" },
  ];
  // Estas duas RPCs legitimamente recebem p_loja_id (não localizam um
  // pedido já existente por id — app_criar_pedido cria; solicitar_conta_mesa
  // busca por mesa) — mesmo padrão de resolução de tenant para super_admin.
  const RECEBEM_LOJA_ID = new Set(["app_criar_pedido", "app_pedido_solicitar_conta_mesa"]);

  for (const { fn, assinatura } of FNS_ACL) {
    it(`${fn}: revoke all seguido de grant execute só para authenticated`, () => {
      const revokeRe = new RegExp(
        `revoke all on function public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*from public, anon, authenticated;`,
      );
      const grantRe = new RegExp(
        `grant execute on function public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*to authenticated;`,
      );
      expect(semComentarios).toMatch(revokeRe);
      expect(semComentarios).toMatch(grantRe);
    });

    it(`${fn}: security definer com search_path fixo`, () => {
      const corpo = corpoDaFuncao(fn);
      expect(corpo).toMatch(/security definer\s+set search_path = public/);
    });

    it(`${fn}: aparece no loop de validação final (assinatura exata)`, () => {
      expect(semComentarios).toContain(`'${assinatura}'`);
    });

    if (!RECEBEM_LOJA_ID.has(fn)) {
      it(`${fn}: localiza o pedido por id e nunca recebe p_loja_id (tenant vem sempre da linha existente)`, () => {
        const idxAssinatura = semComentarios.indexOf(`create or replace function public.${fn}(`);
        const fechamento = /\)\s*\n\s*returns public\.tab_pedidos/.exec(semComentarios.slice(idxAssinatura));
        expect(fechamento).not.toBeNull();
        const assinaturaSql = semComentarios.slice(idxAssinatura, idxAssinatura + fechamento.index);
        expect(assinaturaSql).not.toMatch(/p_loja_id/);
      });
    }
  }

  it("não concede EXECUTE a anon em nenhum statement executável", () => {
    const grants = semComentarios.match(/grant execute[^;]*;/gi) || [];
    for (const g of grants) {
      expect(g.toLowerCase()).not.toMatch(/\banon\b/);
    }
  });
});

describe("migration 132 — nenhum GRANT/REVOKE genérico ou perigoso", () => {
  it("nenhum GRANT ALL em nenhum objeto", () => {
    expect(semComentarios.toLowerCase()).not.toMatch(/grant all\b/);
  });

  it("nenhum GRANT/REVOKE de INSERT/UPDATE/DELETE/SELECT direto em tab_pedidos", () => {
    expect(semComentarios.toLowerCase()).not.toMatch(
      /\b(grant|revoke)\b[^;]*\b(select|insert|update|delete)\b[^;]*\bon\s+(table\s+)?(public\.)?tab_pedidos\b/,
    );
  });

  it("validação final confirma explicitamente que authenticated/anon NÃO têm INSERT nem UPDATE direto em tab_pedidos", () => {
    expect(semComentarios).toMatch(/has_table_privilege\('authenticated', 'public\.tab_pedidos', 'insert'\)/);
    expect(semComentarios).toMatch(/has_table_privilege\('anon', 'public\.tab_pedidos', 'insert'\)/);
    expect(semComentarios).toMatch(/has_table_privilege\('authenticated', 'public\.tab_pedidos', 'update'\)/);
    expect(semComentarios).toMatch(/has_table_privilege\('anon', 'public\.tab_pedidos', 'update'\)/);
  });

  it("nenhum statement executável menciona service_role", () => {
    const statementsAcl = semComentarios.match(/\b(grant|revoke)\b[^;]*;/gi) || [];
    expect(statementsAcl.length).toBeGreaterThan(0);
    for (const stmt of statementsAcl) {
      expect(stmt.toLowerCase()).not.toContain("service_role");
    }
  });
});

describe("migration 132 — não toca tab_pedidos (schema), migration 131, nem RPCs públicas", () => {
  it("nenhum ALTER TABLE / CREATE POLICY sobre tab_pedidos", () => {
    expect(semComentarios).not.toMatch(/alter table\s+public\.tab_pedidos/i);
    expect(semComentarios).not.toMatch(/create policy[^;]*tab_pedidos/i);
  });

  it("não redefine pub_criar_pedido, pub_criar_pedido_v2, pub_solicitar_conta nem app_listar_pedidos", () => {
    expect(semComentarios).not.toMatch(/create or replace function public\.pub_criar_pedido\b/);
    expect(semComentarios).not.toMatch(/create or replace function public\.pub_criar_pedido_v2\b/);
    expect(semComentarios).not.toMatch(/create or replace function public\.pub_solicitar_conta\b/);
    expect(semComentarios).not.toMatch(/create or replace function public\.app_listar_pedidos\b/);
  });

  it("migration 131 permanece byte-idêntica (hash SHA-256)", () => {
    const hash = createHash("sha256").update(migration131).digest("hex");
    expect(hash).toBe("b52f23523b86d35e3e60f905b28b544b82529201c71058a44a9f4d4272be7278");
  });
});

describe("migration 132 — cada RPC de atualização altera somente campos semanticamente autorizados", () => {
  it("app_pedido_atualizar_status só grava status/preparo_em/pronto_em/motivo_cancelamento", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set", semComentarios.indexOf("create or replace function public.app_pedido_atualizar_status("));
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxUpdate);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).toMatch(/status\s*=/);
    expect(bloco).toMatch(/preparo_em\s*=/);
    expect(bloco).toMatch(/pronto_em\s*=/);
    expect(bloco).toMatch(/motivo_cancelamento\s*=/);
    expect(bloco).not.toMatch(/\bitens\s*=/);
    expect(bloco).not.toMatch(/\bmesa\s*=/);
    expect(bloco).not.toMatch(/\bcliente\s*=/);
    expect(bloco).not.toMatch(/status_pagamento\s*=/);
  });

  it("app_pedido_marcar_setor_pronto só grava setor_status/status/pronto_em", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set", semComentarios.indexOf("create or replace function public.app_pedido_marcar_setor_pronto("));
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxUpdate);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).toMatch(/setor_status\s*=/);
    expect(bloco).toMatch(/status\s*=/);
    expect(bloco).toMatch(/pronto_em\s*=/);
    expect(bloco).not.toMatch(/\bitens\s*=/);
    expect(bloco).not.toMatch(/\bmesa\s*=/);
    expect(bloco).not.toMatch(/\bcliente\s*=/);
  });

  it("app_pedido_atualizar_itens só grava itens", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set itens", semComentarios.indexOf("create or replace function public.app_pedido_atualizar_itens("));
    expect(idxUpdate).toBeGreaterThan(-1);
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxUpdate);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).toMatch(/\bitens = p_itens\b/);
    expect(bloco).not.toMatch(/\bstatus\s*=/);
    expect(bloco).not.toMatch(/\bmesa\s*=/);
    expect(bloco).not.toMatch(/\bcliente\s*=/);
  });

  it("app_pedido_atualizar_cliente só grava cliente/cliente_telefone", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set", semComentarios.indexOf("create or replace function public.app_pedido_atualizar_cliente("));
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxUpdate);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).toMatch(/cliente\s*=/);
    expect(bloco).toMatch(/cliente_telefone\s*=/);
    expect(bloco).not.toMatch(/\bstatus\s*=/);
    expect(bloco).not.toMatch(/\bitens\s*=/);
    expect(bloco).not.toMatch(/\bmesa\s*=/);
  });

  it("app_pedido_transferir_mesa só grava mesa", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set mesa", semComentarios.indexOf("create or replace function public.app_pedido_transferir_mesa("));
    expect(idxUpdate).toBeGreaterThan(-1);
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxUpdate);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).toMatch(/\bmesa = v_mesa\b/);
    expect(bloco).not.toMatch(/\bstatus\s*=/);
    expect(bloco).not.toMatch(/\bitens\s*=/);
    expect(bloco).not.toMatch(/\bcliente\s*=/);
  });

  it("app_pedido_solicitar_conta_mesa só grava status_pagamento, em bloco (id = any(v_ids)), não por id isolado", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set status_pagamento = 'solicitado'");
    expect(idxUpdate).toBeGreaterThan(-1);
    const idxReturning = semComentarios.indexOf("returning *;", idxUpdate);
    expect(idxReturning).toBeGreaterThan(-1);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).not.toMatch(/\bstatus\s*=(?!_pagamento)/);
    expect(bloco).not.toMatch(/\bitens\s*=/);
    expect(bloco).not.toMatch(/\bmesa\s*=/);
    expect(bloco).not.toMatch(/pagamento_forma\s*=/);
    expect(bloco).toMatch(/where id = any\(v_ids\)/);
  });

  it("app_pedido_marcar_pago só grava status_pagamento/pagamento_forma/status", () => {
    const idxUpdate = semComentarios.indexOf("update public.tab_pedidos set", semComentarios.indexOf("create or replace function public.app_pedido_marcar_pago("));
    const idxReturning = semComentarios.indexOf("returning * into v_row;", idxUpdate);
    const bloco = semComentarios.slice(idxUpdate, idxReturning);
    expect(bloco).toMatch(/status_pagamento = 'pago'/);
    expect(bloco).toMatch(/pagamento_forma\s*=/);
    expect(bloco).toMatch(/\bstatus\s*=/);
    expect(bloco).not.toMatch(/\bitens\s*=/);
    expect(bloco).not.toMatch(/\bmesa\s*=/);
    expect(bloco).not.toMatch(/\bcliente\s*=/);
  });
});

describe("migration 132 — validações mínimas das RPCs de atualização (fail-closed)", () => {
  it("app_pedido_marcar_setor_pronto rejeita setor vazio (setor_obrigatorio) e NÃO recebe jsonb do browser", () => {
    const idxAssinatura = semComentarios.indexOf("create or replace function public.app_pedido_marcar_setor_pronto(");
    const fechamento = /\)\s*\n\s*returns public\.tab_pedidos/.exec(semComentarios.slice(idxAssinatura));
    const assinatura = semComentarios.slice(idxAssinatura, idxAssinatura + fechamento.index);
    expect(assinatura).not.toMatch(/jsonb/);
    expect(assinatura).toMatch(/p_setor\s+text/);
    expect(assinatura).toMatch(/p_setores_presentes\s+text\[\]/);
    expect(semComentarios).toMatch(/raise exception 'setor_obrigatorio';/);
  });

  it("app_pedido_atualizar_itens rejeita itens que não seja array JSON (array vazio continua permitido)", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_itens");
    expect(corpo).toMatch(/jsonb_typeof\(p_itens\)\s*<>\s*'array'/);
    expect(corpo).not.toMatch(/jsonb_array_length/);
    expect(corpo).toMatch(/raise exception 'itens_invalidos';/);
  });

  it("app_pedido_transferir_mesa rejeita mesa vazia", () => {
    const corpo = corpoDaFuncao("app_pedido_transferir_mesa");
    expect(corpo).toMatch(/raise exception 'mesa_obrigatoria';/);
  });

  it("pedido inexistente é rejeitado (pedido_nao_encontrado) nas seis RPCs de atualização por id de pedido", () => {
    // app_pedido_solicitar_conta_mesa não localiza um pedido por id (busca
    // por mesa) — usa 'nenhum_pedido_na_mesa' em vez de 'pedido_nao_encontrado'.
    const ocorrencias = semComentarios.match(/raise exception 'pedido_nao_encontrado';/g) || [];
    expect(ocorrencias.length).toBe(6);
  });

  it("app_pedido_solicitar_conta_mesa rejeita mesa sem nenhum pedido elegível (nenhum_pedido_na_mesa)", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    expect(corpo).toMatch(/if v_total = 0 then\s*\n\s*raise exception 'nenhum_pedido_na_mesa';/);
  });
});

describe("migration 132 — frontend usa as RPCs, não INSERT/UPDATE direto (src/lib/supabase.js)", () => {
  it("inserirPedido chama supabase.rpc('app_criar_pedido', ...)", () => {
    const idxFn = js.indexOf("export async function inserirPedido(p) {");
    expect(idxFn).toBeGreaterThan(-1);
    const corpo = js.slice(idxFn, idxFn + 800);
    expect(corpo).toMatch(/supabase\.rpc\(\s*'app_criar_pedido'/);
  });

  it("inserirPedido não faz mais .from('tab_pedidos').insert(...)", () => {
    const idxFn = js.indexOf("export async function inserirPedido(p) {");
    const idxProximaFn = js.indexOf("\nexport async function atualizarStatusPedido", idxFn);
    const corpo = js.slice(idxFn, idxProximaFn > -1 ? idxProximaFn : idxFn + 800);
    expect(corpo).not.toMatch(/\.from\(\s*['"]tab_pedidos['"]\s*\)\s*\.insert\(/);
  });

  it("inserirPedido não envia mais p.id (id é gerado no servidor pela RPC)", () => {
    const idxFn = js.indexOf("export async function inserirPedido(p) {");
    const idxProximaFn = js.indexOf("\nexport async function atualizarStatusPedido", idxFn);
    const corpo = js.slice(idxFn, idxProximaFn > -1 ? idxProximaFn : idxFn + 800);
    expect(corpo).not.toMatch(/p_id:\s*p\.id/);
    expect(corpo).not.toMatch(/p\.id,?\s*\n/);
  });

  it("nenhum trecho de src/lib/supabase.js faz INSERT ou UPDATE direto em tab_pedidos", () => {
    expect(js).not.toMatch(/\.from\(\s*['"]tab_pedidos['"]\s*\)\s*\.insert\(/);
    expect(js).not.toMatch(/\.from\(\s*['"]tab_pedidos['"]\s*\)\s*\.update\(/);
  });

  it("a função atualizarPedido(id, campos) genérica e a app_pedido_atualizar_pagamento antiga não existem mais", () => {
    expect(js).not.toMatch(/export async function atualizarPedido\(/);
    expect(js).not.toMatch(/export async function atualizarPagamentoPedido\(/);
    expect(js).not.toMatch(/supabase\.rpc\(\s*'app_pedido_atualizar_pagamento'/);
  });

  it("app_criar_mesa (RPC de referência já em produção) continua com o mesmo padrão de chamada — não foi alterado por engano", () => {
    expect(js).toMatch(/supabase\.rpc\('app_criar_mesa'/);
  });

  const WRAPPERS = [
    { js: "atualizarStatusPedido", rpc: "app_pedido_atualizar_status" },
    { js: "marcarSetorProntoPedido", rpc: "app_pedido_marcar_setor_pronto" },
    { js: "atualizarItensPedido", rpc: "app_pedido_atualizar_itens" },
    { js: "atualizarClientePedido", rpc: "app_pedido_atualizar_cliente" },
    { js: "transferirMesaPedido", rpc: "app_pedido_transferir_mesa" },
    { js: "marcarPagoPedido", rpc: "app_pedido_marcar_pago" },
  ];

  for (const { js: jsFn, rpc } of WRAPPERS) {
    it(`${jsFn} chama supabase.rpc('${rpc}', ...)`, () => {
      const idxFn = js.indexOf(`export async function ${jsFn}(`);
      expect(idxFn).toBeGreaterThan(-1);
      const corpo = js.slice(idxFn, idxFn + 500);
      expect(corpo).toMatch(new RegExp(`supabase\\.rpc\\(\\s*'${rpc}'`));
      expect(corpo).not.toMatch(/p_loja_id/);
    });
  }

  it("solicitarContaMesa chama supabase.rpc('app_pedido_solicitar_conta_mesa', ...) com p_mesa/p_loja_id (não mais por pedido)", () => {
    const idxFn = js.indexOf("export async function solicitarContaMesa(");
    expect(idxFn).toBeGreaterThan(-1);
    const corpo = js.slice(idxFn, idxFn + 500);
    expect(corpo).toMatch(/supabase\.rpc\(\s*'app_pedido_solicitar_conta_mesa'/);
    expect(corpo).toMatch(/p_mesa:/);
    expect(corpo).toMatch(/p_loja_id:/);
  });

  it("a função solicitarContaPedido (por pedido, Promise.all, não atômica) não existe mais", () => {
    expect(js).not.toMatch(/export async function solicitarContaPedido\(/);
    expect(js).not.toMatch(/supabase\.rpc\(\s*'app_pedido_solicitar_conta'\s*,/);
  });

  it("marcarSetorProntoPedido envia p_setor/p_setores_presentes — não envia mais p_setor_status (jsonb genérico)", () => {
    const idxFn = js.indexOf("export async function marcarSetorProntoPedido(");
    expect(idxFn).toBeGreaterThan(-1);
    const corpo = js.slice(idxFn, idxFn + 500);
    expect(corpo).toMatch(/p_setor:/);
    expect(corpo).toMatch(/p_setores_presentes:/);
    expect(corpo).not.toMatch(/p_setor_status/);
  });

  it("App.jsx chama os sete wrappers novos (nenhum fluxo ficou preso a nomes antigos)", () => {
    for (const { js: jsFn } of WRAPPERS) {
      expect(appJs).toMatch(new RegExp(`\\b${jsFn}\\(`));
    }
    expect(appJs).toMatch(/\bsolicitarContaMesa\(/);
    expect(appJs).not.toMatch(/\batualizarPedido\b/);
    expect(appJs).not.toMatch(/\batualizarPagamentoPedido\b/);
    expect(appJs).not.toMatch(/\bsolicitarContaPedido\b/);
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C6 — Ponto 1: invariável de solicitar conta é atômica por
// MESA (não por pedido isolado), reproduzindo requestBill exatamente.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C6 Ponto 1 — solicitar conta respeita a regra real e é atômica por mesa", () => {
  it("requestBill (App.jsx) chama solicitarContaMesa uma única vez por mesa — não mais Promise.all por pedido", () => {
    const idxFn = appJs.indexOf("async function requestBill()");
    expect(idxFn).toBeGreaterThan(-1);
    const corpo = appJs.slice(idxFn, idxFn + 1300);
    expect(corpo).toMatch(/solicitarContaMesa\(currentTable/);
    expect(corpo).not.toMatch(/Promise\.all/);
  });

  it("requestBill mantém a checagem client-side every(status==='delivered') (defesa em profundidade, não a única barreira)", () => {
    const idxFn = appJs.indexOf("async function requestBill()");
    const corpo = appJs.slice(idxFn, idxFn + 900);
    expect(corpo).toMatch(/currentTableOrders\.every\(\(o\) => o\.status === "delivered"\)/);
  });

  it("app_pedido_solicitar_conta_mesa trava (FOR UPDATE) TODOS os pedidos elegíveis da mesa ANTES de validar/atualizar qualquer um", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    const idxLoop = corpo.indexOf("for v_pedido in");
    const idxValidacao = corpo.indexOf("if v_nao_entregues > 0 then");
    const idxUpdate = corpo.indexOf("update public.tab_pedidos set status_pagamento");
    expect(idxLoop).toBeGreaterThan(-1);
    expect(idxValidacao).toBeGreaterThan(idxLoop);
    expect(idxUpdate).toBeGreaterThan(idxValidacao);
    expect(corpo.slice(idxLoop, idxLoop + 300)).toMatch(/for update\s*\n\s*loop/);
  });

  it("pedido não elegível (não entregue) bloqueia a solicitação inteira ANTES de qualquer UPDATE (zero atualização parcial)", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    const idxRaise = corpo.indexOf("raise exception 'pedido_nao_entregue';");
    const idxUpdate = corpo.indexOf("update public.tab_pedidos set status_pagamento");
    expect(idxRaise).toBeGreaterThan(-1);
    expect(idxUpdate).toBeGreaterThan(idxRaise);
  });

  it("a checagem de 'todos entregues' é sobre TODOS os pedidos elegíveis da mesa (v_nao_entregues contabilizado no loop), não sobre um pedido isolado", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    expect(corpo).toMatch(/if v_pedido\.status <> 'entregue' then\s*\n\s*v_nao_entregues := v_nao_entregues \+ 1;/);
  });

  it("o UPDATE final atualiza todos os pedidos elegíveis num único statement (where id = any(v_ids)) — não um loop de UPDATEs", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    const ocorrenciasUpdate = corpo.match(/update public\.tab_pedidos set/g) || [];
    expect(ocorrenciasUpdate.length).toBe(1);
    expect(corpo).toMatch(/where id = any\(v_ids\)/);
  });

  it("escopo é MESA (loja_id + mesa), não comanda nem pedido isolado — mesmo agrupador de currentTableOrders", () => {
    const corpo = corpoDaFuncao("app_pedido_solicitar_conta_mesa");
    expect(corpo).toMatch(/where mesa = v_mesa and loja_id = v_loja/);
    expect(corpo).not.toMatch(/comanda/);
  });
});

// ════════════════════════════════════════════════════════════
// Gate R0H-C5C6 — Ponto 2: app_pedido_marcar_pago × state machine —
// exceção de negócio comprovada (cashier), documentada explicitamente.
// ════════════════════════════════════════════════════════════
describe("R0H-C5C6 Ponto 2 — marcar pago documenta a exceção da state machine (não ignora)", () => {
  it("app_pedido_marcar_pago permite 'entregue' a partir de recebido/preparando/finalizado (exceção comprovada — CashierPdv.jsx:contasAbertas)", () => {
    const corpo = corpoDaFuncao("app_pedido_marcar_pago");
    // A única checagem de origem bloqueada é 'cancelado' — não há checagem
    // adicional restringindo a partida a 'finalizado' (isso seria a state
    // machine estrita de app_pedido_atualizar_status, que NÃO se aplica aqui).
    expect(corpo).toMatch(/if v_status = 'entregue' and v_pedido\.status = 'cancelado' then/);
    expect(corpo).not.toMatch(/v_pedido\.status = 'finalizado'/);
    expect(corpo).not.toMatch(/transicao_status_invalida.*\n.*recebido/);
  });

  it("a exceção é documentada explicitamente: origem, capability, call site e motivo (não uma condição genérica sem justificar)", () => {
    const idx = sql.indexOf("EXCEÇÃO DE NEGÓCIO COMPROVADA");
    expect(idx).toBeGreaterThan(-1);
    const doc = sql.slice(idx - 50, idx + 2200);
    expect(doc).toMatch(/Estado de origem/);
    expect(doc).toMatch(/Capability/);
    expect(doc).toMatch(/Call site/);
    expect(doc).toMatch(/Por que existe/);
    expect(doc).toMatch(/pendentePreparo/);
    expect(doc).toMatch(/CashierPdv\.jsx/);
  });

  it("a exceção é exclusiva de app_pedido_marcar_pago (capability cashier) — app_pedido_atualizar_status (kitchen/tablet/cashier) continua com a state machine estrita", () => {
    const corpoStatus = corpoDaFuncao("app_pedido_atualizar_status");
    expect(corpoStatus).toMatch(/v_pedido\.status = 'finalizado' and v_status in \('entregue', 'cancelado'\)/);
    expect(corpoStatus).not.toMatch(/v_pedido\.status = 'recebido'[^)]*'entregue'/);
  });

  it("recebido -> entregue não ocorre via app_pedido_atualizar_status (state machine estrita preservada)", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_status");
    const clauseRecebido = /v_pedido\.status = 'recebido'\s+and v_status in \(([^)]*)\)/.exec(corpo);
    expect(clauseRecebido).not.toBeNull();
    expect(clauseRecebido[1]).not.toMatch(/entregue/);
  });

  it("preparando -> entregue não ocorre via app_pedido_atualizar_status (state machine estrita preservada)", () => {
    const corpo = corpoDaFuncao("app_pedido_atualizar_status");
    const clausePreparando = /v_pedido\.status = 'preparando' and v_status in \(([^)]*)\)/.exec(corpo);
    expect(clausePreparando).not.toBeNull();
    expect(clausePreparando[1]).not.toMatch(/entregue/);
  });

  it("cancelado nunca vira entregue — nem em app_pedido_atualizar_status (cancelado não é origem de nenhuma transição) nem em app_pedido_marcar_pago (bloqueio explícito)", () => {
    const corpoStatus = corpoDaFuncao("app_pedido_atualizar_status");
    expect(corpoStatus).not.toMatch(/v_pedido\.status = 'cancelado'/);
    const corpoPago = corpoDaFuncao("app_pedido_marcar_pago");
    expect(corpoPago).toMatch(/v_pedido\.status = 'cancelado' then\s*\n\s*raise exception 'transicao_status_invalida';/);
  });

  it("baixarComandas (App.jsx) chama marcarPagoPedido com status='entregue' incondicional ao status atual (evidência da exceção real, não simulada)", () => {
    const idxFn = appJs.indexOf("async function baixarComandas(");
    expect(idxFn).toBeGreaterThan(-1);
    const corpo = appJs.slice(idxFn, idxFn + 3600);
    expect(corpo).toMatch(/marcarPagoPedido\(o\.id, formaLabel \|\| null, manterStatus \? null : "entregue"\)/);
    // `alvo` (pedidos afetados) não filtra por o.status — só por paymentStatus.
    const idxAlvo = corpo.indexOf("const alvo = orders.filter(");
    expect(idxAlvo).toBeGreaterThan(-1);
    const linhaAlvo = corpo.slice(idxAlvo, corpo.indexOf(";", idxAlvo));
    expect(linhaAlvo).not.toMatch(/\.status\b/);
  });

  it("CashierPdv.jsx:contasAbertas inclui pedidos 'received'/'preparing' como elegíveis para pagamento (pendentePreparo) — evidência da exceção", () => {
    const cashierPdvJs = readFileSync("src/pages/pdv/CashierPdv.jsx", "utf8");
    expect(cashierPdvJs).toMatch(/if \(o\.status === "received" \|\| o\.status === "preparing"\) m\.pendentePreparo = true;/);
  });
});
