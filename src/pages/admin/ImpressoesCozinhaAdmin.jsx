import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Printer, RefreshCw, XCircle } from "lucide-react";
import { rotuloStatusImpressao } from "../../lib/impressaoCozinha";
import { imprimirFilaProducao } from "../pdv/pdvCuponsTermicos";

/**
 * Painel administrativo — monitora a fila de impressão por setor.
 * Mostra pendentes/erros que precisam de intervenção e permite reimprimir.
 */
export default function ImpressoesCozinhaAdmin({
  impressoes = [],
  impressoras = [],
  categorias = [],
  lojaInfo = null,
  onAtualizarStatus = async () => {},
  onRecarregar = async () => {},
}) {
  const [filtro, setFiltro] = useState("atencao");
  const [processandoId, setProcessandoId] = useState(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  const contadores = useMemo(() => {
    const base = { pendente: 0, erro: 0, impresso: 0, reimpresso: 0, cancelado: 0, intervencao: 0 };
    impressoes.forEach((j) => {
      if (base[j.status] != null) base[j.status] += 1;
      if (j.precisaIntervencao || j.status === "erro" || j.status === "pendente") base.intervencao += 1;
    });
    return base;
  }, [impressoes]);

  const lista = useMemo(() => {
    if (filtro === "atencao") {
      return impressoes.filter((j) => j.status === "pendente" || j.status === "erro" || j.precisaIntervencao);
    }
    if (filtro === "todos") return impressoes;
    return impressoes.filter((j) => j.status === filtro);
  }, [impressoes, filtro]);

  // Paginação — 10 registros por página
  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const listaPagina = lista.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const trocarFiltro = (id) => { setFiltro(id); setPagina(1); };

  const semImpressorasCadastradas = impressoras.filter((i) => i.ativo !== false).length === 0;
  const categoriasSemImpressora = categorias.filter((c) => c.active !== false && !c.impressoraId);

  async function reimprimir(job) {
    setProcessandoId(job.id);
    try {
      const ok = imprimirFilaProducao(job, { lojaInfo });
      if (ok) {
        await onAtualizarStatus(job.id, {
          status: job.status === "impresso" ? "reimpresso" : "impresso",
          tentativas: (job.tentativas || 0) + 1,
          precisaIntervencao: false,
        });
      } else {
        await onAtualizarStatus(job.id, {
          status: "erro",
          erroMsg: "Pop-up bloqueado ou impressão cancelada. Permita pop-ups e tente de novo.",
          tentativas: (job.tentativas || 0) + 1,
          precisaIntervencao: true,
        });
      }
    } finally {
      setProcessandoId(null);
    }
  }

  async function marcarImpresso(job) {
    setProcessandoId(job.id);
    try {
      await onAtualizarStatus(job.id, {
        status: "impresso",
        precisaIntervencao: false,
        tentativas: (job.tentativas || 0) + 1,
      });
    } finally {
      setProcessandoId(null);
    }
  }

  async function cancelar(job) {
    setProcessandoId(job.id);
    try {
      await onAtualizarStatus(job.id, { status: "cancelado", precisaIntervencao: false });
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <main className="space-y-5">
      <div className="relative overflow-hidden rounded-[2rem] border border-[var(--pp-border)] bg-white p-6 shadow-[0_1px_2px_rgba(1, 46, 70,0.05)]">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(243, 133, 37,0.3)] bg-[rgba(243, 133, 37,0.1)] text-[#F38525]">
              <Printer size={22} aria-hidden="true" />
            </span>
            <div>
              <h3 className="page-title text-lg font-semibold tracking-tight text-[var(--pp-text)] sm:text-xl">Impressões Setores</h3>
              <p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--pp-text-muted)]">
                Acompanhe se as comandas saíram automaticamente por setor. Itens em atenção precisam de manutenção ou reimpressão manual.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRecarregar?.()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pp-border)] bg-white px-4 py-2.5 text-[13px] font-semibold text-[var(--pp-text-body)] shadow-[0_1px_2px_rgba(1, 46, 70,0.05)] transition hover:bg-[rgba(1, 46, 70,0.04)]"
          >
            <RefreshCw size={14} aria-hidden="true" /> Atualizar
          </button>
        </div>
      </div>

      {(contadores.intervencao > 0 || semImpressorasCadastradas || categoriasSemImpressora.length > 0) && (
        <div className="rounded-2xl border border-[rgba(243, 133, 37,0.3)] bg-[rgba(243, 133, 37,0.06)] px-4 py-3 text-sm text-[var(--pp-text-body)]">
          <p className="flex items-center gap-2 font-semibold text-[#F38525]">
            <AlertTriangle size={16} aria-hidden="true" />
            Manutenção necessária
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-[var(--pp-text-body)]">
            {contadores.intervencao > 0 && (
              <li>{contadores.intervencao} impressão(ões) pendente(s) ou com erro — reimprima ou marque como impresso.</li>
            )}
            {semImpressorasCadastradas && (
              <li>Nenhuma impressora ativa — cadastre em Operação → Setor Impressoras e faça o teste de impressão.</li>
            )}
            {categoriasSemImpressora.slice(0, 4).map((c) => (
              <li key={c.id}>
                Categoria <b className="font-semibold">{c.nome}</b> sem impressora — vincule em Gestão → Categorias.
              </li>
            ))}
            {categoriasSemImpressora.length > 4 && (
              <li>+{categoriasSemImpressora.length - 4} outras categorias sem impressora.</li>
            )}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { rotulo: "Precisam atenção", valor: contadores.intervencao, cor: "#F38525" },
          { rotulo: "Pendentes", valor: contadores.pendente, cor: "#012E46" },
          { rotulo: "Com erro", valor: contadores.erro, cor: "#C81E4A" },
          { rotulo: "Impressas", valor: contadores.impresso + contadores.reimpresso, cor: "#2F9E52" },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-2xl border border-[var(--pp-border)] bg-white p-3.5 shadow-[0_1px_2px_rgba(1, 46, 70,0.05)]">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--pp-text-muted)]">{c.rotulo}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums" style={{ color: c.cor }}>{c.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["atencao", "Atenção"],
          ["pendente", "Pendentes"],
          ["erro", "Erros"],
          ["impresso", "Impressas"],
          ["todos", "Todas"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => trocarFiltro(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              filtro === id
                ? "border-[#F38525] bg-[rgba(243, 133, 37,0.12)] text-[#F38525]"
                : "border-[var(--pp-border)] bg-white text-[var(--pp-text-body)] hover:bg-[rgba(1, 46, 70,0.04)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-[2rem] border border-[var(--pp-border)] bg-white p-5 shadow-[0_1px_2px_rgba(1, 46, 70,0.05)]">
        {lista.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto text-[#2F9E52]" size={28} aria-hidden="true" />
            <p className="mt-2 font-semibold text-[var(--pp-text)]">Nada pendente neste filtro</p>
            <p className="mt-1 text-sm text-[var(--pp-text-muted)]">As impressões automáticas por setor estão em dia.</p>
          </div>
        ) : (
          <>
          <ul className="space-y-3">
            {listaPagina.map((j) => {
              const st = rotuloStatusImpressao(j.status);
              const busy = processandoId === j.id;
              return (
                <li key={j.id} className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 shadow-[0_1px_2px_rgba(1, 46, 70,0.04)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${st.chip}`}>{st.label}</span>
                        {j.precisaIntervencao && (
                          <span className="rounded-full bg-[rgba(200,30,74,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#C81E4A]">
                            Intervenção
                          </span>
                        )}
                        <p className="truncate text-sm font-semibold text-[var(--pp-text)]">
                          {j.setorNome} · #{j.pedidoId}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-[var(--pp-text-muted)]">
                        {j.mesa || "—"} · Comanda {j.comanda || "—"} · {j.atendimento || "—"}
                        {j.impressoraNome ? ` · Imp.: ${j.impressoraNome}` : " · Sem impressora"}
                        {j.origem ? ` · Origem: ${j.origem}` : ""}
                      </p>
                      <p className="mt-1 truncate text-xs text-[var(--pp-text-muted)]">
                        {(j.itens || []).map((it) => `${it.quantity}x ${it.name}`).join(" · ") || "Sem itens"}
                      </p>
                      {j.erroMsg && (
                        <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-[#C81E4A]">
                          <XCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                          {j.erroMsg}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reimprimir(j)}
                        className="rounded-xl border border-[rgba(243, 133, 37,0.3)] bg-white px-3 py-1.5 text-xs font-semibold text-[#F38525] shadow-[0_1px_2px_rgba(1, 46, 70,0.05)] transition hover:bg-[rgba(243, 133, 37,0.08)] disabled:opacity-50"
                      >
                        {busy ? "…" : "Reimprimir"}
                      </button>
                      {(j.status === "pendente" || j.status === "erro") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => marcarImpresso(j)}
                          className="rounded-xl border border-[rgba(47,158,82,0.3)] bg-white px-3 py-1.5 text-xs font-semibold text-[#2F9E52] shadow-[0_1px_2px_rgba(1, 46, 70,0.05)] transition hover:bg-[rgba(47,158,82,0.08)] disabled:opacity-50"
                        >
                          Marcar impresso
                        </button>
                      )}
                      {j.status !== "cancelado" && j.status !== "impresso" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => cancelar(j)}
                          className="rounded-xl border border-[var(--pp-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--pp-text-body)] shadow-[0_1px_2px_rgba(1, 46, 70,0.05)] transition hover:bg-[rgba(1, 46, 70,0.04)] disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {totalPaginas > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--pp-border)] pt-3">
              <p className="text-[11px] text-[var(--pp-text-muted)]">Página {paginaAtual} de {totalPaginas} · {lista.length} registro(s)</p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual <= 1} aria-label="Página anterior" className="flex h-8 min-w-[32px] items-center justify-center rounded-lg border border-[var(--pp-border)] bg-white px-2 text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[rgba(1, 46, 70,0.04)] disabled:cursor-not-allowed disabled:opacity-40">‹</button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setPagina(n)} className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${n === paginaAtual ? "bg-[#F38525] text-[#012E46]" : "border border-[var(--pp-border)] bg-white text-[var(--pp-text-body)] hover:bg-[rgba(1, 46, 70,0.04)]"}`}>{n}</button>
                ))}
                <button onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas} aria-label="Próxima página" className="flex h-8 min-w-[32px] items-center justify-center rounded-lg border border-[var(--pp-border)] bg-white px-2 text-sm font-semibold text-[var(--pp-text-body)] transition hover:bg-[rgba(1, 46, 70,0.04)] disabled:cursor-not-allowed disabled:opacity-40">›</button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </main>
  );
}
