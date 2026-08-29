import { useEffect, useRef } from "react";
import { ACCESS_HEARTBEAT_MS } from "../lib/accessControl/constants.js";
import {
  heartbeatSessaoAcesso,
  iniciarSessaoAcesso,
  limparSessionToken,
  escutarSessaoPropria,
  trocarContextoSessaoAcesso,
} from "../lib/accessControl/api.js";

/**
 * Mantém a sessão de acesso viva enquanto o usuário está logado.
 * - inicia/reativa a sessão ao montar
 * - realtime na própria sessão → logout IMEDIATO se admin encerrar/bloquear
 * - heartbeat periódico como fallback
 *
 * @param {object|null} currentUser
 * @param {{
 *   onSessionRevoked?: (motivo: string) => void,
 *   onSessionStarted?: () => void,
 *   shouldSuppressRevocation?: () => boolean,
 * }} [options]
 */
export function useUserSessionHeartbeat(currentUser, options = {}) {
  const startedRef = useRef(false);
  const revokedRef = useRef(false);
  const contextRef = useRef("__unset__");
  const onRevokedRef = useRef(options.onSessionRevoked);
  const onStartedRef = useRef(options.onSessionStarted);
  const shouldSuppressRevocationRef = useRef(options.shouldSuppressRevocation);
  // Sincroniza fora do render (não durante) — react-hooks/refs não permite
  // escrever em ref.current no corpo da função de render.
  useEffect(() => {
    onRevokedRef.current = options.onSessionRevoked;
    onStartedRef.current = options.onSessionStarted;
    shouldSuppressRevocationRef.current = options.shouldSuppressRevocation;
  });

  useEffect(() => {
    if (!currentUser?.id) {
      startedRef.current = false;
      revokedRef.current = false;
      contextRef.current = "__unset__";
      return undefined;
    }

    let cancelled = false;
    let timer = null;
    let stopRealtime = null;

    function revogar(motivo) {
      if (cancelled || revokedRef.current) return;
      // Suprime a revogação quando o caller sinaliza que não deve prosseguir:
      // um logout LOCAL já em andamento (não adiantar a limpeza do
      // ACCESS_SESSION_KEY nem disparar um segundo logout por cima do
      // primeiro — encerrarSessaoAcesso() do logout local precisa do token
      // ainda presente), OU quando ainda não existe sessão local válida/
      // pronta para este lifecycle (ex.: login que ainda não concluiu
      // app_sessao_iniciar). Consultado em tempo real (função, não boolean
      // capturado) para refletir o estado corrente do caller (App.jsx).
      if (shouldSuppressRevocationRef.current?.()) return;
      revokedRef.current = true;
      limparSessionToken();
      try { onRevokedRef.current?.(motivo); } catch { /* ignore */ }
    }

    async function boot() {
      if (cancelled || revokedRef.current) return;
      try {
        const contextoAtual = options.trackCompanyContext ? (options.lojaId ?? null) : null;
        const deveTrocarContexto = options.trackCompanyContext
          && startedRef.current
          && contextRef.current !== "__unset__"
          && contextRef.current !== contextoAtual;
        const sessionId = deveTrocarContexto
          ? await trocarContextoSessaoAcesso(contextoAtual)
          : await iniciarSessaoAcesso({ loginMethod: "password" });
        if (sessionId) contextRef.current = contextoAtual;
        startedRef.current = true;
        if (cancelled || revokedRef.current) return;
        // Sinaliza ao caller que a sessão do dispositivo está pronta SOMENTE
        // quando app_sessao_iniciar (não troca de contexto de empresa)
        // concluiu com sucesso — é o ponto exato em que existe uma sessão de
        // acesso nova e válida.
        if (sessionId && !deveTrocarContexto) {
          try { onStartedRef.current?.(); } catch { /* ignore */ }
        }
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
  }, [currentUser?.id, options.trackCompanyContext, options.lojaId]);
}
