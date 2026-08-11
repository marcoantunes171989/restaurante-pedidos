import { useEffect, useRef } from "react";
import { ACCESS_HEARTBEAT_MS } from "../lib/accessControl/constants.js";
import {
  heartbeatSessaoAcesso,
  iniciarSessaoAcesso,
  limparSessionToken,
} from "../lib/accessControl/api.js";

/**
 * Mantém a sessão de acesso viva enquanto o usuário está logado.
 * - inicia/reativa a sessão ao montar (após Auth disponível)
 * - heartbeat periódico (45s) + ao voltar o foco da aba
 * - se a sessão foi encerrada remotamente → limpa token e chama onSessionRevoked
 *
 * @param {object|null} currentUser
 * @param {{ onSessionRevoked?: () => void }} [options]
 */
export function useUserSessionHeartbeat(currentUser, options = {}) {
  const startedRef = useRef(false);
  const revokedRef = useRef(false);
  const onRevokedRef = useRef(options.onSessionRevoked);
  onRevokedRef.current = options.onSessionRevoked;

  useEffect(() => {
    if (!currentUser?.id) {
      startedRef.current = false;
      revokedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    async function boot() {
      if (cancelled || revokedRef.current) return;
      await iniciarSessaoAcesso({ loginMethod: "password" });
      startedRef.current = true;
    }

    async function tick() {
      if (cancelled || revokedRef.current || document.visibilityState === "hidden") return;
      const result = await heartbeatSessaoAcesso();
      if (cancelled || revokedRef.current) return;
      if (result?.status === "closed") {
        revokedRef.current = true;
        limparSessionToken();
        try { onRevokedRef.current?.(); } catch { /* ignore */ }
      }
    }

    boot();
    timer = setInterval(tick, ACCESS_HEARTBEAT_MS);

    const onFocus = () => { tick(); };
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentUser?.id]);
}
