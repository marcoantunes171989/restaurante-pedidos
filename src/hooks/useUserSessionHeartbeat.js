import { useEffect, useRef } from "react";
import { ACCESS_HEARTBEAT_MS } from "../lib/accessControl/constants.js";
import {
  heartbeatSessaoAcesso,
  iniciarSessaoAcesso,
  limparSessionToken,
  escutarSessaoPropria,
} from "../lib/accessControl/api.js";

/**
 * Mantém a sessão de acesso viva enquanto o usuário está logado.
 * - inicia/reativa a sessão ao montar
 * - realtime na própria sessão → logout IMEDIATO se admin encerrar/bloquear
 * - heartbeat periódico como fallback
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
    let stopRealtime = null;

    function revogar(motivo) {
      if (cancelled || revokedRef.current) return;
      revokedRef.current = true;
      limparSessionToken();
      try { onRevokedRef.current?.(motivo); } catch { /* ignore */ }
    }

    async function boot() {
      if (cancelled || revokedRef.current) return;
      try {
        const sessionId = await iniciarSessaoAcesso({ loginMethod: "password" });
        startedRef.current = true;
        if (cancelled || revokedRef.current) return;
        if (sessionId) {
          stopRealtime = escutarSessaoPropria(sessionId, () => {
            revogar("remote");
          });
        }
      } catch (e) {
        if (e?.code === "DEVICE_BLOCKED") {
          revogar("blocked");
          return;
        }
      }
    }

    async function tick() {
      if (cancelled || revokedRef.current || document.visibilityState === "hidden") return;
      const result = await heartbeatSessaoAcesso();
      if (cancelled || revokedRef.current) return;
      if (result?.status === "closed") {
        revogar("heartbeat");
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
      if (stopRealtime) stopRealtime();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentUser?.id]);
}
