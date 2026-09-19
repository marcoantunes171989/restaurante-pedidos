import { useId, useState } from "react";
import { Activity, ChevronDown, CircleCheck, Circle, HardDrive, Info, KeyRound, LogIn, ShieldCheck, Users } from "lucide-react";
import { StatusBadge } from "../ambientes/StatusBadge.jsx";
import FieldGrid from "./FieldGrid.jsx";

// Ícone decorativo de cada proteção (o significado vem do título e do texto).
const ICONES = {
  loginGate: LogIn,
  writeFence: ShieldCheck,
  activeSessions: Users,
  inFlightOperations: Activity,
  executionLock: KeyRound,
  backup: HardDrive,
};

// Níveis de verificação do backup (L1/L2/L3). Ficam só nos detalhes — a visão
// principal mostra apenas o estado do backup.
export function BackupLevels({ levels }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-[#111111]">Níveis de verificação</p>
      <ul className="mt-1.5 space-y-1.5" aria-label="Níveis de verificação do backup" data-testid="backup-levels">
        {levels.map((l) => {
          const Icone = l.reached ? CircleCheck : Circle;
          return (
            <li key={l.id} data-level={l.id} data-reached={l.reached ? "true" : "false"} className="flex items-start gap-2 text-[13px] leading-5">
              <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${l.reached ? "text-[#166534]" : "text-[#9CA3AF]"}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold text-[#111111]">{l.label}</span>
                <span className="text-[#6B7280]"> — {l.help}</span>
                <span className="ml-1.5 font-semibold text-[#4B5563]">{l.reached ? "Alcançado" : "Não alcançado"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProtectionHeader({ item }) {
  const Icone = ICONES[item.id] || ShieldCheck;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-x-3">
      <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:flex-1">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#D1D5DB] bg-white text-[#012E46]" aria-hidden="true">
          <Icone className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#111111]">{item.title}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">{item.description}</p>
        </div>
      </div>
      <StatusBadge status={item.status} className="shrink-0" />
    </div>
  );
}

function ProtectionDetails({ item, id }) {
  return (
    <div id={id} className="mt-1 space-y-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-3 text-[13px] leading-5" data-testid={`details-${item.id}`}>
      {item.reason && <p className="text-[#111111]">{item.reason}</p>}
      {item.helpText && (
        <p className="flex items-start gap-1.5 text-[#4B5563]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{item.helpText}</span>
        </p>
      )}
      <FieldGrid fields={item.fields} />
      {item.levels && <BackupLevels levels={item.levels} />}
    </div>
  );
}

// Uma proteção. Sempre expansível (teclado + aria-expanded): o detalhe mostra
// os campos preparados para a integração — vazios aparecem como "Não
// verificado"/"Não disponível", nunca como 0.
function ProtectionRow({ item }) {
  const [aberto, setAberto] = useState(false);
  const detalhesId = `protecao-detalhes-${useId()}`;

  return (
    <li className="border-t border-[#E5E7EB] first:border-t-0" data-protection={item.id} data-status={item.status.key}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={detalhesId}
        className="flex w-full items-start gap-2 rounded-lg px-1 py-3 text-left transition hover:bg-[#F9FAFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46]"
      >
        <ProtectionHeader item={item} />
        <ChevronDown className={`mt-2 h-4 w-4 shrink-0 text-[#6B7280] transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {aberto && <div className="pb-3"><ProtectionDetails item={item} id={detalhesId} /></div>}
    </li>
  );
}

export default function ProtectionsPanel({ protections }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Proteções da atualização">
      <h2 className="text-[15px] font-bold text-[#012E46]">Proteções da atualização</h2>
      <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">
        O que garante que a atualização não cause perda de dados. Selecione uma proteção para ver os detalhes.
      </p>
      <ul className="mt-3" aria-label="Lista de proteções">
        {protections.items.map((item) => <ProtectionRow key={item.id} item={item} />)}
      </ul>
    </section>
  );
}
