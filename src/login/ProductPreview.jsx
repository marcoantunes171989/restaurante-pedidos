import { Fragment } from "react";
import { IconMesa, IconRelogio, IconCentral, IconDados } from "./icons";

// ════════════════════════════════════════════════════════════
//  Prévia visual abstrata do produto — SEM fotografia, SEM métricas
//  inventadas (valores/percentuais). Representa três recursos reais
//  do Pedido Prime de forma esquemática: fluxo do pedido (recebido →
//  preparo → pronto), status de mesa e resumo operacional — como
//  indicadores/cards de interface, não uma tela real recortada.
//  Cor: nenhum terracota aqui — o preview usa só as cores semânticas
//  de status (info/aviso/sucesso), já usadas para o mesmo fim em todo
//  o sistema. Terracota fica reservado ao CTA do formulário.
// ════════════════════════════════════════════════════════════

const FLUXO = [
  { label: "Recebido", dot: "bg-[var(--pp-info)]" },
  { label: "Preparo", dot: "bg-[var(--pp-warning)]" },
  { label: "Pronto", dot: "bg-[var(--pp-success)]" },
];

// Grade ilustrativa de status de mesa — padrão fixo (não são dados reais).
const MESAS = ["success", "warning", "success", "info", "success", "warning", "info", "success"];
const MESA_TOM = {
  success: "bg-[var(--pp-success)]/15 text-[var(--pp-success-text)]",
  warning: "bg-[var(--pp-warning)]/15 text-[var(--pp-warning-text)]",
  info: "bg-[var(--pp-info)]/12 text-[var(--pp-info)]",
};

const RESUMO = [
  { Icon: IconCentral, texto: "Operação centralizada" },
  { Icon: IconRelogio, texto: "Tempo real" },
  { Icon: IconDados, texto: "Dados organizados" },
];

export default function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[19rem]" aria-hidden="true">
      {/* Chip de destaque — fluxo do pedido, uma linha compacta pendurada no
          canto superior direito do card principal. z-20 para ficar ACIMA do
          card principal (que vem depois no DOM e, sem isso, pintaria por
          cima da borda inferior deste chip). */}
      <div className="pp-float absolute -top-4 right-3 z-20 flex items-center gap-1 rounded-full border border-[var(--login-border)] bg-[var(--login-surface)] py-1.5 pl-2.5 pr-3 shadow-[var(--login-shadow)]">
        {FLUXO.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && <span className="text-[9px] text-[var(--login-border)]">›</span>}
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
            <span className="text-[9px] font-bold leading-none text-[var(--login-text-secondary)]">{s.label}</span>
          </Fragment>
        ))}
      </div>

      {/* Card principal — status das mesas */}
      <div className="relative rounded-[1.75rem] border border-[var(--login-border)] bg-[var(--login-surface)] p-5 pt-8 shadow-[var(--login-shadow)]">
        <div className="flex items-center gap-2 text-[var(--login-text-secondary)]">
          <IconMesa />
          <p className="text-xs font-bold text-[var(--login-text-primary)]">Status das mesas</p>
        </div>
        <div className="mt-3.5 grid grid-cols-4 gap-2">
          {MESAS.map((tom, i) => (
            <span key={i} className={`flex h-9 items-center justify-center rounded-lg text-[10px] font-bold ${MESA_TOM[tom]}`}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><ellipse cx="12" cy="7" rx="7" ry="2.6" /><path d="M6 9v6M18 9v6M12 9.5v8.5" /></svg>
            </span>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-4 border-t border-[var(--login-border)] pt-3 text-[10px] font-semibold text-[var(--login-text-secondary)]">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--pp-success)]" />Livre</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--pp-warning)]" />Ocupada</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--pp-info)]" />Aguardando</span>
        </div>
      </div>

      {/* Faixa — resumo operacional (só rótulos de capacidade, sem número) */}
      <div className="relative mt-4 flex items-center justify-between gap-2 rounded-2xl border border-[var(--login-border)] bg-[var(--login-surface-secondary)] px-4 py-3">
        {RESUMO.map(({ Icon, texto }) => (
          <span key={texto} className="flex flex-1 items-center gap-1.5 text-[var(--login-text-secondary)]">
            <Icon />
            <span className="text-[9.5px] font-bold leading-tight">{texto}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
