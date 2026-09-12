// ════════════════════════════════════════════════════════════
//  Microgate 08-B3-B — Hook de leitura do aviso de manutenção.
//
//  Chamado EXATAMENTE UMA VEZ na raiz global pós-login (App.jsx) — nenhuma
//  tela interna deve chamar isto de novo, sob pena de duplicar o polling.
//  Somente leitura via src/lib/maintenance.js; nenhum realtime, nenhum
//  BroadcastChannel neste gate (B5 tratará write guard).
// ════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { fetchMaintenanceState } from "../lib/maintenance.js";

export const MAINTENANCE_POLL_MS = 60_000;

export function useMaintenanceState() {
  const [status, setStatus] = useState("loading");
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function load() {
      // Aborta a request anterior (se ainda em voo) antes de iniciar a nova.
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await fetchMaintenanceState({ signal: controller.signal });
        if (cancelled) return;
        if (result.ok) {
          setState(result.state);
          setStatus("ready");
          setError(null);
        } else {
          // Um poll posterior que falha NUNCA sobrescreve o último state
          // válido — só sinaliza status=error, preservando o state atual.
          setStatus("error");
          setError(result.error);
        }
      } catch (e) {
        if (e?.name === "AbortError" || cancelled) return;
        setStatus("error");
        setError("MAINTENANCE_FETCH_FAILED");
      }
    }

    load();
    timer = setInterval(load, MAINTENANCE_POLL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { status, state, error };
}
