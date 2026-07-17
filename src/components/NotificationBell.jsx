import { useEffect, useMemo, useRef, useState } from "react";
import { fetchNotificacoes, escutarNotificacoes, marcarNotificacaoLida, marcarTodasNotificacoesLidas } from "../lib/supabase";
import { ouvirOutrasAbas, avisarOutrasAbas } from "../lib/notificacoes";

const GLASS = "pp-glass-surface";

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

export default function NotificationBell() {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const raizRef = useRef(null);

  const naoLidas = useMemo(() => itens.filter((n) => !n.lida).length, [itens]);

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

  // Fecha com ESC e com clique fora — mesmo padrão de acessibilidade
  // pedido para a engrenagem, aplicado aqui também.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => { if (e.key === "Escape") setAberto(false); };
    const onClick = (e) => { if (raizRef.current && !raizRef.current.contains(e.target)) setAberto(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
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

  return (
    <div className="relative" ref={raizRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        type="button"
        aria-label={`Notificações${naoLidas > 0 ? ` — ${naoLidas} não lida${naoLidas > 1 ? "s" : ""}` : ""}`}
        aria-haspopup="true"
        aria-expanded={aberto}
        className={`${GLASS} pp-pd-icon-btn rounded-xl`}
      >
        🔔{naoLidas > 0 && <span className="pp-pd-notif-badge">{naoLidas > 9 ? "9+" : naoLidas}</span>}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setAberto(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Notificações"
            className="pp-notif-panel fixed inset-x-0 bottom-0 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:bottom-auto sm:mt-2"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[rgba(255,255,255,.1)] p-4">
              <h2 className="text-sm font-bold text-[#fff]">Notificações{naoLidas > 0 ? ` (${naoLidas})` : ""}</h2>
              <div className="flex items-center gap-2">
                {naoLidas > 0 && (
                  <button onClick={marcarTodas} type="button" className="min-h-[32px] rounded-lg px-2 text-xs font-bold text-[#f2b84a] hover:bg-[rgba(255,255,255,.08)]">
                    Marcar todas como lidas
                  </button>
                )}
                <button onClick={() => setAberto(false)} type="button" aria-label="Fechar notificações" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[rgba(255,255,255,.6)] hover:bg-[rgba(255,255,255,.08)]">✕</button>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto sm:max-h-[420px]">
              {carregando ? (
                <div className="p-6 text-center text-sm text-[rgba(255,255,255,.5)]">Carregando…</div>
              ) : erro ? (
                <div className="p-6 text-center text-sm text-[#f87171]">{erro}</div>
              ) : itens.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="mb-2 text-3xl">🔔</div>
                  <p className="text-sm text-[rgba(255,255,255,.5)]">Nenhuma notificação por aqui.</p>
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
      )}
    </div>
  );
}
