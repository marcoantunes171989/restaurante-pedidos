import { useEffect, useRef, useState } from "react";
import { ProdutoModal, formatCurrency, fallbackImage } from "../../App";
import {
  CkIconMesa, CkIconLoja, CkIconRelogio, CkIconEstrela, CkIconRecibo,
  CkIconSacola, CkIconPanela, CkIconSino, CkIconAjuda, CkIconLimpeza, CkIconSpinner,
} from "../../components/cardapio/CkIcons.jsx";

// ════════════════════════════════════════════════════════════
//  Tela de boas-vindas do Cardápio Externo (QR da mesa / link
//  público) — marca da loja, status (mesa/aberto-fechado),
//  carrossel de destaques e atalho para o cardápio completo.
//
//  Extraída de CardapioPublico.jsx (etapa "welcome") para seu
//  próprio componente/arquivo — mesmo comportamento, cores e
//  tipografia agora nos tokens --client-* oficiais (identidade-visual,
//  tipografia-clean, escala-de-fontes), em vez de hex soltos.
// ════════════════════════════════════════════════════════════
export default function CardapioBoasVindas({
  loja, modoExterno, currentTable, lojaStatus, fechaHoje, produtos, catNomePorId,
  mesa, meusPedidos, chamando, chamar, msg,
  detalhe, gruposOpcoes, opcoes, addConfigurado, onFecharDetalhe,
  onAbrirCardapio, onAbrirProduto, onAcompanharPedido,
}) {
  const [welcomeSlide, setWelcomeSlide] = useState(0);
  const welcomeTouchRef = useRef({ x: 0, y: 0 });

  const partesNome = String(loja.nome || "").trim().split(/\s+/).filter(Boolean);
  const nomePrimario = partesNome[0] || loja.nome || "Estabelecimento";
  const nomeSecundario = partesNome.slice(1).join(" ");

  const dispon = produtos.filter((p) => p.disponivel !== false);
  const ordenarDestaque = (a, b) => (Number(a.featuredOrder) || 0) - (Number(b.featuredOrder) || 0);
  const featured = dispon.filter((p) => p.isFeatured).sort(ordenarDestaque);
  const comBadge = dispon.filter((p) => p.badge && !featured.some((f) => f.id === p.id));
  const resto = dispon.filter((p) => !featured.some((f) => f.id === p.id) && !comBadge.some((f) => f.id === p.id));
  const destaques = [...featured, ...comBadge, ...resto].slice(0, 6);
  const nSlides = destaques.length;
  const slideAtual = nSlides ? ((welcomeSlide % nSlides) + nSlides) % nSlides : 0;
  const produtoAtivo = nSlides ? destaques[slideAtual] : null;
  const produtoAnterior = nSlides > 1 ? destaques[(slideAtual - 1 + nSlides) % nSlides] : null;
  const produtoProximo = nSlides > 1 ? destaques[(slideAtual + 1) % nSlides] : null;
  const irSlide = (dir) => {
    if (nSlides <= 1) return;
    setWelcomeSlide((cur) => {
      const base = ((cur % nSlides) + nSlides) % nSlides;
      return (base + dir + nSlides) % nSlides;
    });
  };
  const descCurta = (p) => {
    const d = String(p?.description || p?.category || catNomePorId[p?.categoriaId] || "").trim();
    if (!d) return "Destaque da casa";
    return d.length > 56 ? `${d.slice(0, 54)}…` : d;
  };
  const onTouchStart = (e) => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    welcomeTouchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches?.[0];
    if (!t || nSlides <= 1) return;
    const dx = t.clientX - welcomeTouchRef.current.x;
    const dy = t.clientY - welcomeTouchRef.current.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    irSlide(dx < 0 ? 1 : -1);
  };

  // Carrossel infinito — avança sozinho a cada 4s (o módulo por nSlides acontece na renderização).
  useEffect(() => {
    if (nSlides <= 1) return undefined;
    const iv = setInterval(() => setWelcomeSlide((cur) => cur + 1), 4000);
    return () => clearInterval(iv);
  }, [nSlides]);

  return (
    <div data-theme="light" className={`pp-mesa-welcome tema-claro-area relative flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col overflow-x-clip bg-white text-[var(--client-text-primary)] ${modoExterno ? "pp-welcome-ext" : ""}`}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="pp-welcome-inner relative flex flex-col pt-[clamp(0.35rem,1.2vh,0.75rem)] pb-[clamp(0.25rem,0.8vh,0.5rem)]">
        {/* ── Estabelecimento ── */}
        <header className="flex w-full min-w-0 shrink-0 flex-col items-center text-center">
          {loja.logoUrl ? (
            <img src={loja.logoUrl} alt={`Logo ${loja.nome}`} className="h-[clamp(44px,7vh,64px)] w-[clamp(44px,7vh,64px)] rounded-full border-[3px] border-[var(--client-border)] object-cover bg-white" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <span className="flex h-[clamp(44px,7vh,64px)] w-[clamp(44px,7vh,64px)] items-center justify-center rounded-full border-[3px] border-[var(--client-border)] bg-white text-xl font-semibold" aria-hidden="true">
              <span className="text-[var(--client-info)]">{(loja.prefixo || nomePrimario).slice(0, 1)}</span>
              <span className="text-[var(--client-primary)]">{(loja.prefixo || nomePrimario).slice(1, 2) || ""}</span>
            </span>
          )}
          <h1 className="mt-[clamp(0.25rem,0.8vh,0.5rem)] max-w-full px-1 font-semibold leading-none tracking-tight break-words">
            <span className="text-[clamp(1.15rem,3.4vh,1.7rem)] text-[var(--client-info)]">{nomePrimario}</span>
            {nomeSecundario ? <span className="text-[clamp(1.15rem,3.4vh,1.7rem)] text-[var(--client-primary)]"> {nomeSecundario}</span> : null}
          </h1>
          <div className="pp-welcome-brand-sub mt-1 flex items-center gap-2">
            <span className="h-px w-6 bg-[var(--client-border)]" aria-hidden="true" />
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--client-info)]">Cardápio digital</p>
            <span className="h-px w-6 bg-[var(--client-border)]" aria-hidden="true" />
          </div>
        </header>

        {/* ── Mesa + status do estabelecimento ── */}
        {(modoExterno || currentTable || lojaStatus) && (
          <div className="pp-welcome-status mt-[clamp(0.4rem,1.2vh,0.7rem)] grid w-full shrink-0 grid-cols-2 gap-2">
            {currentTable ? (
              <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border border-[var(--client-border)] bg-white px-2.5 py-[clamp(0.45rem,1.1vh,0.7rem)]">
                <span className="pp-welcome-status-icon flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--client-border)] bg-white text-[var(--client-primary)]"><CkIconMesa width={16} height={16} /></span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate text-[13px] font-semibold text-[var(--client-info)]">{currentTable}</span>
                  <span className="block truncate text-[10px] font-medium text-[var(--client-text-secondary)]">Sua comanda</span>
                </span>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border border-[var(--client-border)] bg-white px-2.5 py-[clamp(0.45rem,1.1vh,0.7rem)]">
                <span className="pp-welcome-status-icon flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--client-border)] bg-white text-[var(--client-primary)]"><CkIconLoja width={16} height={16} /></span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate text-[13px] font-semibold text-[var(--client-info)]">Pedido online</span>
                  <span className="block truncate text-[10px] font-medium text-[var(--client-text-secondary)]">Cardápio externo</span>
                </span>
              </div>
            )}
            <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border border-[var(--client-border)] bg-white px-2.5 py-[clamp(0.45rem,1.1vh,0.7rem)]">
              {lojaStatus === "aberto" ? (
                <>
                  <span className="pp-welcome-status-icon relative flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--client-border)] bg-white">
                    {/* Verde operacional (não é token de marca — ver skill padronizar-cores-pedido-prime) */}
                    <span className="absolute h-2 w-2 rounded-full bg-[#5E8C31]" aria-hidden="true" />
                    <span className="absolute h-2 w-2 animate-ping rounded-full bg-[#5E8C31]/50" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-[13px] font-semibold text-[#5E8C31]">Aberto agora</span>
                    <span className="block truncate text-[10px] font-medium text-[var(--client-text-secondary)]">{fechaHoje ? `Até ${fechaHoje}` : "Pronto para receber"}</span>
                  </span>
                </>
              ) : lojaStatus === "fechado" ? (
                <>
                  <span className="pp-welcome-status-icon flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--client-border)] bg-white text-[var(--client-text-secondary)]"><CkIconRelogio width={15} height={15} /></span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-[13px] font-semibold text-[var(--client-text-secondary)]">Fechado agora</span>
                    <span className="block truncate text-[10px] font-medium text-[var(--client-text-secondary)]">Fora do horário</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="pp-welcome-status-icon flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--client-border)] bg-white text-[var(--client-info)]"><CkIconRelogio width={15} height={15} /></span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-[13px] font-semibold text-[var(--client-info)]">Atendimento</span>
                    <span className="block truncate text-[10px] font-medium text-[var(--client-text-secondary)]">Consulte a equipe</span>
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Carrossel: foto sem overlay; infos abaixo ── */}
        {produtoAtivo && (
          <section className="mt-[clamp(0.35rem,1.1vh,0.65rem)] flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden" aria-labelledby="pp-destaques-titulo"
            onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="mb-1.5 flex min-w-0 shrink-0 items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2 overflow-hidden">
                <CkIconEstrela width={23} height={23} className="mt-0.5 shrink-0 text-[var(--client-primary)]" />
                <div className="min-w-0">
                  <h2 id="pp-destaques-titulo" className="truncate text-[clamp(12px,1.8vh,14px)] font-semibold text-[var(--client-info)]">Destaques da casa</h2>
                  <p className="text-[9px] text-[var(--client-text-secondary)]">{slideAtual + 1} de {nSlides}</p>
                </div>
              </div>
            </div>

            <div className="pp-welcome-stage relative flex min-h-0 flex-1 items-stretch justify-center">
              {produtoAnterior && <button type="button" onClick={() => irSlide(-1)} aria-label={`Ver destaque anterior: ${produtoAnterior.name}`}
                className="pp-welcome-side pp-welcome-side-left" style={{ backgroundImage: `url(${JSON.stringify(String(produtoAnterior.imageUrl || fallbackImage))})` }}>
                <img src={produtoAnterior.imageUrl || fallbackImage} alt="" loading="eager" decoding="async" onError={(e) => { e.currentTarget.src = fallbackImage; }} />
              </button>}
              {produtoProximo && <button type="button" onClick={() => irSlide(1)} aria-label={`Ver próximo destaque: ${produtoProximo.name}`}
                className="pp-welcome-side pp-welcome-side-right" style={{ backgroundImage: `url(${JSON.stringify(String(produtoProximo.imageUrl || fallbackImage))})` }}>
                <img src={produtoProximo.imageUrl || fallbackImage} alt="" loading="eager" decoding="async" onError={(e) => { e.currentTarget.src = fallbackImage; }} />
              </button>}

              {/* div[role=button] em vez de <button>: no iOS/Safari imagens
                  dentro de <button> com layout flex/absolute podem ficar em branco. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onAbrirProduto(produtoAtivo)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAbrirProduto(produtoAtivo);
                  }
                }}
                aria-label={`Ver ${produtoAtivo.name}`}
                className="pp-welcome-card group relative flex min-h-0 w-full min-w-0 max-w-full flex-1 cursor-pointer flex-col overflow-hidden rounded-[1.35rem] border border-[var(--client-border)] bg-white text-left transition active:opacity-95"
              >
                {(() => {
                  const fotoSrc = produtoAtivo.imageUrl || fallbackImage;
                  return (
                    <div
                      className="pp-welcome-foto"
                      style={{ backgroundImage: `url(${JSON.stringify(String(fotoSrc))})` }}
                    >
                      <img
                        key={produtoAtivo.id}
                        src={fotoSrc}
                        alt={produtoAtivo.name}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                        sizes="100%"
                        onError={(e) => {
                          if (e.currentTarget.src !== fallbackImage) {
                            e.currentTarget.src = fallbackImage;
                            const box = e.currentTarget.parentElement;
                            if (box) box.style.backgroundImage = `url(${JSON.stringify(fallbackImage)})`;
                          }
                        }}
                        className="pp-img-fill"
                      />
                      {!modoExterno && <span className="pp-welcome-foto-badge pointer-events-none absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--client-border)] bg-white text-[12px] font-semibold text-[var(--client-info)]">{slideAtual + 1}</span>}
                      {!modoExterno && produtoAtivo.badge ? (
                        <span className="pp-welcome-foto-badge pointer-events-none absolute right-2 top-2 truncate rounded-full border border-[var(--client-border)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--client-primary)]">{produtoAtivo.badge}</span>
                      ) : null}
                    </div>
                  );
                })()}
                <div className="pp-welcome-product-info min-w-0 shrink-0 border-t border-[var(--client-border)] bg-white px-3 py-2">
                  <p className="truncate text-[clamp(13px,2vh,16px)] font-semibold leading-tight text-[var(--client-info)]">{produtoAtivo.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-[var(--client-text-secondary)]">{descCurta(produtoAtivo)}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate text-[9px] font-semibold text-[var(--client-text-secondary)]">
                      <CkIconRelogio width={10} height={10} className="shrink-0" /> {produtoAtivo.time || "Consulte o preparo"}
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-[var(--client-info)]">{formatCurrency(produtoAtivo.price)}</span>
                  </div>
                  <p className="mt-1 truncate border-t border-[var(--client-border)] pt-1 text-[9px] font-semibold text-[var(--client-text-secondary)]">Toque para ver detalhes e adicionar</p>
                </div>
              </div>
            </div>

            {nSlides > 1 && (
              <div className="pp-welcome-dots mt-1.5 flex shrink-0 justify-center gap-1.5" role="tablist" aria-label="Destaques">
                {destaques.map((p, i) => (
                  <button key={p.id} type="button" role="tab" aria-selected={i === slideAtual} aria-label={`Destaque ${i + 1}: ${p.name}`}
                    onClick={() => setWelcomeSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${i === slideAtual ? "w-4 bg-[var(--client-primary)]" : "w-1.5 bg-[var(--client-border)]"}`} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── CTA + rodapé ── */}
        <div className="mt-[clamp(0.35rem,1vh,0.6rem)] flex w-full min-w-0 shrink-0 flex-col">
          {!modoExterno && <div className="pp-mesa-opt-sub flex min-w-0 items-center gap-2.5 overflow-hidden rounded-2xl border border-[var(--client-border)] bg-white px-3 py-2">
            <span className="shrink-0 text-xl" aria-hidden="true">👋</span>
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-[var(--client-text-secondary)]">
              <b className="font-semibold text-[var(--client-info)]">Olá! Seja bem-vindo!</b>{" "}
              Cardápio especial para você aproveitar cada momento.
            </p>
          </div>}

          <button type="button" onClick={onAbrirCardapio}
            className="pp-welcome-cta mt-2 flex w-full min-h-[48px] min-w-0 items-center gap-2.5 rounded-2xl btn-laranja px-3 text-[12px] font-semibold text-[var(--client-info)] transition active:opacity-95 sm:px-4">
            <CkIconRecibo width={16} height={16} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Ver cardápio completo</span>
            <span className="shrink-0" aria-hidden="true">→</span>
          </button>

          {modoExterno && (
            <div className="pp-welcome-benefits mt-1.5 grid grid-cols-3 rounded-xl border border-[var(--client-border)] bg-white px-1.5 py-2">
              {[
                [CkIconSacola, "Ingredientes", "Selecionados"],
                [CkIconPanela, "Preparo", "Na hora"],
                [CkIconEstrela, "Qualidade", "Garantida"],
              ].map(([Icone, titulo, texto], i) => (
                <div key={titulo} className={`flex min-w-0 items-center justify-center gap-1 px-1 ${i ? "border-l border-[var(--client-border)]" : ""}`}>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--client-primary)]"><Icone width={15} height={15} /></span>
                  <span className="min-w-0 leading-tight">
                    <b className="block truncate text-[9px] font-semibold text-[var(--client-info)]">{titulo}</b>
                    <span className="block truncate text-[8px] text-[var(--client-text-secondary)]">{texto}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {meusPedidos.length > 0 && (
            <button type="button" onClick={onAcompanharPedido}
              className="mt-1 inline-flex min-h-9 items-center justify-center gap-1.5 self-center px-2 text-[12px] font-semibold text-[var(--client-info)]">
              <CkIconRecibo width={13} height={13} /> Acompanhar pedido ({meusPedidos.length})
            </button>
          )}

          {!modoExterno && mesa && (
            <div className="pp-mesa-opt1 mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-[var(--client-border)] bg-white px-2.5 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--client-text-secondary)]">Precisa de algo?</p>
              <div className="flex gap-1">
                {[["garcom", CkIconSino, "Chamar garçom", "Garçom"], ["ajuda", CkIconAjuda, "Pedir ajuda", "Ajuda"], ["limpeza", CkIconLimpeza, "Solicitar limpeza", "Limpeza"]].map(([t, Icone, aria, rotulo]) => {
                  const emAndamento = chamando === t;
                  return (
                    <button key={t} type="button" onClick={() => chamar(t, rotulo)} disabled={!!chamando} aria-busy={emAndamento} aria-label={aria} title={aria}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--client-border)] bg-white text-[var(--client-info)] transition active:scale-90 disabled:opacity-60">
                      {emAndamento ? <CkIconSpinner /> : <Icone width={15} height={15} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {msg && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-20 mx-auto w-full max-w-[420px] px-3.5">
          <div role={msg.t === "error" ? "alert" : "status"} aria-live={msg.t === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto rounded-2xl border px-3 py-2 text-center text-xs font-semibold ${msg.t === "error" ? "border-[var(--client-error-border)] bg-[var(--client-error-soft)] text-[var(--client-error)]" : "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"}`}>
            {msg.m}
          </div>
        </div>
      )}
      {detalhe && <ProdutoModal produto={detalhe} grupos={gruposOpcoes} opcoes={opcoes} onFechar={onFecharDetalhe} onAdicionar={addConfigurado} />}
    </div>
  );
}
