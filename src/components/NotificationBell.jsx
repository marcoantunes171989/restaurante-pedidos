import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, X, Check } from "lucide-react";
import { fetchNotificacoes, escutarNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas } from "../lib/supabase";
import { ouvirOutrasAbas, avisarOutrasAbas } from "../lib/notificacoes";
import { useAnchoredPosition } from "../lib/useAnchoredPosition";
import { useOutsideClick } from "../lib/useOutsideClick";
import { useBodyScrollLock } from "../lib/useBodyScrollLock";

// Mesmo truque de navegação usado pelo botão voltar/avançar do navegador
// (App.jsx: "Sincroniza com a rota (voltar/avançar do navegador →
// /operacional/:sub)") — pushState sozinho não dispara popstate, então
// disparamos manualmente para o router (main.jsx) e a aba (App.jsx)
// reagirem sem precisar de F5 nem de prop-drilling até aqui.
function navegarPara(rota) {
  if (!rota) return;
  window.history.pushState({}, "", rota);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function tempoRelativo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

const ICONE_TIPO = { novo_pedido: "🆕", caixa_aguardando: "💳" };

/**
 * CAUSA RAIZ do painel cortado/"faixa escura estreita" (achada por
 * inspeção real do DOM, não presumida): este componente é renderizado
 * dentro de OrdersHeader.jsx, cujo <header> tem `overflow-hidden` (usado
 * pra recortar a faixa terracota decorativa nos cantos arredondados —
 * ver OrdersHeader.jsx). O painel antigo usava `position:absolute`
 * (ancorado no wrapper local, dentro do header) — um descendente
 * absolutamente posicionado É recortado pelo overflow-hidden de um
 * ancestral, então o painel abria, mas só a fatia que cabia dentro dos
 * ~turnos pixels visíveis do header aparecia; o resto ficava cortado.
 * Confirmado com Playwright: o retângulo do painel ultrapassava o
 * retângulo do header em ~180px, exatamente a "faixa escura estreita"
 * relatada.
 *
 * Correção estrutural: o painel agora é renderizado via createPortal em
 * document.body — sai inteiramente da árvore do header, então nenhum
 * overflow/transform/stacking-context de qualquer ancestral (presente ou
 * futuro) pode mais recortá-lo. Desktop/tablet (>=640px): popover com
 * posição calculada a partir do retângulo real do botão
 * (useAnchoredPosition — recalcula em resize/scroll/rotação, com
 * detecção de colisão nas bordas). Mobile (<640px): bottom sheet fixo,
 * com overlay e trava de scroll do body (useBodyScrollLock).
 */
export default function NotificationBell() {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const botaoRef = useRef(null);
  const painelRef = useRef(null);

  const naoLidas = useMemo(() => itens.filter((n) => !n.lida).length, [itens]);
  const { pos, ehDesktop } = useAnchoredPosition(botaoRef, aberto);

  useEffect(() => {
    let cancelado = false;
    fetchNotificacoes()
      .then((lista) => { if (!cancelado) { setItens(lista); setErro(null); } })
      .catch((e) => { if (!cancelado) setErro(e?.message || "Não foi possível carregar as notificações."); })
      .finally(() => { if (!cancelado) setCarregando(false); });

    const pararRealtime = escutarNotificacoes((lista) => { setItens(lista); setErro(null); });
    const pararBroadcast = ouvirOutrasAbas((msg) => {
      if (msg?.tipo === "atualizado") fetchNotificacoes().then(setItens).catch(() => {});
    });
    return () => { cancelado = true; pararRealtime(); pararBroadcast(); };
  }, []);

  useOutsideClick([botaoRef, painelRef], aberto, () => setAberto(false));
  useBodyScrollLock(aberto && !ehDesktop);

  // Escape fecha e restaura o foco no botão; foco inicial previsível ao
  // abrir (primeiro elemento focável do painel).
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => painelRef.current?.querySelector("button, [href], input, [tabindex]")?.focus(), 0);
    const botao = botaoRef.current;
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); botao?.focus(); };
  }, [aberto]);

  async function abrirNotificacao(n) {
    if (!n.lida) {
      setItens((cur) => cur.map((x) => x.id === n.id ? { ...x, lida: true } : x));
      try { await marcarNotificacaoLida(n.id); avisarOutrasAbas("atualizado"); } catch { /* já refletido localmente */ }
    }
    setAberto(false);
    navegarPara(n.rota);
  }

  async function marcarTodas() {
    setItens((cur) => cur.map((x) => ({ ...x, lida: true })));
    try { await marcarTodasNotificacoesLidas(); avisarOutrasAbas("atualizado"); } catch { /* já refletido localmente */ }
  }

  const painel = aberto && (
    <>
      {!ehDesktop && <div className="fixed inset-0 z-[95] bg-black/50" onClick={() => setAberto(false)} aria-hidden="true" />}
      <div
        ref={painelRef}
        role="dialog"
        aria-label="Notificações"
        className={`pp-notif-panel z-[100] flex flex-col ${
          ehDesktop
            ? "fixed rounded-[20px]"
            : "fixed inset-x-0 bottom-0 max-h-[80dvh] w-full rounded-t-[22px]"
        }`}
        style={ehDesktop && pos
          ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
          : { paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,.1)] p-4">
          <h2 className="text-sm font-bold text-[#fff]">Notificações{naoLidas > 0 ? ` (${naoLidas})` : ""}</h2>
          <div className="flex items-center gap-2">
            {naoLidas > 0 && (
              <button onClick={marcarTodas} type="button" className="flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#f2b84a] hover:bg-[rgba(255,255,255,.08)]">
                <Check aria-hidden="true" size={13} /> Marcar todas como lidas
              </button>
            )}
            <button onClick={() => setAberto(false)} type="button" aria-label="Fechar notificações" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[rgba(255,255,255,.6)] hover:bg-[rgba(255,255,255,.08)]">
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {carregando ? (
            <div className="p-6 text-center text-sm text-[rgba(255,255,255,.5)]">Carregando…</div>
          ) : erro ? (
            <div className="p-6 text-center text-sm text-[#f87171]">{erro}</div>
          ) : itens.length === 0 ? (
            <div className="p-8 text-center">
              <Bell aria-hidden="true" size={26} className="mx-auto mb-2 text-[rgba(255,255,255,.35)]" strokeWidth={1.6} />
              <p className="text-sm font-semibold text-[rgba(255,255,255,.65)]">Nenhuma notificação no momento.</p>
              <p className="mt-1 text-xs text-[rgba(255,255,255,.4)]">Novas atualizações da operação aparecerão aqui.</p>
            </div>
          ) : (
            <ul>
              {itens.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => abrirNotificacao(n)}
                    type="button"
                    className={`flex w-full min-h-[44px] items-start gap-3 border-b border-[rgba(255,255,255,.06)] p-3.5 text-left transition hover:bg-[rgba(255,255,255,.05)] ${!n.lida ? "bg-[rgba(212,160,23,.06)]" : ""}`}
                  >
                    <span className="mt-0.5 shrink-0 text-lg" aria-hidden="true">{ICONE_TIPO[n.tipo] || "🔔"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 break-words text-sm font-bold text-[#fff]">{n.titulo}</span>
                        {!n.lida && <span className="h-2 w-2 shrink-0 rounded-full bg-[#e8622c]" aria-label="Não lida" />}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-[rgba(255,255,255,.65)]">{n.corpo}</span>
                      <span className="mt-1 block text-[11px] text-[rgba(255,255,255,.4)]">{tempoRelativo(n.criadoEmISO)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        ref={botaoRef}
        onClick={() => setAberto((v) => !v)}
        type="button"
        aria-label={`Abrir notificações${naoLidas > 0 ? ` — ${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title="Notificações"
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--pp-border)] bg-[var(--pp-surface)] text-[var(--pp-text-body)] transition-colors duration-150 hover:bg-[var(--pp-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pp-primary)]"
      >
        <Bell aria-hidden="true" size={18} />
        {naoLidas > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-[var(--pp-surface)] bg-[var(--pp-danger)] px-1 text-[10px] font-bold leading-[16px] text-white">{naoLidas > 9 ? "9+" : naoLidas}</span>}
      </button>

      {painel && createPortal(painel, document.body)}
    </div>
  );
}
