import { useEffect, useRef } from "react";
import { ACCESS_HEARTBEAT_MS } from "../lib/accessControl/constants.js";
import {
  heartbeatSessaoAcesso,
  iniciarSessaoAcesso,
} from "../lib/accessControl/api.js";

/**
 * Mantém a sessão de acesso viva enquanto o usuário está logado.
 * - inicia/reativa a sessão ao montar (após Auth disponível)
 * - heartbeat periódico (45s) + ao voltar o foco da aba
 */
export function useUserSessionHeartbeat(currentUser) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!currentUser?.id) {
      startedRef.current = false;
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    async function boot() {
      if (cancelled) return;
      await iniciarSessaoAcesso({ loginMethod: "password" });
      startedRef.current = true;
    }

    async function tick() {
      if (cancelled || document.visibilityState === "hidden") return;
      await heartbeatSessaoAcesso();
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
