import { CkIconCheck } from "./CkIcons.jsx";

export default function EtapaProgresso({ etapas, atualIdx }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progresso do pedido">
      {etapas.map((e, i) => {
        // A etapa ATUAL nunca fica verde antes de ser passada: verde = etapa já
        // concluída (i < atualIdx); a atual fica laranja (ação, harmoniza com o
        // botão "Confirmar"). Verde = já fiz · laranja = fazer agora.
        const feita = i < atualIdx;
        const atual = i === atualIdx;
        return (
          <li key={e.label} className="flex flex-1 items-center gap-1.5">
            {/* Concluído = VERDE (sucesso/confirmação, igual à timeline de
                acompanhamento) · Atual = laranja (ação/foco) · Pendente = cinza.
                Cada estado em uma cor no seu papel (não laranja para os dois). */}
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
              feita ? "bg-[var(--client-success)] text-white" : atual ? "border-2 border-[var(--client-primary)] text-[var(--client-primary-hover)]" : "border border-[var(--client-border)] text-[var(--client-text-muted)]"
            }`} aria-current={atual ? "step" : undefined}>
              {feita ? <CkIconCheck width={12} height={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={`truncate text-[11px] font-semibold ${atual || feita ? "text-[var(--client-text-primary)]" : "text-[var(--client-text-muted)]"}`}>{e.label}</span>
            {i < etapas.length - 1 && <span className={`h-px flex-1 ${feita ? "bg-[var(--client-success-border)]" : "bg-[var(--client-border)]"}`} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
