import { useCallback, useEffect, useState } from "react";

// 30s exatos — só depois disso o convite pode aparecer (nunca antes).
export const PWA_PROMPT_DELAY_MS = 30_000;
// Intervalo de nova tentativa enquanto um momento crítico bloqueia a
// exibição (pagamento, checkout, outro diálogo já aberto).
const RETRY_MS = 1_500;

// Únicos status com confiança suficiente para sugerir instalação —
// ALLOWLIST (não denylist): qualquer status novo que venha a existir no
// futuro fica de fora por padrão, sem exigir lembrar de excluí-lo aqui.
// De fora ficam, sempre: "checking" (detecção ainda em andamento —
// nunca mostra nada antes de terminar), "running-as-app" (já é o app,
// nunca sugere instalar de novo), "installed-detected" (instalação já
// confirmada — no máximo uma ação discreta e não bloqueante faria
// sentido aqui, e hoje não existe forma confiável de "abrir o app
// instalado" por JS; por isso não mostramos nada) e "unknown" (não dá
// pra afirmar nada com segurança — nunca modal automático).
const STATUS_ELEGIVEL = new Set(["installable-native", "manual-install", "ios-manual-install"]);

// Sessão do navegador (sobrevive a um F5, mas não a fechar a aba) — uma
// recusa não deve voltar a aparecer nem depois de recarregar a página.
const CHAVE_DISPENSADO_SESSAO = "pedido-prime:pwa-install-dismissed-session";
function lerDispensadoNaSessao() {
  try { return sessionStorage.getItem(CHAVE_DISPENSADO_SESSAO) === "1"; } catch { return false; }
}
function gravarDispensadoNaSessao() {
  try { sessionStorage.setItem(CHAVE_DISPENSADO_SESSAO, "1"); } catch { /* sessionStorage indisponível — recusa vale só em memória nesta carga */ }
}

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
 * ficar visível sem reiniciar a contagem), status elegível (ver
 * STATUS_ELEGIVEL — nunca "checking"/"running-as-app"/
 * "installed-detected"/"unknown"), sem momento crítico em andamento, e
 * sem recusa nesta sessão do navegador (sessionStorage — sobrevive a
 * F5, mas não a fechar a aba). Navegação interna da SPA nunca reinicia
 * nada porque o Provider fica montado uma única vez na raiz.
 */
export function usePwaPromptTimer(status) {
  const [tempoDecorrido, setTempoDecorrido] = useState(false);
  const [recusado, setRecusado] = useState(lerDispensadoNaSessao);
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
    if (!STATUS_ELEGIVEL.has(status)) return;

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
  // nesta sessão do navegador (sessionStorage: sobrevive a F5, some ao
  // fechar a aba — ver CHAVE_DISPENSADO_SESSAO acima).
  const dispensar = useCallback(() => { gravarDispensadoNaSessao(); setRecusado(true); setVisivel(false); }, []);
  // Fecha sem marcar recusa "permanente" desta carga (ex.: instalação
  // concluída com sucesso — não há mais nada pra oferecer, mas não é
  // uma recusa do usuário).
  const fechar = useCallback(() => setVisivel(false), []);

  return { visivel, dispensar, fechar };
}
