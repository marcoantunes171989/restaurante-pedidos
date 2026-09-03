/** Persistência da "empresa em foco" do super admin (sobrevive a F5 / deep-link). */
export const CHAVE_LOJA_CONTEXTO = "pedidoPrime:lojaContexto";

function numeroOuNulo(valor) {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function lojaAutorizadaDaLista(lojas, lojaId) {
  if (!Array.isArray(lojas) || lojas.length === 0) return null;
  const alvo = numeroOuNulo(lojaId);
  if (alvo == null) return null;
  const loja = lojas.find((l) => Number(l.id) === alvo);
  if (!loja) return null;
  if (loja.active === false) return null;
  return loja;
}

export function lerLojaContextoPersistido() {
  try {
    const raw = localStorage.getItem(CHAVE_LOJA_CONTEXTO);
    if (!raw) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      localStorage.removeItem(CHAVE_LOJA_CONTEXTO);
      return null;
    }
    const userId = numeroOuNulo(parsed?.userId);
    const lojaId = numeroOuNulo(parsed?.lojaId);
    if (userId == null || lojaId == null) {
      localStorage.removeItem(CHAVE_LOJA_CONTEXTO);
      return null;
    }
    return { userId, lojaId };
  } catch {
    return null;
  }
}

export function salvarLojaContextoPersistido(userId, lojaId) {
  try {
    const uid = numeroOuNulo(userId);
    const lid = numeroOuNulo(lojaId);
    if (lid == null || uid == null) {
      localStorage.removeItem(CHAVE_LOJA_CONTEXTO);
      return;
    }
    localStorage.setItem(CHAVE_LOJA_CONTEXTO, JSON.stringify({
      userId: uid,
      lojaId: lid,
    }));
  } catch { /* localStorage indisponível */ }
}

export function limparLojaContextoPersistido() {
  try { localStorage.removeItem(CHAVE_LOJA_CONTEXTO); } catch { /* localStorage indisponível */ }
}

/**
 * Super admin: devolve o lojaId persistido se ainda for válido para este usuário.
 * Outros perfis ignoram o storage (loja vem do próprio usuário).
 * Nunca autoriza pelo localStorage: userId e lista atual de lojas são obrigatórios.
 */
export function resolverLojaContextoPersistido(user, persistido, lojas = []) {
  if (!user || user.active === false) return null;
  if (!user.superAdmin) return null;
  if (!persistido || persistido.lojaId == null) return null;
  if (persistido.userId == null || Number(persistido.userId) !== Number(user.id)) return null;
  const loja = lojaAutorizadaDaLista(lojas, persistido.lojaId);
  if (!loja) return null;
  return numeroOuNulo(persistido.lojaId);
}

/**
 * Ponto único de hidratação: lê o storage, valida contra o usuário autenticado
 * e a lista atual de lojas autorizadas, e remove a entrada se for inválida.
 * Chamado pelo App só depois de existir currentUser + lojas do bootstrap.
 */
export function hidratarLojaContextoPersistido(user, lojas = []) {
  if (!user) return null;
  const persistido = lerLojaContextoPersistido();
  const lojaId = resolverLojaContextoPersistido(user, persistido, lojas);
  if (lojaId == null) limparLojaContextoPersistido();
  return lojaId;
}

/**
 * O efeito de gravação só pode tocar no storage depois da hidratação inicial.
 * Evita o cenário: lojaContexto começa null → efeito apaga a chave → restore perde o valor.
 */
export function persistirLojaContextoSePronto({ hydrated, user, lojaId }) {
  if (!hydrated || !user?.superAdmin) return false;
  const uid = numeroOuNulo(user.id);
  const lid = numeroOuNulo(lojaId);
  const atual = lerLojaContextoPersistido();
  if (lid == null) {
    if (atual == null) return false;
    limparLojaContextoPersistido();
    return true;
  }
  if (atual && Number(atual.userId) === Number(uid) && Number(atual.lojaId) === Number(lid)) {
    return false;
  }
  salvarLojaContextoPersistido(uid, lid);
  return true;
}

/** Super admin não monta a Cozinha com id ainda não validado ou loja inválida/inativa. */
export function podeMontarPainelCozinha({
  permitido,
  superAdmin,
  hydrated,
  lojaId,
  lojas = [],
} = {}) {
  if (!permitido) return false;
  if (!superAdmin) return true;
  if (!hydrated) return false;
  if (lojaId == null) return true;
  return lojaAutorizadaDaLista(lojas, lojaId) != null;
}
