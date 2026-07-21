import { useCallback, useEffect, useState } from "react";

// 30s exatos — só depois disso o convite pode aparecer (nunca antes).
export const PWA_PROMPT_DELAY_MS = 30_000;
// Intervalo de nova tentativa enquanto um momento crítico bloqueia a
// exibição (pagamento, checkout, outro diálogo já aberto).
const RETRY_MS = 1_500;

// Qualquer role="dialog" já em tela conta como "momento crítico" — não
// exige que cada tela se registre manualmente (pagamento, checkout,
// confirmação destrutiva, login, os próprios painéis de notificação já
// usam esse padrão neste projeto). Checa o DOM real no instante em que
// tentaríamos abrir, em vez de manter uma lista central frágil de rotas.
function existeDialogoCritico() {
  return typeof document !== "undefined" && document.querySelectorAll('[role="dialog"]').length > 0;
}

/**
 * Controla QUANDO o convite pode aparecer: 30s decorridos (só conta com
 * a aba visível — se estiver oculta no instante exato, espera voltar a
 * ficar visível sem reiniciar a contagem), status elegível (não
 * "checking"/"running-as-app"), sem momento crítico em andamento, e sem
 * recusa nesta carga. Recusa fica só em memória (useState) — nunca em
 * localStorage/sessionStorage; reload completo reinicia tudo porque o
 * componente é remontado do zero; navegação interna da SPA não reinicia
 * nada porque o Provider fica montado uma única vez na raiz.
 */
export function usePwaPromptTimer(status) {
  const [tempoDecorrido, setTempoDecorrido] = useState(false);
  const [recusado, setRecusado] = useState(false);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    let ativo = true;
    let onVis = null;
    const timeoutId = setTimeout(() => {
      if (!ativo) return;
      if (document.visibilityState === "visible") { setTempoDecorrido(true); return; }
      onVis = () => {
        if (document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVis);
          if (ativo) setTempoDecorrido(true);
        }
      };
      document.addEventListener("visibilitychange", onVis);
    }, PWA_PROMPT_DELAY_MS);
    return () => { ativo = false; clearTimeout(timeoutId); if (onVis) document.removeEventListener("visibilitychange", onVis); };
  }, []);

  useEffect(() => {
    if (!tempoDecorrido || recusado) return;
    if (status === "checking" || status === "running-as-app") return;

    let ativo = true;
    const tentar = () => {
      if (!ativo || existeDialogoCritico()) return;
      setVisivel(true);
      clearInterval(intervalId);
    };
    const intervalId = setInterval(tentar, RETRY_MS);
    tentar();
    return () => { ativo = false; clearInterval(intervalId); };
  }, [tempoDecorrido, recusado, status]);

  // Usado por "Não"/"Agora não"/"Concluir" — fecha e não reabre mais
  // nesta carga de página (memória apenas, ver comentário acima).
  const dispensar = useCallback(() => { setRecusado(true); setVisivel(false); }, []);
  // Fecha sem marcar recusa "permanente" desta carga (ex.: instalação
  // concluída com sucesso — não há mais nada pra oferecer, mas não é
  // uma recusa do usuário).
  const fechar = useCallback(() => setVisivel(false), []);

  return { visivel, dispensar, fechar };
}
