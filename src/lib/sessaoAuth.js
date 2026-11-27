// A tela logada só vale enquanto a sessão do Supabase Auth existir neste navegador.
// Sem ela, as chamadas saem com a chave anônima e o banco responde 401 em repetição.

export const MSG_SESSAO_ENCERRADA = "Sua sessão foi encerrada. Entre novamente com e-mail e senha.";
export const MSG_SESSAO_SEM_CONEXAO = "Não foi possível confirmar sua sessão. Verifique a internet e recarregue a página.";
export const INTERVALO_VERIFICACAO_SESSAO_MS = 15_000;

/**
 * "ausente" só quando o Auth responde, sem erro, que não há sessão. Falha ao
 * renovar o token (rede fora, servidor indisponível) é "indefinida": a sessão
 * pode continuar válida e ninguém é deslogado por isso. Quando a renovação é
 * recusada de vez, o próprio supabase-js apaga a sessão e a consulta seguinte
 * já responde "ausente".
 * @returns {Promise<"presente"|"ausente"|"indefinida">}
 */
export async function estadoSessaoAuth(auth) {
  try {
    const { data, error } = await auth.getSession();
    if (data?.session) return "presente";
    return error ? "indefinida" : "ausente";
  } catch {
    return "indefinida";
  }
}

/**
 * Observa a sessão enquanto há usuário na tela: eventos do Auth (inclui saída em
 * outra aba), mudanças no armazenamento, retorno à aba/rede e, porque apagar o
 * armazenamento não gera evento nenhum, uma conferência periódica.
 *
 * @param {object} opcoes
 * @param {object} opcoes.auth cliente `supabase.auth`
 * @param {() => (void|Promise<void>)} opcoes.aoPerder chamada quando a sessão deixou de existir
 * @param {() => boolean} [opcoes.suprimir] true enquanto a ausência é esperada (logout em andamento)
 * @param {number} [opcoes.intervaloMs]
 * @returns {() => void} cleanup
 */
export function vigiarSessaoAuth({ auth, aoPerder, suprimir = () => false, intervaloMs = INTERVALO_VERIFICACAO_SESSAO_MS }) {
  let ativo = true;
  let ocupado = false;
  let repetir = false;

  async function verificar() {
    if (!ativo || suprimir()) return;
    // Uma conferência por vez; pedido que chega no meio roda logo depois.
    if (ocupado) { repetir = true; return; }
    ocupado = true;
    try {
      do {
        repetir = false;
        const estado = await estadoSessaoAuth(auth);
        if (ativo && estado === "ausente" && !suprimir()) await aoPerder();
      } while (repetir && ativo && !suprimir());
    } catch { /* a próxima conferência tenta de novo */ } finally {
      ocupado = false;
    }
  }

  // Fora do callback do Auth: chamar o Auth de dentro dele pode travar a biblioteca.
  const agendar = () => { setTimeout(verificar, 0); };

  const assinatura = auth.onAuthStateChange?.((_evento, sessao) => {
    // Avaliado na hora do evento: o signOut do próprio logout() não conta.
    if (!sessao && !suprimir()) agendar();
  });
  const aoVoltar = () => { if (document.visibilityState !== "hidden") verificar(); };
  const intervalo = setInterval(verificar, intervaloMs);
  window.addEventListener("storage", verificar);
  window.addEventListener("focus", verificar);
  window.addEventListener("online", verificar);
  document.addEventListener("visibilitychange", aoVoltar);
  agendar();

  return () => {
    ativo = false;
    clearInterval(intervalo);
    assinatura?.data?.subscription?.unsubscribe?.();
    window.removeEventListener("storage", verificar);
    window.removeEventListener("focus", verificar);
    window.removeEventListener("online", verificar);
    document.removeEventListener("visibilitychange", aoVoltar);
  };
}
