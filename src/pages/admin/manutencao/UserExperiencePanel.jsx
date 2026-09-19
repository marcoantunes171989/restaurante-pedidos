import { Activity, HardDrive, Layers, Lock, LockOpen, MessageSquare, ScanSearch } from "lucide-react";
import { ToneBadge } from "../ambientes/StatusBadge.jsx";

// Ícone decorativo de cada passo da proteção, na ordem de SAFETY_FLOW
// (bloqueio → drenagem → backup → migrations → smoke → liberação).
const FLOW_ICONS = [Lock, Activity, HardDrive, Layers, ScanSearch, LockOpen];

// Pré-visualização do que o usuário verá durante uma atualização. É só texto de
// política: a tela de login NÃO é alterada por este componente.
export function UserMessageCard({ userExperience }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Mensagem para o usuário" data-testid="user-message-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-[15px] font-bold text-[#012E46]">O que o usuário vê</h2>
        <ToneBadge tone="brand">Mensagem exibida durante manutenção</ToneBadge>
      </div>

      <figure className="mt-3.5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#AFC2CC] bg-[#F0F6F8] text-[#012E46]" aria-hidden="true">
            <MessageSquare className="h-5 w-5" />
          </span>
          <blockquote className="min-w-0 text-sm font-semibold leading-6 text-[#111111]" data-testid="user-message">
            {userExperience.message}
          </blockquote>
        </div>
        <figcaption className="mt-2 pl-12 text-[12px] leading-4 text-[#6B7280]">Pré-visualização — a tela de login não é alterada por esta interface.</figcaption>
      </figure>

      <p className="mt-3.5 flex items-start gap-2 text-[13px] leading-5 text-[#4B5563]" data-testid="auto-reopen">
        <LockOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#012E46]" aria-hidden="true" />
        <span className="min-w-0">{userExperience.autoReopen}</span>
      </p>
    </section>
  );
}

// Fluxo de proteção em uma olhada: 6 passos visuais, não um parágrafo.
export function SafetyFlowCard({ userExperience }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Como a atualização protege o sistema" data-testid="safety-flow">
      <h2 className="text-[15px] font-bold text-[#012E46]">Durante uma atualização</h2>
      <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {userExperience.safetyFlow.map((texto, i) => {
          const Icone = FLOW_ICONS[i] || Lock;
          return (
            <li key={texto} className="flex items-center gap-2.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-[13px] leading-5 text-[#111111]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D1D5DB] bg-[#F9FAFB] text-[12px] font-bold text-[#012E46]" aria-hidden="true">{i + 1}</span>
              <Icone className="h-4 w-4 shrink-0 text-[#012E46]" aria-hidden="true" />
              <span className="min-w-0">{texto}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
