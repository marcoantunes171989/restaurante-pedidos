// ════════════════════════════════════════════════════════════
//  PDB-I2D1 — MANIFESTO VERSIONADO do write fence (WFC-2).
//
//  Inventário canônico dos caminhos de escrita de negócio descobertos no
//  repositório (migrations 001–162) e classificados como:
//    FENCE_GUARD_REQUIRED                                 (guard curto/atômico)
//    FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED         (vida longa / cutover)
//  mais as funções-núcleo do próprio guard (GUARD_CORE).
//
//  Cada entrada carrega assinatura, sentinela do guard e fingerprint md5 do
//  corpo (LF-normalizado). O probe SQL (migration 162) embute o MESMO
//  manifesto; o hash determinístico abaixo é a versão do inventário: qualquer
//  mudança de caminho/assinatura/corpo muda o hash e torna evidência antiga
//  STALE (nunca fica verde para sempre).
//
//  GERADO a partir do repositório (dados) — não editar as entradas à mão:
//  um teste estático recomputa assinatura/fingerprint/guard direto das
//  migrations e o literal jsonb do probe, e falha em qualquer divergência.
//
//  Puro: sem rede, sem DB, sem ambiente, sem timer.
// ════════════════════════════════════════════════════════════

import crypto from "node:crypto";

export const WRITE_FENCE_MANIFEST_VERSION = "WFC-2";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const WRITE_FENCE_MANIFEST = deepFreeze({
  "version": "WFC-2",
  "entries": [
    {
      "id": "CORE:app_assert_business_write_allowed/2",
      "kind": "CORE",
      "name": "app_assert_business_write_allowed",
      "signature": "uuid, text",
      "guard": "NONE",
      "family": "GUARD_CORE",
      "classification": "GUARD_CORE",
      "guardStatement": null,
      "md5": "f284b560cd4185e127f169b22c193a2b",
      "origin": "160"
    },
    {
      "id": "CORE:app_assert_business_write_allowed_registry_callee_internal/0",
      "kind": "CORE",
      "name": "app_assert_business_write_allowed_registry_callee_internal",
      "signature": "",
      "guard": "NONE",
      "family": "GUARD_CORE",
      "classification": "GUARD_CORE",
      "guardStatement": null,
      "md5": "72bed2abe59d6b31ac78763a96d9625f",
      "origin": "162"
    },
    {
      "id": "CORE:app_maintenance_business_write_registry_trigger/0",
      "kind": "CORE",
      "name": "app_maintenance_business_write_registry_trigger",
      "signature": "",
      "guard": "NONE",
      "family": "GUARD_CORE",
      "classification": "GUARD_CORE",
      "guardStatement": null,
      "md5": "7c30391e7791bf9f3a407e0d891b9eac",
      "origin": "162"
    },
    {
      "id": "CORE:app_maintenance_business_write_trigger/0",
      "kind": "CORE",
      "name": "app_maintenance_business_write_trigger",
      "signature": "",
      "guard": "NONE",
      "family": "GUARD_CORE",
      "classification": "GUARD_CORE",
      "guardStatement": null,
      "md5": "3a043468bb7a368f2136bcbf9fe112dd",
      "origin": "144"
    },
    {
      "id": "CORE:app_maintenance_cutover_barrier_internal/1",
      "kind": "CORE",
      "name": "app_maintenance_cutover_barrier_internal",
      "signature": "boolean",
      "guard": "NONE",
      "family": "GUARD_CORE",
      "classification": "GUARD_CORE",
      "guardStatement": null,
      "md5": "047ebd6b8c5f7c2d611078c79259bef7",
      "origin": "155"
    },
    {
      "id": "CORE:app_maintenance_operation_begin_internal/1",
      "kind": "CORE",
      "name": "app_maintenance_operation_begin_internal",
      "signature": "text",
      "guard": "NONE",
      "family": "GUARD_CORE",
      "classification": "GUARD_CORE",
      "guardStatement": null,
      "md5": "355a3ea0a38096fa6ae9f00291c189a6",
      "origin": "155"
    },
    {
      "id": "RPC:app_admin_criar_usuario/3",
      "kind": "RPC",
      "name": "app_admin_criar_usuario",
      "signature": "text, text, jsonb",
      "guard": "PLAIN",
      "family": "USER_ADMIN_MUTATION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "a270bf43df9ea5660a98de8abba9e3f2",
      "origin": "162"
    },
    {
      "id": "RPC:app_admin_salvar_usuario/4",
      "kind": "RPC",
      "name": "app_admin_salvar_usuario",
      "signature": "text, text, bigint, jsonb",
      "guard": "PLAIN",
      "family": "USER_ADMIN_MUTATION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "83c1e0bb81a8a9df219c839dc67f02d6",
      "origin": "162"
    },
    {
      "id": "RPC:app_atualizar_categoria/2",
      "kind": "RPC",
      "name": "app_atualizar_categoria",
      "signature": "bigint, jsonb",
      "guard": "PRE_EXISTING",
      "family": "MIG143_ADMIN_ALLOWLIST",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "4564c1f783c8de3dce412d429d67fd42",
      "origin": "143"
    },
    {
      "id": "RPC:app_atualizar_cupom/13",
      "kind": "RPC",
      "name": "app_atualizar_cupom",
      "signature": "bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time",
      "guard": "PRE_EXISTING",
      "family": "MIG145_CUPONS",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "2c923c07d35459ae8a41fbd1011026b0",
      "origin": "145"
    },
    {
      "id": "RPC:app_atualizar_loja/2",
      "kind": "RPC",
      "name": "app_atualizar_loja",
      "signature": "bigint, jsonb",
      "guard": "PRE_EXISTING",
      "family": "MIG147_ADMIN_FINAL",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "cc9b746b0330781b4e1be41d423f05c1",
      "origin": "147"
    },
    {
      "id": "RPC:app_atualizar_mesa/9",
      "kind": "RPC",
      "name": "app_atualizar_mesa",
      "signature": "bigint, integer, text, integer, text, text, boolean, boolean, boolean",
      "guard": "PRE_EXISTING",
      "family": "MIG143_ADMIN_ALLOWLIST",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "bc349c3460a1c9991b1c9d2c7108f265",
      "origin": "143"
    },
    {
      "id": "RPC:app_atualizar_produto/2",
      "kind": "RPC",
      "name": "app_atualizar_produto",
      "signature": "bigint, jsonb",
      "guard": "PRE_EXISTING",
      "family": "MIG146_PRODUTOS",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "6935eab87ace6af2f0631cb67c9556d2",
      "origin": "146"
    },
    {
      "id": "RPC:app_atualizar_produtos_fiscal_lote/3",
      "kind": "RPC",
      "name": "app_atualizar_produtos_fiscal_lote",
      "signature": "bigint, bigint[], jsonb",
      "guard": "PRE_EXISTING",
      "family": "FISCAL_RULE_MUTATION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "3c038ef5f93900dbe888c0fe77402c7e",
      "origin": "146"
    },
    {
      "id": "RPC:app_baixar_estoque_produto/2",
      "kind": "RPC",
      "name": "app_baixar_estoque_produto",
      "signature": "bigint, jsonb",
      "guard": "PLAIN",
      "family": "STOCK",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "8b653ed6b281a8b9f4bf50581ff16433",
      "origin": "162"
    },
    {
      "id": "RPC:app_checkout_begin/2",
      "kind": "RPC",
      "name": "app_checkout_begin",
      "signature": "bigint, text[]",
      "guard": "REGISTRY_OPERATION",
      "family": "OP_CHECKOUT",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "guardStatement": "v_operation_id := public.app_maintenance_operation_begin_internal('checkout');",
      "md5": "c396e77fe3fb05b882be9cda91811401",
      "origin": "155"
    },
    {
      "id": "RPC:app_checkout_commit/2",
      "kind": "RPC",
      "name": "app_checkout_commit",
      "signature": "uuid, jsonb",
      "guard": "REGISTRY_OPERATION",
      "family": "OP_CHECKOUT",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(p_operation_id, 'checkout');",
      "md5": "8353a2c135f9d2076bf8a8f5731a7439",
      "origin": "152"
    },
    {
      "id": "RPC:app_criar_categoria/5",
      "kind": "RPC",
      "name": "app_criar_categoria",
      "signature": "bigint, text, bigint, bigint, integer",
      "guard": "CALLEE",
      "family": "CATALOG_ONBOARDING_CALLEE",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed_registry_callee_internal();",
      "md5": "c88b836d176caaa3c8186e8bd1497a84",
      "origin": "162"
    },
    {
      "id": "RPC:app_criar_cupom/13",
      "kind": "RPC",
      "name": "app_criar_cupom",
      "signature": "bigint, text, text, text, numeric, numeric, integer, timestamptz, timestamptz, boolean, text, time, time",
      "guard": "PRE_EXISTING",
      "family": "MIG145_CUPONS",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "fd6fff60a3816cff99cb9a72fa779c70",
      "origin": "145"
    },
    {
      "id": "RPC:app_criar_loja/7",
      "kind": "RPC",
      "name": "app_criar_loja",
      "signature": "text, text, text, text, text, text, text",
      "guard": "CALLEE",
      "family": "TENANT_ONBOARDING_CALLEE",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed_registry_callee_internal();",
      "md5": "1aed5b7ef40319099b76a53bcfdc917e",
      "origin": "162"
    },
    {
      "id": "RPC:app_criar_mesa/8",
      "kind": "RPC",
      "name": "app_criar_mesa",
      "signature": "bigint, integer, text, integer, text, text, boolean, boolean",
      "guard": "PRE_EXISTING",
      "family": "MIG143_ADMIN_ALLOWLIST",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "99f83d3cd5935b90e9fb7b1bbe21c3bd",
      "origin": "143"
    },
    {
      "id": "RPC:app_criar_pedido/9",
      "kind": "RPC",
      "name": "app_criar_pedido",
      "signature": "text, text, jsonb, text, text, text, text, numeric, bigint",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "f812a399bf0d5e34501776fb1c3f7076",
      "origin": "162"
    },
    {
      "id": "RPC:app_criar_produto/2",
      "kind": "RPC",
      "name": "app_criar_produto",
      "signature": "bigint, jsonb",
      "guard": "PRE_EXISTING",
      "family": "MIG146_PRODUTOS",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "103f40ade55e27a25ce0d2b5c549101f",
      "origin": "146"
    },
    {
      "id": "RPC:app_criar_usuario/1",
      "kind": "RPC",
      "name": "app_criar_usuario",
      "signature": "jsonb",
      "guard": "PLAIN",
      "family": "USER_ADMIN_MUTATION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "7c4ec4a4e8968fe773fb9a0ae2d34cdd",
      "origin": "162"
    },
    {
      "id": "RPC:app_definir_senha_hash/2",
      "kind": "RPC",
      "name": "app_definir_senha_hash",
      "signature": "bigint, text",
      "guard": "PLAIN",
      "family": "USER_ADMIN_MUTATION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "4b1072a507391470b9761ad131cbfbe5",
      "origin": "162"
    },
    {
      "id": "RPC:app_dispositivo_registrar/8",
      "kind": "RPC",
      "name": "app_dispositivo_registrar",
      "signature": "text, text, text, text, boolean, text, bigint, uuid",
      "guard": "PRE_EXISTING",
      "family": "MIG148_DEVICE_HEARTBEAT",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "ce42c19bb024796cc6af1ab7cbe4113d",
      "origin": "148"
    },
    {
      "id": "RPC:app_evento_acesso_excluir/1",
      "kind": "RPC",
      "name": "app_evento_acesso_excluir",
      "signature": "uuid",
      "guard": "PRE_EXISTING",
      "family": "MIG147_ADMIN_FINAL",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "5e9b50382301318fbc46021aa1686ce4",
      "origin": "147"
    },
    {
      "id": "RPC:app_excluir_categoria/1",
      "kind": "RPC",
      "name": "app_excluir_categoria",
      "signature": "bigint",
      "guard": "PRE_EXISTING",
      "family": "MIG143_ADMIN_ALLOWLIST",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "df52aada3d36ced72bbe5931485978ba",
      "origin": "143"
    },
    {
      "id": "RPC:app_excluir_cupom/1",
      "kind": "RPC",
      "name": "app_excluir_cupom",
      "signature": "bigint",
      "guard": "PRE_EXISTING",
      "family": "MIG145_CUPONS",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "c5031f2f45466f0bf4f538f661fcd496",
      "origin": "145"
    },
    {
      "id": "RPC:app_excluir_produto/1",
      "kind": "RPC",
      "name": "app_excluir_produto",
      "signature": "bigint",
      "guard": "PRE_EXISTING",
      "family": "MIG146_PRODUTOS",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "b049cedd29a91b3ce4f057cc7e2dddb9",
      "origin": "146"
    },
    {
      "id": "RPC:app_onboarding_criar_categoria/6",
      "kind": "RPC",
      "name": "app_onboarding_criar_categoria",
      "signature": "uuid, bigint, text, bigint, bigint, integer",
      "guard": "REGISTRY_OPERATION",
      "family": "OP_ONBOARDING",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(p_operation_id, 'onboarding');",
      "md5": "beb02949662d79032df0b1c7549e64b0",
      "origin": "151"
    },
    {
      "id": "RPC:app_onboarding_criar_loja/7",
      "kind": "RPC",
      "name": "app_onboarding_criar_loja",
      "signature": "text, text, text, text, text, text, text",
      "guard": "REGISTRY_OPERATION",
      "family": "OP_ONBOARDING",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "guardStatement": "v_operation_id := public.app_maintenance_operation_begin_internal('onboarding');",
      "md5": "4f87f47a7bb03c01bd53c751505f5688",
      "origin": "151"
    },
    {
      "id": "RPC:app_onboarding_salvar_emitente/3",
      "kind": "RPC",
      "name": "app_onboarding_salvar_emitente",
      "signature": "uuid, bigint, jsonb",
      "guard": "REGISTRY_OPERATION",
      "family": "OP_ONBOARDING",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(p_operation_id, 'onboarding');",
      "md5": "93c2c2e7956d1fa9599aab280d1b2cec",
      "origin": "151"
    },
    {
      "id": "RPC:app_onboarding_seed_formas_pagamento/2",
      "kind": "RPC",
      "name": "app_onboarding_seed_formas_pagamento",
      "signature": "uuid, bigint",
      "guard": "REGISTRY_OPERATION",
      "family": "OP_ONBOARDING",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(p_operation_id, 'onboarding');",
      "md5": "9dc5c8b7c21112be1a188f187e2fc2e5",
      "origin": "151"
    },
    {
      "id": "RPC:app_pedido_atualizar_cliente/3",
      "kind": "RPC",
      "name": "app_pedido_atualizar_cliente",
      "signature": "text, text, text",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "90ec8ecb342fb931f53981c495b4e2f8",
      "origin": "162"
    },
    {
      "id": "RPC:app_pedido_atualizar_itens/2",
      "kind": "RPC",
      "name": "app_pedido_atualizar_itens",
      "signature": "text, jsonb",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "ff7f3bcfdcf38b73c3cc6efa4e817e72",
      "origin": "162"
    },
    {
      "id": "RPC:app_pedido_atualizar_status/3",
      "kind": "RPC",
      "name": "app_pedido_atualizar_status",
      "signature": "text, text, text",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "29bdf9ebe845cb0c4e1596383a87549d",
      "origin": "162"
    },
    {
      "id": "RPC:app_pedido_marcar_pago/3",
      "kind": "RPC",
      "name": "app_pedido_marcar_pago",
      "signature": "text, text, text",
      "guard": "CALLEE",
      "family": "INTERNAL_ORDER_CHECKOUT_CALLEE",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed_registry_callee_internal();",
      "md5": "c112efa643dfe11a364fe5660987879e",
      "origin": "162"
    },
    {
      "id": "RPC:app_pedido_marcar_setor_pronto/3",
      "kind": "RPC",
      "name": "app_pedido_marcar_setor_pronto",
      "signature": "text, text, text[]",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "ab9e85367c00dcc17dd3ee4ac25f6b98",
      "origin": "162"
    },
    {
      "id": "RPC:app_pedido_solicitar_conta_mesa/2",
      "kind": "RPC",
      "name": "app_pedido_solicitar_conta_mesa",
      "signature": "text, bigint",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "ec268594b4fa62642e1c0a9914b4e140",
      "origin": "162"
    },
    {
      "id": "RPC:app_pedido_transferir_mesa/2",
      "kind": "RPC",
      "name": "app_pedido_transferir_mesa",
      "signature": "text, text",
      "guard": "PLAIN",
      "family": "INTERNAL_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "86ff3ab2f216ce1e4991b6d6260ac0c7",
      "origin": "162"
    },
    {
      "id": "RPC:app_registrar_pagamento_v2/11",
      "kind": "RPC",
      "name": "app_registrar_pagamento_v2",
      "signature": "uuid, jsonb, numeric, bigint, text, text, bigint, bigint, numeric, jsonb, boolean",
      "guard": "PLAIN",
      "family": "PAYMENT",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "d4d9efe230d0277b4b47b6abc0b6ffe8",
      "origin": "162"
    },
    {
      "id": "RPC:app_reservar_numero_nfce/1",
      "kind": "RPC",
      "name": "app_reservar_numero_nfce",
      "signature": "bigint",
      "guard": "PLAIN",
      "family": "NFCE_EMISSION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "35a665ee68bfaa2f2ec65d36cb97790e",
      "origin": "162"
    },
    {
      "id": "RPC:app_salvar_funcionamento_loja/2",
      "kind": "RPC",
      "name": "app_salvar_funcionamento_loja",
      "signature": "bigint, jsonb",
      "guard": "PRE_EXISTING",
      "family": "MIG147_ADMIN_FINAL",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "f6713d798f38109ee94413b4500c0208",
      "origin": "147"
    },
    {
      "id": "RPC:app_salvar_usuario/2",
      "kind": "RPC",
      "name": "app_salvar_usuario",
      "signature": "bigint, jsonb",
      "guard": "PLAIN",
      "family": "USER_ADMIN_MUTATION",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "078701cc6c89d30c7a4b6a945dc5d43f",
      "origin": "162"
    },
    {
      "id": "RPC:cupom_consumir/7",
      "kind": "RPC",
      "name": "cupom_consumir",
      "signature": "bigint, bigint, numeric, numeric, text, text[], text",
      "guard": "PLAIN",
      "family": "COUPON",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "364ccbbfb7a212e3f8886e8cb5412807",
      "origin": "162"
    },
    {
      "id": "RPC:cupom_consumir/8",
      "kind": "RPC",
      "name": "cupom_consumir",
      "signature": "bigint, bigint, numeric, numeric, text, text[], text, text",
      "guard": "CALLEE",
      "family": "COUPON_CHECKOUT_CALLEE",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed_registry_callee_internal();",
      "md5": "fde8c29834c98ae942b6a527e64cccec",
      "origin": "162"
    },
    {
      "id": "RPC:pub_criar_pedido/11",
      "kind": "RPC",
      "name": "pub_criar_pedido",
      "signature": "bigint, text, text, text, text, jsonb, text, text, integer, bigint, numeric",
      "guard": "PLAIN",
      "family": "PUBLIC_ORDER_LEGACY_071",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "10380c3068fe6794469840bf01fd1008",
      "origin": "162"
    },
    {
      "id": "RPC:pub_criar_pedido_v2/12",
      "kind": "RPC",
      "name": "pub_criar_pedido_v2",
      "signature": "bigint, text, jsonb, integer, bigint, text, text, text, text, text, numeric, text",
      "guard": "PLAIN",
      "family": "PUBLIC_ORDER",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "b1dc6bfd940c2355286fc0950c318c45",
      "origin": "162"
    },
    {
      "id": "RPC:pub_solicitar_conta/2",
      "kind": "RPC",
      "name": "pub_solicitar_conta",
      "signature": "bigint, text",
      "guard": "PLAIN",
      "family": "PUBLIC_ORDER_BILL",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "9902d71e9d7cb17eeb74d2f5fb2d1def",
      "origin": "162"
    },
    {
      "id": "RPC:pub_solicitar_conta/3",
      "kind": "RPC",
      "name": "pub_solicitar_conta",
      "signature": "bigint, text, boolean",
      "guard": "PLAIN",
      "family": "PUBLIC_ORDER_BILL",
      "classification": "FENCE_GUARD_REQUIRED",
      "guardStatement": "perform public.app_assert_business_write_allowed(null, null);",
      "md5": "222adbfa71b6b375e444c88183f75e0a",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_cest",
      "kind": "TABLE",
      "table": "fiscal_catalogo_cest",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_cest",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_cfop",
      "kind": "TABLE",
      "table": "fiscal_catalogo_cfop",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_cfop",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_csosn",
      "kind": "TABLE",
      "table": "fiscal_catalogo_csosn",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_csosn",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_cst_cofins",
      "kind": "TABLE",
      "table": "fiscal_catalogo_cst_cofins",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_cst_cofins",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_cst_icms",
      "kind": "TABLE",
      "table": "fiscal_catalogo_cst_icms",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_cst_icms",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_cst_pis",
      "kind": "TABLE",
      "table": "fiscal_catalogo_cst_pis",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_cst_pis",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_catalogo_ncm",
      "kind": "TABLE",
      "table": "fiscal_catalogo_ncm",
      "trigger": "aaa_maintenance_guard_fiscal_catalogo_ncm",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_regra",
      "kind": "TABLE",
      "table": "fiscal_regra",
      "trigger": "aaa_maintenance_guard_fiscal_regra",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_regra_versao",
      "kind": "TABLE",
      "table": "fiscal_regra_versao",
      "trigger": "aaa_maintenance_guard_fiscal_regra_versao",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_template",
      "kind": "TABLE",
      "table": "fiscal_template",
      "trigger": "aaa_maintenance_guard_fiscal_template",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:fiscal_template_regra",
      "kind": "TABLE",
      "table": "fiscal_template_regra",
      "trigger": "aaa_maintenance_guard_fiscal_template_regra",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:loja_fiscal_emitente",
      "kind": "TABLE",
      "table": "loja_fiscal_emitente",
      "trigger": "aaa_maintenance_guard_loja_fiscal_emitente",
      "triggerFunction": "app_maintenance_business_write_registry_trigger",
      "family": "TABLE_TRIGGER_162_REGISTRY_AWARE",
      "classification": "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:loja_fiscal_nfce",
      "kind": "TABLE",
      "table": "loja_fiscal_nfce",
      "trigger": "aaa_maintenance_guard_loja_fiscal_nfce",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:loja_fiscal_regra",
      "kind": "TABLE",
      "table": "loja_fiscal_regra",
      "trigger": "aaa_maintenance_guard_loja_fiscal_regra",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:pagamento_alocacoes",
      "kind": "TABLE",
      "table": "pagamento_alocacoes",
      "trigger": "aaa_maintenance_guard_pagamento_alocacoes",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:pagamento_eventos",
      "kind": "TABLE",
      "table": "pagamento_eventos",
      "trigger": "aaa_maintenance_guard_pagamento_eventos",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:pagamento_transacoes",
      "kind": "TABLE",
      "table": "pagamento_transacoes",
      "trigger": "aaa_maintenance_guard_pagamento_transacoes",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_cargos",
      "kind": "TABLE",
      "table": "tab_cargos",
      "trigger": "aaa_maintenance_guard_tab_cargos",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_chamados",
      "kind": "TABLE",
      "table": "tab_chamados",
      "trigger": "aaa_maintenance_guard_tab_chamados",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_clientes",
      "kind": "TABLE",
      "table": "tab_clientes",
      "trigger": "aaa_maintenance_guard_tab_clientes",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_dispositivos",
      "kind": "TABLE",
      "table": "tab_dispositivos",
      "trigger": "aaa_maintenance_guard_tab_dispositivos",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_dispositivos_bloqueados",
      "kind": "TABLE",
      "table": "tab_dispositivos_bloqueados",
      "trigger": "aaa_maintenance_guard_tab_dispositivos_bloqueados",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_grupos_opcoes",
      "kind": "TABLE",
      "table": "tab_grupos_opcoes",
      "trigger": "aaa_maintenance_guard_tab_grupos_opcoes",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "MIG144_TABLE_TRIGGERS",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "144"
    },
    {
      "id": "TABLE:tab_leads",
      "kind": "TABLE",
      "table": "tab_leads",
      "trigger": "aaa_maintenance_guard_tab_leads",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_opcoes",
      "kind": "TABLE",
      "table": "tab_opcoes",
      "trigger": "aaa_maintenance_guard_tab_opcoes",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "MIG144_TABLE_TRIGGERS",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "144"
    },
    {
      "id": "TABLE:tab_pesquisa_satisfacao",
      "kind": "TABLE",
      "table": "tab_pesquisa_satisfacao",
      "trigger": "aaa_maintenance_guard_tab_pesquisa_satisfacao",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "TABLE_TRIGGER_162",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "162"
    },
    {
      "id": "TABLE:tab_promocoes",
      "kind": "TABLE",
      "table": "tab_promocoes",
      "trigger": "aaa_maintenance_guard_tab_promocoes",
      "triggerFunction": "app_maintenance_business_write_trigger",
      "family": "MIG144_TABLE_TRIGGERS",
      "classification": "FENCE_GUARD_REQUIRED",
      "origin": "144"
    }
  ],
  "registry": [
    {
      "type": "CHECKOUT",
      "members": [
        "RPC:app_checkout_begin/2",
        "RPC:app_checkout_commit/2",
        "CORE:app_maintenance_operation_begin_internal/1"
      ]
    },
    {
      "type": "ONBOARDING",
      "members": [
        "RPC:app_onboarding_criar_loja/7",
        "RPC:app_onboarding_criar_categoria/6",
        "RPC:app_onboarding_seed_formas_pagamento/2",
        "RPC:app_onboarding_salvar_emitente/3",
        "CORE:app_maintenance_operation_begin_internal/1"
      ]
    }
  ],
  "excludedTables": [
    "tab_user_sessions",
    "tab_access_events",
    "tab_access_page_stays"
  ],
  "excludedWriters": [
    {
      "name": "seed_demo_empresa",
      "reason": "SEED_DEMO_SECURITY_INVOKER_SEM_PRIVILEGIO_DIRETO"
    },
    {
      "name": "seed_demo_produto",
      "reason": "SEED_DEMO_SECURITY_INVOKER_SEM_PRIVILEGIO_DIRETO"
    }
  ]
});

const byId = (left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/**
 * Entrada canônica do hash (idêntica ao SQL do probe): versão + linhas
 * `id|kind|name-ou-table|signature|trigger|md5` ordenadas por id (ordem C).
 */
export function manifestCanonicalString(manifest = WRITE_FENCE_MANIFEST) {
  const lines = [...manifest.entries].sort(byId).map((entry) => [
    entry.id,
    entry.kind,
    entry.name ?? entry.table,
    entry.signature ?? "",
    entry.trigger ?? "",
    entry.md5 ?? "",
  ].join("|"));
  return `${manifest.version}\n${lines.join("\n")}`;
}

export function computeManifestHash(manifest = WRITE_FENCE_MANIFEST) {
  return crypto.createHash("sha256").update(manifestCanonicalString(manifest), "utf8").digest("hex");
}

export const WRITE_FENCE_MANIFEST_HASH = computeManifestHash();

export const CLASSIFICATIONS = Object.freeze([
  "FENCE_GUARD_REQUIRED",
  "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED",
  "GUARD_CORE",
]);

export const WRITE_FENCE_ENTRIES = WRITE_FENCE_MANIFEST.entries;
export const REQUIRED_PATH_IDS = Object.freeze(WRITE_FENCE_ENTRIES.map((entry) => entry.id));

/** Caminhos de escrita de negócio (RPC + tabela); GUARD_CORE é infraestrutura. */
export const WRITE_PATHS = Object.freeze(WRITE_FENCE_ENTRIES.filter((entry) => entry.kind !== "CORE"));
export const FENCE_ONLY_PATHS = Object.freeze(
  WRITE_PATHS.filter((entry) => entry.classification === "FENCE_GUARD_REQUIRED").map((entry) => entry.id),
);
export const REGISTRY_REQUIRED_PATHS = Object.freeze(
  WRITE_PATHS.filter((entry) => entry.classification === "FENCE_GUARD_PLUS_OPERATION_REGISTRY_REQUIRED").map((entry) => entry.id),
);
export const REGISTRY_REQUIRED_OPERATION_TYPES = Object.freeze(WRITE_FENCE_MANIFEST.registry.map((group) => group.type));

export function findEntry(id) {
  return WRITE_FENCE_ENTRIES.find((entry) => entry.id === id) ?? null;
}

export const WRITE_FENCE_MANIFEST_SUMMARY = Object.freeze({
  version: WRITE_FENCE_MANIFEST_VERSION,
  hash: WRITE_FENCE_MANIFEST_HASH,
  totalEntries: WRITE_FENCE_ENTRIES.length,
  writePathCount: WRITE_PATHS.length,
  rpcPathCount: WRITE_FENCE_ENTRIES.filter((entry) => entry.kind === "RPC").length,
  tablePathCount: WRITE_FENCE_ENTRIES.filter((entry) => entry.kind === "TABLE").length,
  coreCount: WRITE_FENCE_ENTRIES.filter((entry) => entry.kind === "CORE").length,
  fenceOnlyCount: FENCE_ONLY_PATHS.length,
  registryRequiredCount: REGISTRY_REQUIRED_PATHS.length,
});
