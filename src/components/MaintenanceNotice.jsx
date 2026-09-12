// ════════════════════════════════════════════════════════════
//  Microgate 08-B3-B — Banner informativo de manutenção (fase NOTICE).
//
//  Componente visual puro: recebe status/state por props, NUNCA chama
//  useMaintenanceState internamente (o polling só pode existir uma vez, na
//  raiz global — ver App.jsx). Não renderiza nada fora de phase === "NOTICE".
//  Nunca exibe reason/releaseId/targetSha/version/messageOperator — só a
//  projeção pública já validada por src/lib/maintenance.js.
// ════════════════════════════════════════════════════════════

const MENSAGEM_PADRAO = "Manutenção programada em breve. O sistema continua disponível normalmente.";

function formatarPrevisao(scheduledFor) {
  if (typeof scheduledFor !== "string" || !scheduledFor) return null;
  const data = new Date(scheduledFor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MaintenanceNotice({ status, state }) {
  if (!state || state.phase !== "NOTICE") return null;

  const mensagem = typeof state.messagePublic === "string" && state.messagePublic.trim()
    ? state.messagePublic.trim()
    : MENSAGEM_PADRAO;
  const previsao = formatarPrevisao(state.scheduledFor);

  return (
    <div
      role="status"
      aria-live="polite"
      data-maintenance-status={status}
      className="w-full flex-wrap break-words bg-[#012E46] px-4 py-2.5 text-center font-light text-white"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <p className="w-full break-words text-sm font-light leading-6">
        {mensagem}
        {previsao && (
          <span className="font-medium text-[#F38525]"> Previsão: {previsao}.</span>
        )}
      </p>
    </div>
  );
}

export default MaintenanceNotice;
