import { CkIconAlerta, CkIconCaixaEntrada, CkIconCheck, CkIconGarfo, CkIconPanela, CkIconSacola, CkIconSino } from "./CkIcons.jsx";

export default function LinhaTempoOperacional({ status, setorStatus = {}, setoresPedido = [], modo = "mesa" }) {
  if (status === "cancelled") return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--client-error-border)] bg-[var(--client-error-soft)] px-3 py-2 text-xs font-semibold text-[var(--client-error)]">
      <CkIconAlerta width={14} height={14} /> Pedido cancelado.
    </div>
  );
  const ordem = ["received", "preparing", "ready", "delivered"];
  const idx = Math.max(0, ordem.indexOf(status));
  const passos = [
    // "recebido" só fica "feito" (check verde) a partir do próximo estágio —
    // enquanto status === "received" ele é a etapa ATUAL, em azul (informativo),
    // nunca verde: verde ali daria a entender "concluído" para um pedido que
    // acabou de chegar, contradizendo o selo azul "Recebido" mostrado junto.
    { key: "recebido", feito: idx >= 1, atual: status === "received", atualTom: "info", Icone: CkIconCaixaEntrada, label: "Pedido recebido" },
    ...(setoresPedido.length ? setoresPedido : ["Cozinha"]).map((s) => {
      const pronto = setorStatus?.[s] === "ready";
      const emPreparo = status === "preparing" && !pronto;
      const subTexto = pronto || idx >= 2 ? "Pronto" : emPreparo ? "Em preparo" : "Na fila";
      return { key: `setor-${s}`, feito: pronto || idx >= 2, atual: emPreparo, Icone: CkIconPanela, label: `Preparo · ${s}`, sub: subTexto,
        // "Na fila" é espera operacional (ainda não começou) — azul informativo,
        // nunca neutro/cinza (perderia o significado) nem âmbar (isso é reservado
        // para "em preparo", que é uma etapa distinta e já ativa).
        subTom: subTexto === "Pronto" ? "border-[var(--client-success-border)] bg-[var(--client-success-soft)] text-[var(--client-success)]"
          : subTexto === "Em preparo" ? "border-[var(--client-warning-border)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]"
          : "border-[var(--client-info-border)] bg-[var(--client-info-soft)] text-[var(--client-info)]" };
    }),
    { key: "pronto", feito: idx >= 2, atual: status === "ready", Icone: modo === "retirada" ? CkIconSacola : CkIconSino,
      label: modo === "retirada" ? "Pronto para retirada" : modo === "entrega" ? "Pronto para entrega" : "Pronto para servir" },
    { key: "entregue", feito: idx >= 3, atual: status === "delivered", Icone: modo === "retirada" ? CkIconSacola : CkIconGarfo,
      label: modo === "retirada" ? "Retirado" : modo === "entrega" ? "Entregue" : "Entregue na mesa" },
  ];
  return (
    <ol className="space-y-0">
      {passos.map((p, i) => {
        // Cor do estágio "atual" não é sempre âmbar: "recebido" em andamento é
        // azul/informativo (ver comentário acima); os demais ("em preparo" etc.)
        // seguem âmbar. Nunca as duas semânticas dividindo a mesma cor.
        const atualInfo = p.atualTom === "info";
        return (
        <li key={p.key} aria-current={p.atual ? "step" : undefined} className="relative flex gap-3 pb-4 last:pb-0">
          {i < passos.length - 1 && <span className={`absolute left-[13px] top-[26px] h-full w-px ${p.feito ? "bg-[var(--client-success-border)]" : "bg-[var(--client-border)]"}`} aria-hidden="true" />}
          <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full ${
            p.feito ? "bg-[var(--client-success)] text-white"
              : p.atual ? (atualInfo ? "border-2 border-[var(--client-info)] bg-[var(--client-info-soft)] text-[var(--client-info)]" : "border-2 border-[var(--client-warning)] bg-[var(--client-warning-soft)] text-[var(--client-warning)]")
              : "border border-[var(--client-border)] bg-[var(--client-surface)] text-[var(--client-text-muted)]"
          }`}>
            {p.feito ? <CkIconCheck width={13} height={13} strokeWidth={3} /> : <p.Icone width={13} height={13} />}
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pt-0.5">
            {/* feito vence atual (mesma prioridade do ícone acima) — sem isso,
                o passo "pronto" (feito=true E atual=true no instante exato em
                que status vira "ready") mostrava ícone verde de concluído com
                o texto ainda âmbar de "em andamento", uma contradição visual. */}
            <span className={`text-xs font-semibold ${p.feito ? "text-[var(--client-text-primary)]" : p.atual ? (atualInfo ? "text-[var(--client-info)]" : "text-[var(--client-warning)]") : "text-[var(--client-text-muted)]"}`}>{p.label}</span>
            {p.sub && <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${p.subTom || "border-[var(--client-border)] bg-[var(--client-surface-secondary)] text-[var(--client-text-secondary)]"}`}>{p.sub}</span>}
          </span>
        </li>
        );
      })}
    </ol>
  );
}
