import { TONES } from "../ambientes/releaseStatus.js";

// Aviso de falha. Reutilizável e NÃO exibido por padrão (o view-model só
// entrega `failure` quando a execução falhou ou exige reconciliação).
//  • FAILED            → falha conhecida (tom "danger").
//  • RECOVERY_REQUIRED → estado possivelmente mutado/ambíguo (tom "critical",
//                        borda dupla) — exige análise técnica antes de liberar.
// As ações (Reconciliar / Tentar novamente) ficam em MaintenanceActions e
// seguem capabilities; este componente só explica.
export default function RecoveryNotice({ failure }) {
  const { Icon } = failure;
  return (
    <section
      role="alert"
      aria-label={failure.title}
      className={`flex items-start gap-3 rounded-2xl border p-4 sm:p-5 ${TONES[failure.tone]}`}
      data-testid="recovery-notice"
      data-kind={failure.kind}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true"><Icon className="h-6 w-6" /></span>
      <div className="min-w-0">
        <h2 className="text-[15px] font-bold">{failure.title}</h2>
        <p className="mt-1 text-[13px] leading-5">{failure.message}</p>
      </div>
    </section>
  );
}
