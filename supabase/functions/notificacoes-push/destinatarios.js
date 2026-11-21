// ════════════════════════════════════════════════════════════
//  Quem recebe a notificação de pedido — função PURA (sem Deno/IO),
//  usada pela Edge Function notificacoes-push e testada pelo vitest.
//
//  Regra:
//   • Novo pedido  → todo usuário ativo da loja.
//   • Caixa        → usuários da loja com acesso ao Caixa.
//   • Administrador geral (super admin, sem loja fixa) → recebe os dois
//     tipos SE tiver aparelho ativo com aquela loja em foco.
//   • Preferências por usuário (push desligado / tipo desligado) valem
//     para todos; sem linha de preferência = tudo ligado.
// ════════════════════════════════════════════════════════════

const OP_MODULOS = ["op_pedidos", "op_cozinha", "op_bar", "op_caixa"];

/** Mesma derivação de acesso operacional do front (acessosOperacionais, src/App.jsx). */
export function acessosOperacionais(idsAcesso, superAdmin) {
  const ids = idsAcesso || [];
  const has = (id) => ids.includes(id);
  const total = !!superAdmin || has("admin") || OP_MODULOS.every(has);
  if (total) return { pedidos: true, cozinha: true, bar: true, caixa: true };
  const temOpEspecifico = has("op_managed") || OP_MODULOS.some(has);
  if (temOpEspecifico) return { pedidos: has("op_pedidos"), cozinha: has("op_cozinha"), bar: has("op_bar"), caixa: has("op_caixa") };
  // Legado: quem tinha "kitchen" via Pedidos/Cozinha/Bar; "cashier" via Caixa.
  return { pedidos: has("kitchen"), cozinha: has("kitchen"), bar: has("kitchen"), caixa: has("cashier") };
}

/**
 * @param {{evento:string, usuariosLoja:object[], superAdminsEmFoco:object[], prefs:object[]}} p
 * @returns {object[]} usuários elegíveis (sem duplicados)
 */
export function escolherDestinatarios({ evento, usuariosLoja, superAdminsEmFoco, prefs }) {
  const ehCaixa = evento === "caixa_aguardando";
  const prefsPorUsuario = new Map((prefs || []).map((p) => [p.usuario_id, p]));

  const candidatos = new Map();
  for (const u of usuariosLoja || []) {
    if (!u || u.ativo === false) continue;
    if (ehCaixa && !acessosOperacionais(u.ids_acesso, !!u.super_admin).caixa) continue;
    candidatos.set(u.id, u);
  }
  for (const u of superAdminsEmFoco || []) {
    if (!u || u.ativo === false || !u.super_admin) continue;
    candidatos.set(u.id, u);
  }

  return [...candidatos.values()].filter((u) => {
    const p = prefsPorUsuario.get(u.id);
    if (!p) return true; // sem preferência salva ainda → padrão ligado
    if (p.push_ativo === false) return false;
    return ehCaixa ? p.alerta_caixa !== false : p.alerta_novo_pedido !== false;
  });
}
