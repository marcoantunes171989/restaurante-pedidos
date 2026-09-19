import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { StatusBadge } from "./StatusBadge.jsx";
import CopyValue from "./CopyValue.jsx";

// Colunas do layout de tabela (≥ xl). Abaixo disso cada migration vira um
// card com células rotuladas — sem scroll horizontal.
const COLUNAS = "xl:grid-cols-[2.25rem_minmax(0,1fr)_6.5rem_6.5rem_11.5rem_8.5rem_2.25rem]";

function Celula({ rotulo, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="mb-0.5 block text-[12px] text-[#6B7280] xl:sr-only">{rotulo}</span>
      {children}
    </div>
  );
}

function MigrationRow({ migration }) {
  const [aberto, setAberto] = useState(false);
  const detalhesId = `migration-detalhes-${migration.order}`;
  const { identity } = migration;

  return (
    <li className="border-t border-[#E5E7EB] first:border-t-0" data-migration={migration.filename}>
      <div className={`grid grid-cols-2 gap-x-3 gap-y-3 px-3 py-3.5 sm:grid-cols-3 sm:px-4 xl:items-center xl:gap-x-3 xl:gap-y-0 ${COLUNAS}`}>
        <span
          className="hidden h-7 w-7 items-center justify-center rounded-full border border-[#D1D5DB] bg-white text-[12px] font-bold text-[#012E46] xl:flex"
          data-testid="migration-order"
        >
          {migration.order}
        </span>

        <div className="col-span-2 flex min-w-0 items-center gap-2.5 sm:col-span-3 xl:col-span-1">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#D1D5DB] bg-white text-[12px] font-bold text-[#012E46] xl:hidden" aria-hidden="true">
            {migration.order}
          </span>
          <p className="min-w-0 break-all font-mono text-[13px] font-semibold leading-5 text-[#111111] xl:break-normal xl:truncate" title={migration.filename}>
            {migration.filename}
          </p>
        </div>

        <Celula rotulo="Tipo"><p className="text-[13px] font-medium text-[#111111]">{migration.kind}</p></Celula>

        <Celula rotulo="Identidade">
          {identity.hasIdentity ? (
            <p className="font-mono text-[12px] leading-5 text-[#111111]">
              <span className="text-[#6B7280]">blob</span> {identity.gitBlobShort}
              <br />
              <span className="text-[#6B7280]">sha</span> {identity.sha256Short}
            </p>
          ) : (
            <p className="text-[13px] text-[#6B7280]">Não informada</p>
          )}
        </Celula>

        <Celula rotulo="Classificação" className="col-span-2 sm:col-span-1">
          <StatusBadge status={migration.classification} />
        </Celula>

        <Celula rotulo="Status" className="col-span-2 sm:col-span-3 xl:col-span-1">
          <StatusBadge status={migration.status} />
        </Celula>

        <div className="col-span-2 sm:col-span-3 xl:col-span-1 xl:justify-self-end">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            aria-controls={detalhesId}
            aria-label={`${aberto ? "Ocultar" : "Ver"} detalhes de ${migration.filename}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-[#012E46] transition hover:bg-[#F0F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#012E46] xl:min-h-9 xl:w-9 xl:justify-center xl:px-0"
          >
            <span className="xl:hidden" aria-hidden="true">{aberto ? "Ocultar detalhes" : "Ver detalhes"}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {aberto && (
        <div id={detalhesId} className="grid gap-4 border-t border-dashed border-[#E5E7EB] bg-[#F9FAFB] px-3 py-4 sm:px-4 lg:grid-cols-2">
          {identity.gitBlob && <CopyValue label="Git blob" value={identity.gitBlob} />}
          {identity.sha256 && <CopyValue label="SHA256" value={identity.sha256} />}
          <p className="text-[13px] leading-5 text-[#4B5563] lg:col-span-2">{migration.classification.hint}</p>
        </div>
      )}
    </li>
  );
}

// Lista/tabela de migrations em preparação. Comporta 0 itens sem quebrar.
export default function MigrationTable({ migrations }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white" aria-label="Atualizações estruturais em preparação">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-[#012E46]">Atualizações estruturais em preparação</h2>
          <p className="mt-0.5 text-[13px] leading-5 text-[#6B7280]">
            Diferença de banco entre Homologação e Produção. Nada aqui é aplicado automaticamente.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-bold text-[#111111]" data-testid="migration-headline">{migrations.headline}</p>
          {migrations.kindsLabel && <p className="text-[12px] text-[#6B7280]">{migrations.kindsLabel}</p>}
        </div>
      </div>

      {migrations.isEmpty ? (
        <div className="mx-4 mb-4 flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#D1D5DB] px-4 py-10 text-center sm:mx-5 sm:mb-5" data-testid="migration-empty">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D1D5DB] bg-white text-[#012E46]" aria-hidden="true">
            <Layers className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#111111]">Nenhuma migration em preparação.</p>
          <p className="max-w-sm text-[13px] leading-5 text-[#6B7280]">Quando houver atualizações estruturais a preparar, elas aparecerão aqui.</p>
        </div>
      ) : (
        <div className="border-t border-[#E5E7EB]">
          <div
            aria-hidden="true"
            className={`hidden gap-x-3 bg-[#F9FAFB] px-4 py-2.5 text-[12px] font-semibold text-[#6B7280] xl:grid ${COLUNAS}`}
          >
            <span>Ordem</span><span>Migration</span><span>Tipo</span><span>Identidade</span><span>Classificação</span><span>Status</span><span />
          </div>
          <ul aria-label="Lista de migrations em preparação">
            {migrations.items.map((m) => <MigrationRow key={m.key} migration={m} />)}
          </ul>
        </div>
      )}
    </section>
  );
}
