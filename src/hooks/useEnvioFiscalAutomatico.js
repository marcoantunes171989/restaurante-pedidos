// E8 parte 4: com o caixa aberto, envia sozinho as notas de contingência.
import { useEffect, useRef } from "react";
import { enviarPendentesDaLoja, INTERVALO_ENVIO_MS } from "../lib/fiscal/envioAutomatico";

export function useEnvioFiscalAutomatico({ ativo, lojaId, buscar, listarNotas = null, onResultado, intervaloMs = INTERVALO_ENVIO_MS }) {
  const rodando = useRef(false);
  const ultimo = useRef({ buscar, listarNotas, onResultado });
  useEffect(() => { ultimo.current = { buscar, listarNotas, onResultado }; }, [buscar, listarNotas, onResultado]);

  useEffect(() => {
    if (!ativo || lojaId == null) return undefined;
    let vivo = true;
    const rodada = async () => {
      if (rodando.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      rodando.current = true;
      try {
        const r = await enviarPendentesDaLoja({ lojaId, buscar: (c) => ultimo.current.buscar(c), listarNotas: ultimo.current.listarNotas ? () => ultimo.current.listarNotas() : null });
        if (vivo) ultimo.current.onResultado?.(r);
      } catch { /* tenta na próxima rodada */ } finally {
        rodando.current = false;
      }
    };
    const primeira = setTimeout(rodada, 15000); // depois que o PDV terminou de carregar
    const timer = setInterval(rodada, intervaloMs);
    window.addEventListener("online", rodada);
    return () => { vivo = false; clearTimeout(primeira); clearInterval(timer); window.removeEventListener("online", rodada); };
  }, [ativo, lojaId, intervaloMs]);
}
