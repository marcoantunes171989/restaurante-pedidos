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
      <div className="relative overflow-hidden rounded-[2rem] border border-gold-400/25 bg-gradient-to-br from-white to-[#EDF3FB] p-6">
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-400/40 bg-gold-400/10 text-gold-300">
              <Printer size={22} aria-hidden="true" />
            </span>
            <div>
              <h3 className="page-title text-xl font-bold tracking-tight text-white sm:text-2xl">Impressões Setores</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Acompanhe se as comandas saíram automaticamente por setor. Itens em atenção precisam de manutenção ou reimpressão manual.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRecarregar?.()}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/10"
          >
            <RefreshCw size={14} aria-hidden="true" /> Atualizar
          </button>
        </div>
      </div>

      {(contadores.intervencao > 0 || semImpressorasCadastradas || categoriasSemImpressora.length > 0) && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={16} aria-hidden="true" />
            Manutenção necessária
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-amber-100/90">
            {contadores.intervencao > 0 && (
              <li>{contadores.intervencao} impressão(ões) pendente(s) ou com erro — reimprima ou marque como impresso.</li>
            )}
            {semImpressorasCadastradas && (
              <li>Nenhuma impressora ativa — cadastre em Operação → Setor Impressoras e faça o teste de impressão.</li>
            )}
            {categoriasSemImpressora.slice(0, 4).map((c) => (
              <li key={c.id}>
                Categoria <b>{c.nome}</b> sem impressora — vincule em Gestão → Categorias.
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
          { rotulo: "Precisam atenção", valor: contadores.intervencao, tom: "orange" },
          { rotulo: "Pendentes", valor: contadores.pendente, tom: "gold" },
          { rotulo: "Com erro", valor: contadores.erro, tom: "red" },
          { rotulo: "Impressas", valor: contadores.impresso + contadores.reimpresso, tom: "emerald" },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{c.rotulo}</p>
            <p className={`mt-2 text-2xl font-bold ${
              c.tom === "emerald" ? "text-emerald-300" : c.tom === "red" ? "text-red-300" : c.tom === "orange" ? "text-orange-300" : "text-gold-300"
            }`}>{c.valor}</p>
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
            onClick={() => setFiltro(id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              filtro === id
                ? "border-gold-400/50 bg-gold-400/15 text-gold-200"
                : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        {lista.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="mx-auto text-emerald-300" size={28} aria-hidden="true" />
            <p className="mt-2 font-bold text-white">Nada pendente neste filtro</p>
            <p className="mt-1 text-sm text-slate-500">As impressões automáticas por setor estão em dia.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {lista.map((j) => {
              const st = rotuloStatusImpressao(j.status);
              const busy = processandoId === j.id;
              return (
                <li key={j.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${st.chip}`}>{st.label}</span>
                        {j.precisaIntervencao && (
                          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-red-300">
                            Intervenção
                          </span>
                        )}
                        <p className="truncate text-sm font-bold text-white">
                          {j.setorNome} · #{j.pedidoId}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {j.mesa || "—"} · Comanda {j.comanda || "—"} · {j.atendimento || "—"}
                        {j.impressoraNome ? ` · Imp.: ${j.impressoraNome}` : " · Sem impressora"}
                        {j.origem ? ` · Origem: ${j.origem}` : ""}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {(j.itens || []).map((it) => `${it.quantity}x ${it.name}`).join(" · ") || "Sem itens"}
                      </p>
                      {j.erroMsg && (
                        <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-300">
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
                        className="rounded-xl border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 text-xs font-bold text-gold-200 hover:bg-gold-400/20 disabled:opacity-50"
                      >
                        {busy ? "…" : "Reimprimir"}
                      </button>
                      {(j.status === "pendente" || j.status === "erro") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => marcarImpresso(j)}
                          className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                          Marcar impresso
                        </button>
                      )}
                      {j.status !== "cancelado" && j.status !== "impresso" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => cancelar(j)}
                          className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50"
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
        )}
      </div>
    </main>
  );
}
