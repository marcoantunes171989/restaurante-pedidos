import { useEffect, useRef } from "react";
import {
  encerrarPageStay,
  iniciarPageStay,
} from "../lib/accessControl/api.js";

/**
 * Registra permanência do usuário logado em cada tela (screen_key).
 * Ao trocar de tela, encerra a permanência anterior e abre uma nova.
 *
 * @param {object|null} currentUser
 * @param {{ screenKey?: string, screenLabel?: string, route?: string }} tela
 */
export function useAccessPageTracking(currentUser, tela = {}) {
  const stayIdRef = useRef(null);
  const keyRef = useRef("");
  const info = tela || {};

  useEffect(() => {
    if (!currentUser?.id || !info.screenKey) {
      return undefined;
    }

    let cancelled = false;
    const key = info.screenKey;

    async function abrir() {
      // Evita reabrir a mesma tela (ex.: re-render)
      if (keyRef.current === key && stayIdRef.current) return;
      if (stayIdRef.current) {
        try { await encerrarPageStay(stayIdRef.current); } catch { /* ignore */ }
        stayIdRef.current = null;
      }
      keyRef.current = key;
      let id = await iniciarPageStay({
        route: info.route,
        screenKey: info.screenKey,
        screenLabel: info.screenLabel,
      });
      // Sessão pode ainda estar iniciando (race com heartbeat) — tenta de novo
      if (!id && !cancelled) {
        await new Promise((r) => setTimeout(r, 900));
        if (!cancelled) {
          id = await iniciarPageStay({
            route: info.route,
            screenKey: info.screenKey,
            screenLabel: info.screenLabel,
          });
        }
      }
      if (!cancelled && id) stayIdRef.current = id;
    }

    abrir();

    const onVis = () => {
      if (document.visibilityState === "hidden" && stayIdRef.current) {
        const id = stayIdRef.current;
        stayIdRef.current = null;
        encerrarPageStay(id).catch(() => {});
      } else if (document.visibilityState === "visible" && !stayIdRef.current && !cancelled) {
        abrir();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onHide);
      if (stayIdRef.current) {
        const id = stayIdRef.current;
        stayIdRef.current = null;
        encerrarPageStay(id).catch(() => {});
      }
    };
  }, [currentUser?.id, info.screenKey, info.screenLabel, info.route]);
}
