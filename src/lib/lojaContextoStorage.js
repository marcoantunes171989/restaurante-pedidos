/** Persistência da "empresa em foco" do super admin (sobrevive a F5 / deep-link). */
export const CHAVE_LOJA_CONTEXTO = "pedidoPrime:lojaContexto";

function numeroOuNulo(valor) {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function lerLojaContextoPersistido() {
  try {
    const raw = localStorage.getItem(CHAVE_LOJA_CONTEXTO);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      userId: numeroOuNulo(parsed?.userId),
      lojaId: numeroOuNulo(parsed?.lojaId),
    };
  } catch {
    return null;
  }
}

export function salvarLojaContextoPersistido(userId, lojaId) {
  try {
    const lid = numeroOuNulo(lojaId);
    if (lid == null) {
      localStorage.removeItem(CHAVE_LOJA_CONTEXTO);
      return;
    }
    localStorage.setItem(CHAVE_LOJA_CONTEXTO, JSON.stringify({
      userId: numeroOuNulo(userId),
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
 */
export function resolverLojaContextoPersistido(user, persistido, lojas = []) {
  if (!user?.superAdmin) return null;
  if (!persistido || persistido.lojaId == null) return null;
  if (persistido.userId != null && Number(persistido.userId) !== Number(user.id)) return null;
  if (Array.isArray(lojas) && lojas.length > 0) {
    const existe = lojas.some((l) => Number(l.id) === Number(persistido.lojaId));
    if (!existe) return null;
  }
  return persistido.lojaId;
}
