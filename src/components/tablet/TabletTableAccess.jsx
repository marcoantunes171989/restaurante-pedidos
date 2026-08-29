import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2, CheckCircle2, AlertTriangle, LayoutGrid } from "lucide-react";
import EstablishmentShowcase from "./EstablishmentShowcase";
import TableSelectionCard from "./TableSelectionCard";
import { statusDaMesa } from "./tableStatusConfig";

const FILTROS = [
  { id: "todas", label: "Todas" },
  { id: "disponiveis", label: "Disponíveis" },
  { id: "ocupadas", label: "Ocupadas" },
  { id: "bloqueadas", label: "Em uso em outro aparelho" },
];

function ConfirmacaoMesaOcupada({ mesa, onVoltar, onContinuar }) {
  const numeroFmt = String(mesa.numero).padStart(2, "0");
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[rgba(33,24,20,0.32)] p-4" style={{ backdropFilter: "blur(2px)" }} onClick={onVoltar}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-mesa-ocupada-titulo" aria-describedby="confirm-mesa-ocupada-desc" className="w-full max-w-sm rounded-3xl border border-[var(--client-border)] bg-[var(--client-surface)] p-5 text-center shadow-[var(--client-shadow-floating)]" onClick={(e) => e.stopPropagation()}>
        <p id="confirm-mesa-ocupada-titulo" className="text-base font-black text-[var(--client-text-primary)]">Esta mesa já está em atendimento</p>
        <p id="confirm-mesa-ocupada-desc" className="mt-2 text-sm leading-relaxed text-[var(--client-text-secondary)]">A Mesa {numeroFmt} possui pedidos ou uma conta em andamento. Deseja utilizar este tablet nesta mesma mesa?</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onVoltar} className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] text-sm font-bold text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">
            Escolher outra mesa
          </button>
          <button type="button" onClick={onContinuar} className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl btn-laranja bg-[var(--client-primary-hover)] text-sm font-bold text-[#012E46] transition hover:bg-[var(--client-primary)]">
            Continuar na Mesa {numeroFmt}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tela completa de acesso do tablet — substitui o modal antigo por uma
 * experiência de página: vitrine do estabelecimento + painel de seleção
 * de mesa. Preserva toda a lógica de TabletView (App.jsx): quem chama
 * decide o que é "ocupada por dispositivo" (heartbeat real) e "ocupada
 * por pedido em aberto" (dados reais de `orders`) — este componente só
 * apresenta e coleta a escolha via `onConfirmar`.
 */
export default function TabletTableAccess({
  lojaInfo, mesas = [], mesasOcupadasPorDispositivo, mesasComPedidoAberto,
  tableNumber, podeFechar = false, onFechar, onConfirmar,
  produtosDestaque = [], mesaManual = "", setMesaManual,
}) {
  const [selecionada, setSelecionada] = useState(null);
  const [confirmandoOcupada, setConfirmandoOcupada] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const enviandoRef = useRef(false);

  const mesasComStatus = useMemo(() => [...mesas]
    .sort((a, b) => Number(a.numero) - Number(b.numero))
    .map((m) => ({
      mesa: m,
      status: statusDaMesa({
        numero: m.numero, tableNumberAtual: tableNumber,
        ocupadaPorDispositivo: mesasOcupadasPorDispositivo.has(String(m.numero)),
        temPedidoAberto: mesasComPedidoAberto.has(String(m.numero)),
      }),
    })), [mesas, tableNumber, mesasOcupadasPorDispositivo, mesasComPedidoAberto]);

  const buscaNorm = busca.trim().toLowerCase();
  const passaFiltro = (status) =>
    filtro === "todas" ? true
    : filtro === "disponiveis" ? status === "available"
    : filtro === "ocupadas" ? status === "occupiedOrder"
    : status === "occupiedDevice";
  const passaBusca = (m) => !buscaNorm
    || String(m.numero).includes(buscaNorm)
    || (m.nome || "").toLowerCase().includes(buscaNorm)
    || (m.localizacao || "").toLowerCase().includes(buscaNorm);

  const visiveis = mesasComStatus.filter(({ mesa, status }) => passaFiltro(status) && passaBusca(mesa));
  const temAreas = mesas.some((m) => m.localizacao);
  const grupos = useMemo(() => {
    if (!temAreas) return [{ area: null, itens: visiveis }];
    const ordem = []; const porArea = {};
    visiveis.forEach((item) => {
      const chave = item.mesa.localizacao || "Outras mesas";
      if (!porArea[chave]) { porArea[chave] = []; ordem.push(chave); }
      porArea[chave].push(item);
    });
    return ordem.map((area) => ({ area, itens: porArea[area] }));
  }, [visiveis, temAreas]);

  function selecionarMesa(mesa, status) {
    setErro("");
    if (status === "occupiedDevice") return; // defensivo — card já vem desabilitado
    if (status === "occupiedOrder") { setConfirmandoOcupada(mesa); return; }
    setSelecionada(mesa);
  }

  // Revalida em tempo real: se a mesa selecionada (ainda não confirmada) for
  // assumida por outro dispositivo enquanto o usuário decide, avisa e limpa a
  // seleção — nunca deixa uma escolha inválida silenciosa na tela. `mesas` e
  // `dispositivos`/`orders` (via mesasOcupadasPorDispositivo/mesasComPedidoAberto)
  // já chegam ao vivo do realtime existente; não é uma consulta nova.
  useEffect(() => {
    if (!selecionada || enviando || sucesso) return;
    const atual = mesasComStatus.find((item) => item.mesa.id === selecionada.id);
    if (atual && atual.status === "occupiedDevice") {
      queueMicrotask(() => {
        setSelecionada(null);
        setErro("A situação desta mesa foi alterada. Confira as informações antes de continuar.");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesasComStatus]);

  // "mesa_em_uso" é o pré-check local (mesasComStatus); "mesa_em_uso_outro_dispositivo"
  // é a mesma condição detectada no servidor (migration 125 — advisory lock +
  // checagem de conflito), quando o pré-check local não pegou a corrida a tempo.
  function mensagemErroMesa(e) {
    const msg = e?.message || "";
    return msg === "mesa_em_uso" || msg === "mesa_em_uso_outro_dispositivo"
      ? "Esta mesa acabou de ser vinculada a outro dispositivo. Escolha outra mesa."
      : "Não foi possível configurar este tablet agora. Tente novamente.";
  }

  async function confirmar(mesaAlvo) {
    if (!mesaAlvo || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErro("");
    await new Promise((r) => setTimeout(r, 450));
    try {
      // Revalida contra o estado ATUAL (não o que valia no clique) antes de
      // confirmar — impede que duas mesas/dois dispositivos conflitem por a
      // tela ter ficado aberta um tempo sem revalidação.
      const atual = mesasComStatus.find((item) => item.mesa.id === mesaAlvo.id);
      if (atual && atual.status === "occupiedDevice") {
        throw new Error("mesa_em_uso");
      }
      await onConfirmar(mesaAlvo.numero);
      setSucesso(true);
      await new Promise((r) => setTimeout(r, 550));
    } catch (e) {
      setSelecionada(null);
      setErro(mensagemErroMesa(e));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  async function confirmarManual() {
    if (!(Number(mesaManual) > 0) || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErro("");
    try {
      await onConfirmar(mesaManual);
      setSucesso(true);
      await new Promise((r) => setTimeout(r, 550));
    } catch (e) {
      setErro(mensagemErroMesa(e));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  function confirmarMesaOcupada() {
    const mesa = confirmandoOcupada;
    setConfirmandoOcupada(null);
    setSelecionada(mesa);
    confirmar(mesa);
  }

  const mostrarBuscaFiltro = mesas.length > 8;
  const semMesasCadastradas = mesas.length === 0;
  const semResultado = !semMesasCadastradas && grupos.every((g) => g.itens.length === 0);

  const textoBotao = sucesso ? "Tablet configurado com sucesso"
    : enviando ? "Configurando tablet…"
    : selecionada ? `Usar este tablet na Mesa ${String(selecionada.numero).padStart(2, "0")}`
    : "Selecione uma mesa para continuar";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--client-background)] lg:flex-row" style={{ minHeight: "100dvh" }}>
      {/* Vitrine do estabelecimento — ~52% em telas largas, compacta no topo em retrato/celular */}
      <div className="shrink-0 p-3 pb-0 sm:p-4 sm:pb-0 lg:h-full lg:w-[52%] lg:p-5">
        <div className="h-[38dvh] min-h-[200px] lg:h-full">
          <EstablishmentShowcase lojaInfo={lojaInfo} produtosDestaque={produtosDestaque} />
        </div>
      </div>

      {/* Painel de seleção da mesa — ~48% em telas largas */}
      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4 lg:h-full lg:w-[48%] lg:p-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-[var(--client-border)] bg-[var(--client-surface)] shadow-[var(--client-shadow-md)]">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--client-border)] px-5 py-4 sm:px-6">
            <div className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]"><LayoutGrid size={17} /></span>
              <div>
                <h2 className="text-lg font-black leading-tight text-[var(--client-text-primary)]">Selecione a mesa deste tablet</h2>
                <p className="mt-0.5 text-xs leading-5 text-[var(--client-text-secondary)]">Escolha a mesa em que este dispositivo será utilizado neste atendimento.</p>
              </div>
            </div>
            {podeFechar && (
              <button onClick={onFechar} type="button" aria-label="Fechar seleção de mesa" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] transition hover:bg-[var(--client-surface-secondary)]">
                <X aria-hidden="true" size={16} />
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {semMesasCadastradas ? (
              <div className="space-y-3">
                <p className="text-xs text-[var(--client-text-secondary)]">Nenhuma mesa cadastrada. Informe o número da mesa deste tablet:</p>
                <input
                  autoFocus type="tel" inputMode="numeric" value={mesaManual} disabled={enviando || sucesso}
                  onChange={(e) => setMesaManual(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmarManual(); }}
                  placeholder="Nº da mesa"
                  className="w-full rounded-2xl border border-[var(--client-border)] bg-[var(--client-surface)] px-4 py-3 text-center text-lg font-black text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:font-normal placeholder:text-[var(--client-text-muted)] disabled:opacity-60"
                />
                {erro && <p role="alert" className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--client-error-soft)] px-3 py-2 text-xs font-bold text-[var(--client-error)]"><AlertTriangle aria-hidden="true" size={14} /> {erro}</p>}
                <button
                  onClick={confirmarManual} disabled={!(Number(mesaManual) > 0) || enviando || sucesso} type="button" aria-busy={enviando}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl btn-laranja bg-[var(--client-primary-hover)] py-3.5 text-sm font-black text-[#012E46] transition active:scale-95 hover:bg-[var(--client-primary)] disabled:opacity-40"
                >
                  {enviando && <Loader2 aria-hidden="true" size={17} className="animate-spin" />}
                  {sucesso ? "Tablet configurado com sucesso" : enviando ? "Configurando tablet…" : "Confirmar mesa"}
                </button>
              </div>
            ) : (
              <>
                {/* Legenda dos estados */}
                <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--client-success)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--client-success)]" aria-hidden="true" /> Disponível</span>
                  <span className="flex items-center gap-1.5 text-[var(--client-warning)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--client-warning)]" aria-hidden="true" /> Ocupada</span>
                  <span className="flex items-center gap-1.5 text-[var(--client-error)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--client-error)]" aria-hidden="true" /> Em uso em outro dispositivo</span>
                  <span className="flex items-center gap-1.5 text-[var(--client-primary-active)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--client-primary-hover)]" aria-hidden="true" /> Selecionada</span>
                </div>

                {mostrarBuscaFiltro && (
                  <div className="mb-4 space-y-2.5">
                    <div className="relative">
                      <Search aria-hidden="true" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--client-text-muted)]" />
                      <input
                        value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar mesa ou área..."
                        className="w-full rounded-xl border border-[var(--client-border)] bg-[var(--client-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--client-text-primary)] outline-none transition focus:border-[var(--client-primary)] focus:ring-[3px] focus:ring-[var(--client-focus-primary)] placeholder:text-[var(--client-text-muted)]"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {FILTROS.map((f) => (
                        <button
                          key={f.id} type="button" onClick={() => setFiltro(f.id)}
                          aria-pressed={filtro === f.id}
                          className={`min-h-[36px] rounded-full border px-3 text-xs font-bold transition ${filtro === f.id ? "border-[var(--client-primary)] bg-[var(--client-primary-soft)] text-[var(--client-primary-active)]" : "border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-secondary)] hover:bg-[var(--client-surface-secondary)]"}`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {semResultado ? (
                  <p className="py-8 text-center text-sm text-[var(--client-text-secondary)]">Nenhuma mesa encontrada para esta busca.</p>
                ) : (
                  <div className="space-y-5">
                    {grupos.map((g) => (
                      <div key={g.area ?? "todas"}>
                        {g.area && (
                          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-[var(--client-text-muted)]">{g.area} · {g.itens.length} {g.itens.length === 1 ? "mesa" : "mesas"}</p>
                        )}
                        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))" }}>
                          {g.itens.map(({ mesa, status }) => (
                            <TableSelectionCard key={mesa.id} mesa={mesa} status={selecionada?.id === mesa.id && status !== "current" ? "current" : status} onSelect={() => selecionarMesa(mesa, status)} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {!semMesasCadastradas && (
            <div className="shrink-0 border-t border-[var(--client-border)] px-5 py-4 sm:px-6" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
              {selecionada && !sucesso && (
                <p className="mb-2 text-center text-xs font-bold text-[var(--client-text-secondary)]">
                  Mesa selecionada: {String(selecionada.numero).padStart(2, "0")}{selecionada.localizacao ? ` · ${selecionada.localizacao}` : ""}
                </p>
              )}
              {erro && <p role="alert" className="mb-2 flex items-center justify-center gap-1.5 rounded-xl bg-[var(--client-error-soft)] px-3 py-2 text-xs font-bold text-[var(--client-error)]"><AlertTriangle aria-hidden="true" size={14} /> {erro}</p>}
              <button
                type="button" onClick={() => confirmar(selecionada)} disabled={!selecionada || enviando || sucesso}
                aria-busy={enviando}
                className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold transition active:scale-[0.98] ${
                  sucesso ? "bg-[var(--client-success)] text-white"
                    : (!selecionada || enviando) ? "bg-[var(--client-disabled-background)] text-[var(--client-disabled-text)]"
                    : "btn-laranja bg-[var(--client-primary-hover)] text-[#012E46] hover:bg-[var(--client-primary)]"
                }`}
              >
                {enviando && <Loader2 aria-hidden="true" size={17} className="animate-spin" />}
                {sucesso && <CheckCircle2 aria-hidden="true" size={17} />}
                {textoBotao}
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmandoOcupada && (
        <ConfirmacaoMesaOcupada mesa={confirmandoOcupada} onVoltar={() => setConfirmandoOcupada(null)} onContinuar={confirmarMesaOcupada} />
      )}
    </div>
  );
}
