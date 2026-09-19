import { useState } from "react";
import { Ban, Eye, Play, RotateCcw, Wrench } from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import ReleaseDrawer from "../ambientes/ReleaseDrawer.jsx";
import FieldGrid from "./FieldGrid.jsx";
import { BackupLevels } from "./ProtectionsPanel.jsx";

function DetailsDrawer({ details, onFechar }) {
  return (
    <ReleaseDrawer
      titulo="Detalhes técnicos da manutenção"
      descricao="Identificadores, nomes técnicos e origem dos dados desta tela."
      onFechar={onFechar}
    >
      {details.sections.map((s) => (
        <section key={s.id} aria-label={s.title}>
          <h3 className="text-sm font-bold text-[#111111]">{s.title}</h3>
          <div className="mt-2"><FieldGrid fields={s.fields} /></div>
        </section>
      ))}

      <section aria-label="Nomes técnicos das etapas">
        <h3 className="text-sm font-bold text-[#111111]">Nomes técnicos das etapas</h3>
        <ol className="mt-2 space-y-1.5">
          {details.phases.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[#111111]"><span className="text-[#6B7280]">{p.index}.</span> {p.label}</span>
              <code className="rounded-md border border-[#D1D5DB] bg-[#F9FAFB] px-1.5 py-0.5 font-mono text-[12px] font-semibold text-[#4B5563]">{p.technicalName}</code>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Níveis de verificação do backup">
        <BackupLevels levels={details.backupLevels} />
      </section>
    </ReleaseDrawer>
  );
}

// Uma ação. Habilita SOMENTE com capability `true` E um handler explícito. Ação
// indisponível mostra o MOTIVO em texto visível (aria-describedby) — nunca só
// tooltip nem só opacidade.
function ActionCell({ id, label, Icon, variante, allowed, onClick, help, notIntegrated }) {
  const enabled = allowed && typeof onClick === "function";
  const motivoId = `acao-motivo-${id}`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-action={id}>
      <PrimeButton
        variante={variante}
        className="min-h-11 w-full"
        disabled={!enabled}
        aria-describedby={enabled ? undefined : motivoId}
        onClick={enabled ? onClick : undefined}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </PrimeButton>
      {!enabled && (
        <p id={motivoId} className="text-[12px] leading-4 text-[#4B5563]">{allowed ? notIntegrated : help}</p>
      )}
    </div>
  );
}

/**
 * Área de ações. A autoridade vem SEMPRE de `capabilities` (fail-closed):
 * cada ação crítica só habilita com capability `true` E um handler explícito
 * (`onStart`/`onCancel`/`onReconcile`/`onRetry`). A tela desta etapa não passa
 * handler algum, então todas permanecem indisponíveis mesmo que uma capability
 * venha `true`. "Ver detalhes" é local (drawer) e só depende de canViewDetails.
 * "Tentar novamente" só aparece após uma falha conhecida.
 */
export default function MaintenanceActions({
  capabilities, failure = null, details, onStart = null, onCancel = null, onReconcile = null, onRetry = null,
}) {
  const [drawer, setDrawer] = useState(false);
  const { help } = capabilities;

  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label="Ações da manutenção">
      <h2 className="text-[15px] font-bold text-[#012E46]">Ações</h2>
      <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">
        Nesta prévia nenhuma ação crítica está disponível. Cada uma será liberada por permissão do sistema.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActionCell
          id="start" label="Iniciar manutenção" Icon={Play} variante="blue"
          allowed={capabilities.canStart} onClick={onStart} help={help.start} notIntegrated={help.notIntegrated}
        />
        <ActionCell
          id="cancel" label="Cancelar" Icon={Ban} variante="ghost"
          allowed={capabilities.canCancel} onClick={onCancel} help={help.cancel} notIntegrated={help.notIntegrated}
        />
        {failure?.isFailed && (
          <ActionCell
            id="retry" label="Tentar novamente" Icon={RotateCcw} variante="ghost"
            allowed={capabilities.canRetry} onClick={onRetry} help={help.retry} notIntegrated={help.notIntegrated}
          />
        )}
        <ActionCell
          id="reconcile" label="Reconciliar" Icon={Wrench} variante="ghost"
          allowed={capabilities.canReconcile} onClick={onReconcile} help={help.reconcile} notIntegrated={help.notIntegrated}
        />
        <ActionCell
          id="details" label="Ver detalhes" Icon={Eye} variante="ghost"
          allowed={capabilities.canViewDetails} onClick={() => setDrawer(true)} help={help.details} notIntegrated={help.notIntegrated}
        />
      </div>

      {drawer && <DetailsDrawer details={details} onFechar={() => setDrawer(false)} />}
    </section>
  );
}
