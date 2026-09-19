import { CircleAlert } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";

// Skeleton estático da tela (sem animação obrigatória). Hoje a fixture é
// síncrona e nunca passa por aqui; o estado existe para o adapter live.
export function EnvironmentsSkeleton() {
  const bloco = "rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB]";
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Carregando ambientes" data-state="loading">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${bloco} h-56 animate-pulse motion-reduce:animate-none`} />
        <div className={`${bloco} h-56 animate-pulse motion-reduce:animate-none`} />
      </div>
      <div className={`${bloco} h-40 animate-pulse motion-reduce:animate-none`} />
      <div className={`${bloco} h-64 animate-pulse motion-reduce:animate-none`} />
      <span className="sr-only">Carregando o estado dos ambientes…</span>
    </div>
  );
}

// Erro reutilizável. "Tentar novamente" só aparece se o data source oferecer retry.
export function EnvironmentsError({ message, onRetry = null }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border border-[#F3C1CE] bg-[#FDF0F3] px-4 py-10 text-center"
      role="alert"
      data-state="error"
    >
      <CircleAlert className="h-8 w-8 text-[#9F1239]" aria-hidden="true" />
      <p className="text-sm font-bold text-[#9F1239]">{message}</p>
      <p className="max-w-md text-[13px] leading-5 text-[#4B5563]">Nenhuma alteração foi feita. Tente novamente em instantes.</p>
      {onRetry && (
        <PrimeButton variante="ghost" onClick={onRetry} className="mt-2 min-h-11">Tentar novamente</PrimeButton>
      )}
    </div>
  );
}
