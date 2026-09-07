import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw, GitBranch, GitCommit, CheckCircle2, Circle, Clock,
  AlertTriangle, Database, Activity, ShieldCheck, Radio, Rocket,
  ListChecks, History, ArrowRight, ArrowDown, ExternalLink, ServerCog,
} from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";
import { supabase } from "../../lib/supabase.js";

// ════════════════════════════════════════════════════════════
//  Ambientes & Releases — Microgate 23
//  Consome /api/ambientes (resources: environments, compare, deployments,
//  health, history) com o Bearer da sessão Supabase já existente. GET-only,
//  sem polling, sem mock em runtime — falhas por resource são isoladas e
//  nunca inferem um estado saudável (UNKNOWN nunca vira ONLINE/SYNCED).
// ════════════════════════════════════════════════════════════

const RESOURCE_NAMES = ["environments", "compare", "deployments", "health", "history"];

const ESTADOS_COMPARACAO = {
  SYNCED: { label: "Sincronizados", tom: "ok" },
  HML_AHEAD: { label: "Homologação à frente", tom: "alerta" },
  PROD_AHEAD: { label: "Produção à frente", tom: "alerta" },
  DIVERGED: { label: "Divergentes", tom: "erro" },
  UNKNOWN: { label: "Desconhecido", tom: "neutro" },
};

const HEALTH_ITENS = [
  { key: "frontend", label: "Frontend" },
  { key: "api", label: "API" },
  { key: "supabase", label: "Supabase" },
  { key: "auth", label: "Auth" },
  { key: "realtime", label: "Realtime" },
];

const HEALTH_TOM = { ONLINE: "ok", DEGRADED: "alerta", OFFLINE: "erro", UNKNOWN: "neutro" };
const HEALTH_LABEL = { ONLINE: "Online", DEGRADED: "Degradado", OFFLINE: "Offline", UNKNOWN: "Desconhecido" };

// Agrega os 5 providers de health (frontend/api/supabase/auth/realtime) num
// único status "geral" do ambiente — usado pelo badge Online/Degradado/
// Offline/Desconhecido no topo do EnvCard. `environmentsData()` (GitHub) NÃO
// é health e nunca deve alimentar este badge (ver Microgate 38 §6): UNKNOWN
// nunca vira ONLINE, e a ausência do resource health também é Desconhecido.
function agregarHealthAmbiente(ambienteHealth) {
  if (!ambienteHealth) return "UNKNOWN";
  const statuses = HEALTH_ITENS.map((item) => ambienteHealth[item.key]?.status);
  if (statuses.some((s) => s === "OFFLINE")) return "OFFLINE";
  if (statuses.some((s) => s === "DEGRADED")) return "DEGRADED";
  if (statuses.some((s) => s !== "ONLINE")) return "UNKNOWN";
  return "ONLINE";
}

const DEPLOY_TOM = {
  READY: "ok", BUILDING: "alerta", INITIALIZING: "alerta", QUEUED: "alerta",
  ERROR: "erro", CANCELED: "erro", BLOCKED: "erro", UNKNOWN: "neutro",
};

const PIPELINE_CONCEITUAL = [
  { id: "dev", label: "Desenvolvimento" },
  { id: "hml", label: "Homologação" },
  { id: "testes", label: "Testes" },
  { id: "aprovacao", label: "Aprovação" },
  { id: "agendamento", label: "Agendamento" },
  { id: "producao", label: "Produção" },
];

const CHECKLIST_BASE = [
  { id: "branch_hml", label: "Branch homologacao atualizada" },
  { id: "working_tree", label: "Working tree limpa" },
  { id: "testes_automatizados", label: "Testes automatizados" },
  { id: "build", label: "Build" },
  { id: "hml_online", label: "Homologação online" },
  { id: "smoke_hml", label: "Smoke HML" },
  { id: "banco_hml", label: "Banco HML validado" },
  { id: "alteracoes_revisadas", label: "Alterações revisadas" },
  { id: "backup_prod", label: "Backup PROD" },
  { id: "migrations_revisadas", label: "Migrations revisadas" },
  { id: "aprovacao_humana", label: "Aprovação humana" },
  { id: "janela_deploy", label: "Janela de deploy" },
];

function estadoInicialResource() {
  return { status: "idle", data: null, source: null, httpStatus: null, errorCode: null };
}

function estadoInicialResources() {
  const out = {};
  RESOURCE_NAMES.forEach((r) => { out[r] = estadoInicialResource(); });
  return out;
}

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function formatarDuracao(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}min`;
}

// Mensagem segura por resource (nunca expõe body bruto/stack/token).
function mensagemErroResource(resourceState) {
  if (resourceState.httpStatus === 401) return "Sessão expirada ou inválida.";
  if (resourceState.httpStatus === 403) return "Acesso não autorizado para esta área.";
  if (resourceState.httpStatus === 400) return "Requisição inválida.";
  if (typeof resourceState.httpStatus === "number" && resourceState.httpStatus >= 500) return "Erro no servidor.";
  return "Não foi possível carregar estes dados.";
}

// ── Selo de status leve (texto + cor — nunca só a cor) ──────────
function StatusPill({ tom = "neutro", children }) {
  const estilos = {
    ok: "border-[#B8DFC4] bg-[#F0FDF4] text-[#166534]",
    alerta: "border-[#F9D8AE] bg-[#FFF7ED] text-[#9A5B12]",
    erro: "border-[#F3C1CE] bg-[#FDF0F3] text-[#9F1239]",
    azul: "border-[#AFC2CC] bg-[#F0F6F8] text-[#012E46]",
    neutro: "border-[#D1D5DB] bg-[#F9FAFB] text-[#6B7280]",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${estilos[tom] || estilos.neutro}`}>
      {children}
    </span>
  );
}

function PillIcone({ tom }) {
  if (tom === "ok") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tom === "alerta") return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tom === "erro") return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Circle className="h-3.5 w-3.5" aria-hidden="true" />;
}

function Secao({ icone, titulo, descricao, acao = null, children }) {
  return (
    <section className="rounded-2xl border border-[#D1D5DB] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)] sm:p-5" aria-label={titulo}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {icone && (
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#F38525]/30 bg-[#F38525]/10 text-[#F38525]" aria-hidden="true">
              {icone}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-[#111111]">{titulo}</h2>
            {descricao && <p className="mt-0.5 text-[12px] leading-5 text-[#6B7280]">{descricao}</p>}
          </div>
        </div>
        {acao}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function LinhaDado({ rotulo, valor, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#F3F4F6] py-2 text-sm last:border-0">
      <dt className="text-[#6B7280]">{rotulo}</dt>
      <dd className={`truncate text-right font-semibold text-[#111111] ${mono ? "font-mono text-[13px]" : ""}`}>{valor}</dd>
    </div>
  );
}

// Placeholder de estado — usado enquanto um resource carrega ou falha,
// mantendo o layout estável (sem desmontar a seção nem a página).
function EstadoResourceInline({ resourceState, rotulo }) {
  if (resourceState.status === "loading" || resourceState.status === "idle") {
    return <p className="text-sm text-[#6B7280]">Carregando {rotulo}…</p>;
  }
  if (resourceState.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#F3C1CE] bg-[#FDF0F3] px-3 py-2 text-sm font-semibold text-[#9F1239]">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {mensagemErroResource(resourceState)}
      </div>
    );
  }
  return null;
}

function EnvCard({ ambiente, envData, envState, deployState, healthState }) {
  const ehProd = ambiente === "producao";
  const nomeAmbiente = ehProd ? "Produção" : "Homologação";

  // Badge Online/Degradado/Offline/Desconhecido vem do resource health (5
  // providers agregados), nunca de envData.status (metadados GitHub — ver
  // Microgate 38 §6). Se o resource health falhar, o badge é Desconhecido.
  const ambienteHealth = healthState.status === "success" ? healthState.data?.environments?.[ambiente] : null;
  const statusGeral = healthState.status === "success" ? agregarHealthAmbiente(ambienteHealth) : "UNKNOWN";

  if (envState.status !== "success" || !envData) {
    return (
      <article className="flex flex-col gap-3 rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label={`Ambiente ${nomeAmbiente}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{nomeAmbiente}</p>
        <EstadoResourceInline resourceState={envState} rotulo="ambiente" />
      </article>
    );
  }

  // Deploy mais recente deste ambiente (se o resource deployments tiver sucesso).
  let ultimoDeploy = null;
  if (deployState.status === "success" && Array.isArray(deployState.data?.items)) {
    ultimoDeploy = deployState.data.items
      .filter((d) => d.environment === ambiente)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null;
  }

  const commit = envData.commit;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5" aria-label={`Ambiente ${nomeAmbiente}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ehProd ? "bg-[#012E46] text-white" : "bg-[#F38525]/10 text-[#F38525]"}`}
            aria-hidden="true"
          >
            <ServerCog className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">{nomeAmbiente}</p>
            <p className="flex items-center gap-1 text-sm font-bold text-[#111111]">
              {envData.url || "—"}
              {envData.url && <ExternalLink className="h-3 w-3 text-[#6B7280]" aria-hidden="true" />}
            </p>
          </div>
        </div>
        <StatusPill tom={HEALTH_TOM[statusGeral] || "neutro"}>
          <PillIcone tom={HEALTH_TOM[statusGeral] || "neutro"} />
          {HEALTH_LABEL[statusGeral] || "Desconhecido"}
        </StatusPill>
      </div>
      <dl>
        <LinhaDado rotulo="Branch" valor={envData.branch || "—"} mono />
        <LinhaDado rotulo="Commit" valor={commit?.shortSha || "—"} mono />
        {commit?.message && <LinhaDado rotulo="Mensagem" valor={commit.message} />}
        {commit?.author && <LinhaDado rotulo="Autor" valor={commit.author} />}
        {commit?.committedAt && <LinhaDado rotulo="Commitado em" valor={formatarData(commit.committedAt)} />}
        <LinhaDado rotulo="Deploy" valor={ultimoDeploy ? (ultimoDeploy.status || "UNKNOWN") : "—"} />
      </dl>
      {envData.source === "not_configured" && (
        <p className="text-[11px] text-[#6B7280]">Integração GitHub não configurada neste ambiente.</p>
      )}
      {envData.source === "github_error" && (
        <p className="text-[11px] text-[#9A5B12]">Falha ao consultar o GitHub para este ambiente.</p>
      )}
    </article>
  );
}

function PipelineEtapa({ etapa, ultima }) {
  return (
    <div className="flex items-center lg:flex-1">
      <div className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-[#D1D5DB] bg-white px-3 py-4 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F9FAFB] text-[#6B7280]" aria-hidden="true">
          <Circle className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[#111111]">{etapa.label}</p>
      </div>
      {!ultima && (
        <>
          <ArrowRight className="mx-1.5 hidden h-4 w-4 shrink-0 text-[#D1D5DB] lg:block" aria-hidden="true" />
          <ArrowDown className="my-1.5 block h-4 w-4 shrink-0 text-[#D1D5DB] lg:hidden" aria-hidden="true" />
        </>
      )}
    </div>
  );
}

function HealthCard({ nomeAmbiente, ambienteHealth, healthState }) {
  return (
    <div className="rounded-2xl border border-[#D1D5DB] bg-white p-4" aria-label={`Health ${nomeAmbiente}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">{nomeAmbiente}</p>
      </div>
      {healthState.status !== "success" || !ambienteHealth ? (
        <EstadoResourceInline resourceState={healthState} rotulo="health" />
      ) : (
        <ul className="space-y-2">
          {HEALTH_ITENS.map((item) => {
            const providerStatus = ambienteHealth[item.key]?.status || "UNKNOWN";
            const tom = HEALTH_TOM[providerStatus] || "neutro";
            return (
              <li key={item.key} className="flex items-center justify-between text-sm">
                <span className="text-[#111111]">{item.label}</span>
                <StatusPill tom={tom}><PillIcone tom={tom} />{HEALTH_LABEL[providerStatus] || "Desconhecido"}</StatusPill>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Estado vazio para superfície clara (fundo branco), local a esta página.
function EmptyStateClaro({ icone = null, titulo, dica }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 py-12 text-center">
      {icone && (
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D1D5DB] bg-white text-[#334155] [&>svg]:h-6 [&>svg]:w-6">
          {icone}
        </span>
      )}
      <p className="text-sm font-semibold text-[#334155]">{titulo}</p>
      {dica && <p className="max-w-sm text-xs leading-5 text-[#64748B]">{dica}</p>}
    </div>
  );
}

function ChecklistLinha({ item }) {
  const rotuloEstado = item.estado === "ok" ? "Concluído" : item.estado === "pendente" ? "Pendente" : "Não verificado";
  const Icone = item.estado === "ok" ? CheckCircle2 : Circle;
  return (
    <li className="flex items-center gap-2.5 border-b border-[#F3F4F6] py-2 text-sm last:border-0">
      <Icone className={`h-4 w-4 shrink-0 ${item.estado === "ok" ? "text-[#166534]" : "text-[#6B7280]"}`} aria-hidden="true" />
      <span className={item.estado === "ok" ? "text-[#111111]" : "text-[#6B7280]"}>{item.label}</span>
      <span className="ml-auto shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">{rotuloEstado}</span>
    </li>
  );
}

export default function AmbientesAdmin() {
  const [sessaoStatus, setSessaoStatus] = useState("checking"); // checking | ok | indisponivel
  const [resources, setResources] = useState(() => estadoInicialResources());
  const [refreshing, setRefreshing] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState(null);
  const [agora, setAgora] = useState(() => Date.now());

  const montadoRef = useRef(true);
  const carregandoRef = useRef(false);
  const abortRef = useRef(null);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Ticker local apenas para o texto "Atualizado há Xs" — não dispara rede.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const carregar = useCallback(async () => {
    if (carregandoRef.current) return; // bloqueia refresh concorrente
    carregandoRef.current = true;
    setRefreshing(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let token = null;
      try {
        const { data } = await supabase.auth.getSession();
        token = data?.session?.access_token || null;
      } catch {
        token = null;
      }

      if (!token) {
        if (!montadoRef.current) return;
        setSessaoStatus("indisponivel");
        setResources(estadoInicialResources());
        return;
      }

      if (!montadoRef.current) return;
      setSessaoStatus("ok");
      setResources((prev) => {
        const next = { ...prev };
        RESOURCE_NAMES.forEach((r) => { next[r] = { ...next[r], status: "loading" }; });
        return next;
      });

      const settled = await Promise.allSettled(
        RESOURCE_NAMES.map(async (resource) => {
          const response = await fetch(`/api/ambientes?resource=${resource}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: "no-store",
          });
          let body = null;
          try { body = await response.json(); } catch { /* corpo não-JSON */ }
          if (!response.ok) {
            return { resource, status: "error", httpStatus: response.status, errorCode: body?.error || null };
          }
          return { resource, status: "success", httpStatus: response.status, data: body?.data ?? null, source: body?.source ?? null };
        }),
      );

      if (!montadoRef.current || controller.signal.aborted) return;

      setResources((prev) => {
        const next = { ...prev };
        settled.forEach((result, idx) => {
          const resource = RESOURCE_NAMES[idx];
          if (result.status === "fulfilled") {
            const r = result.value;
            if (r.status === "success") {
              next[resource] = { status: "success", data: r.data, source: r.source, httpStatus: r.httpStatus, errorCode: null };
            } else {
              next[resource] = { status: "error", data: null, source: null, httpStatus: r.httpStatus, errorCode: r.errorCode };
            }
          } else {
            const aborted = result.reason?.name === "AbortError";
            if (aborted) return; // não trata abort como erro visual
            next[resource] = { status: "error", data: null, source: null, httpStatus: null, errorCode: "network_error" };
          }
        });
        return next;
      });
      setAtualizadoEm(Date.now());
    } finally {
      carregandoRef.current = false;
      if (montadoRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const segundos = atualizadoEm == null ? null : Math.max(0, Math.round((agora - atualizadoEm) / 1000));
  const textoAtualizacao = segundos == null
    ? "Ainda não atualizado"
    : segundos < 5
      ? "Atualizado há poucos segundos"
      : segundos < 60
        ? `Atualizado há ${segundos}s`
        : `Atualizado há ${Math.round(segundos / 60)} min`;

  const successCount = RESOURCE_NAMES.filter((r) => resources[r].status === "success").length;
  const errorCount = RESOURCE_NAMES.filter((r) => resources[r].status === "error").length;
  const algumAuthErro = RESOURCE_NAMES.some((r) => resources[r].httpStatus === 401);
  const algumForbidden = RESOURCE_NAMES.some((r) => resources[r].httpStatus === 403);

  let pageStatus = "LOADING";
  if (sessaoStatus === "indisponivel") pageStatus = "AUTH_ERROR";
  else if (algumAuthErro) pageStatus = "AUTH_ERROR";
  else if (algumForbidden) pageStatus = "FORBIDDEN";
  else if (successCount === RESOURCE_NAMES.length) pageStatus = "SUCCESS";
  else if (successCount > 0 && errorCount > 0) pageStatus = "PARTIAL";
  else if (errorCount === RESOURCE_NAMES.length) pageStatus = "ERROR";

  const indicadorStatus = pageStatus === "SUCCESS" ? { rotulo: "Dados atualizados", valor: "●", tom: "ok" }
    : pageStatus === "PARTIAL" ? { rotulo: "Dados parciais", valor: "●", tom: "alerta" }
      : pageStatus === "AUTH_ERROR" || pageStatus === "FORBIDDEN" || pageStatus === "ERROR" ? { rotulo: "Falha ao carregar", valor: "●", tom: "erro" }
        : { rotulo: "Carregando…", valor: "●", tom: "neutro" };

  if (sessaoStatus === "indisponivel") {
    return (
      <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
        <PageHeader
          icone={<Rocket className="h-5 w-5" aria-hidden="true" />}
          titulo="Ambientes & Releases"
          descricao="Acompanhe versões, alterações, validações e promoções entre Homologação e Produção."
        />
        <div className="rounded-2xl border border-[#F3C1CE] bg-[#FDF0F3] p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[#9F1239]" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-[#9F1239]">Sessão indisponível.</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">Faça login novamente para acessar os dados de ambientes.</p>
        </div>
      </div>
    );
  }

  const environmentsState = resources.environments;
  const compareState = resources.compare;
  const deploymentsState = resources.deployments;
  const healthState = resources.health;
  const historyState = resources.history;

  const envHomologacao = Array.isArray(environmentsState.data)
    ? environmentsState.data.find((e) => e.environment === "homologacao") : null;
  const envProducao = Array.isArray(environmentsState.data)
    ? environmentsState.data.find((e) => e.environment === "producao") : null;

  const comparacao = compareState.status === "success"
    ? (ESTADOS_COMPARACAO[compareState.data?.status] || ESTADOS_COMPARACAO.UNKNOWN)
    : ESTADOS_COMPARACAO.UNKNOWN;

  const healthHomologacao = healthState.status === "success" ? healthState.data?.environments?.homologacao : null;
  const healthProducao = healthState.status === "success" ? healthState.data?.environments?.producao : null;

  const homologacaoTudoOnline = healthHomologacao
    ? HEALTH_ITENS.every((item) => healthHomologacao[item.key]?.status === "ONLINE")
    : false;

  const checklist = CHECKLIST_BASE.map((item) => {
    if (item.id === "hml_online") {
      return { ...item, estado: healthState.status === "success" ? (homologacaoTudoOnline ? "ok" : "pendente") : "nao_verificado" };
    }
    if (item.id === "alteracoes_revisadas") {
      return { ...item, estado: compareState.status === "success" && compareState.data?.status === "SYNCED" ? "ok" : "nao_verificado" };
    }
    if (item.id === "aprovacao_humana") {
      return { ...item, estado: "pendente" };
    }
    return { ...item, estado: "nao_verificado" };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={<Rocket className="h-5 w-5" aria-hidden="true" />}
        titulo="Ambientes & Releases"
        descricao="Acompanhe versões, alterações, validações e promoções entre Homologação e Produção."
        indicadores={[
          { rotulo: textoAtualizacao, valor: "●", tom: "neutro" },
          indicadorStatus,
        ]}
        acao={(
          <PrimeButton variante="ghost" onClick={carregar} disabled={refreshing} aria-busy={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshing ? "Atualizando…" : "Atualizar agora"}
          </PrimeButton>
        )}
      />

      {pageStatus === "AUTH_ERROR" && (
        <div className="rounded-2xl border border-[#F3C1CE] bg-[#FDF0F3] px-4 py-2.5 text-[12px] font-semibold text-[#9F1239]" role="alert">
          Sessão expirada ou inválida.
        </div>
      )}
      {pageStatus === "FORBIDDEN" && (
        <div className="rounded-2xl border border-[#F3C1CE] bg-[#FDF0F3] px-4 py-2.5 text-[12px] font-semibold text-[#9F1239]" role="alert">
          Acesso não autorizado para esta área.
        </div>
      )}
      {pageStatus === "PARTIAL" && (
        <div className="rounded-2xl border border-[#F9D8AE] bg-[#FFF7ED] px-4 py-2.5 text-[12px] font-semibold text-[#9A5B12]" role="note">
          Alguns dados não puderam ser carregados agora. As demais informações continuam disponíveis.
        </div>
      )}
      {pageStatus === "ERROR" && (
        <div className="rounded-2xl border border-[#F3C1CE] bg-[#FDF0F3] px-4 py-2.5 text-[12px] font-semibold text-[#9F1239]" role="alert">
          Não foi possível carregar os dados de ambientes agora.
        </div>
      )}

      {/* Cards de ambiente */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EnvCard ambiente="homologacao" envData={envHomologacao} envState={environmentsState} deployState={deploymentsState} healthState={healthState} />
        <EnvCard ambiente="producao" envData={envProducao} envState={environmentsState} deployState={deploymentsState} healthState={healthState} />
      </div>

      {/* Comparação de versões */}
      <Secao icone={<GitCommit className="h-4 w-4" aria-hidden="true" />} titulo="Comparação de versões" descricao="Commit publicado em cada ambiente.">
        {compareState.status !== "success" ? (
          <EstadoResourceInline resourceState={compareState} rotulo="comparação" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Homologação</p>
              <p className="mt-1 font-mono text-sm font-bold text-[#111111]">{envHomologacao?.commit?.shortSha || "—"}</p>
            </div>
            <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Produção</p>
              <p className="mt-1 font-mono text-sm font-bold text-[#111111]">{envProducao?.commit?.shortSha || "—"}</p>
            </div>
            <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Estado</p>
              <div className="mt-1">
                <StatusPill tom={comparacao.tom}><PillIcone tom={comparacao.tom} />{comparacao.label}</StatusPill>
              </div>
              <p className="mt-1.5 text-[11px] text-[#6B7280]">
                ahead {compareState.data?.ahead ?? "—"} · behind {compareState.data?.behind ?? "—"}
              </p>
            </div>
          </div>
        )}
      </Secao>

      {/* Pipeline (conceitual — sem status dinâmico inventado) */}
      <Secao icone={<GitBranch className="h-4 w-4" aria-hidden="true" />} titulo="Pipeline de release" descricao="Etapas conceituais até a promoção para Produção.">
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          {PIPELINE_CONCEITUAL.map((etapa, i) => (
            <PipelineEtapa key={etapa.id} etapa={etapa} ultima={i === PIPELINE_CONCEITUAL.length - 1} />
          ))}
        </div>
      </Secao>

      {/* Alterações pendentes (compare.commits) */}
      <Secao icone={<History className="h-4 w-4" aria-hidden="true" />} titulo="Alterações aguardando Produção">
        {compareState.status !== "success" ? (
          <EstadoResourceInline resourceState={compareState} rotulo="alterações pendentes" />
        ) : (compareState.data?.commits || []).length === 0 ? (
          <EmptyStateClaro
            icone={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
            titulo="Nenhuma alteração aguardando promoção."
            dica="Não há commits pendentes identificados entre Homologação e Produção."
          />
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {compareState.data.commits.map((c) => (
              <li key={c.sha} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-bold text-[#111111]">{c.shortSha}</span>
                  <span className="text-[11px] text-[#6B7280]">{formatarData(c.committedAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-[#111111]">{c.message || "—"}</p>
                {c.author && <p className="text-[11px] text-[#6B7280]">{c.author}</p>}
              </li>
            ))}
            {compareState.data.truncated && <li className="pt-2 text-[11px] text-[#6B7280]">Lista truncada — mostrando os primeiros itens.</li>}
          </ul>
        )}
      </Secao>

      {/* Banco de Dados — sem resource dedicado nesta integração */}
      <Secao icone={<Database className="h-4 w-4" aria-hidden="true" />} titulo="Banco de Dados">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Migrations detectadas</p>
            <p className="mt-1 text-lg font-black text-[#111111]">—</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">Não verificado nesta integração.</p>
          </div>
          <div className="rounded-xl border border-[#F9D8AE] bg-[#FFF7ED] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#9A5B12]">Estado real de aplicação</p>
            <p className="mt-1 text-sm font-bold text-[#9A5B12]">Não consultado nesta fase.</p>
          </div>
        </div>
      </Secao>

      {/* Health */}
      <Secao icone={<Activity className="h-4 w-4" aria-hidden="true" />} titulo="Health dos serviços">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HealthCard nomeAmbiente="Homologação" ambienteHealth={healthHomologacao} healthState={healthState} />
          <HealthCard nomeAmbiente="Produção" ambienteHealth={healthProducao} healthState={healthState} />
        </div>
      </Secao>

      {/* Deployments (Vercel) */}
      <Secao icone={<Radio className="h-4 w-4" aria-hidden="true" />} titulo="Histórico de deploys">
        {deploymentsState.status !== "success" ? (
          <EstadoResourceInline resourceState={deploymentsState} rotulo="deployments" />
        ) : deploymentsState.data?.source === "not_configured" ? (
          <EmptyStateClaro titulo="Integração Vercel não configurada." dica="Nenhum deploy disponível nesta integração." />
        ) : (deploymentsState.data?.items || []).length === 0 ? (
          <EmptyStateClaro titulo="Nenhum deploy registrado." dica="Ainda não há deployments retornados pela Vercel." />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-[#D1D5DB] md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                  <tr>
                    <th className="px-3 py-2.5">Ambiente</th>
                    <th className="px-3 py-2.5">Commit</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Duração</th>
                    <th className="px-3 py-2.5">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {deploymentsState.data.items.map((d) => (
                    <tr key={d.id} className="border-t border-[#F3F4F6]">
                      <td className="px-3 py-2.5 font-bold text-[#111111]">{d.environment === "producao" ? "PROD" : "HML"}</td>
                      <td className="px-3 py-2.5 font-mono text-[13px] text-[#111111]">{d.commitSha ? d.commitSha.slice(0, 7) : "—"}</td>
                      <td className="px-3 py-2.5">
                        <StatusPill tom={DEPLOY_TOM[d.status] || "neutro"}><PillIcone tom={DEPLOY_TOM[d.status] || "neutro"} />{d.status || "UNKNOWN"}</StatusPill>
                      </td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{formatarDuracao(d.durationMs)}</td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{formatarData(d.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {deploymentsState.data.items.map((d) => (
                <div key={d.id} className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-[#111111]">{d.environment === "producao" ? "PROD" : "HML"}</p>
                    <StatusPill tom={DEPLOY_TOM[d.status] || "neutro"}><PillIcone tom={DEPLOY_TOM[d.status] || "neutro"} />{d.status || "UNKNOWN"}</StatusPill>
                  </div>
                  <p className="mt-1 font-mono text-[13px] text-[#111111]">{d.commitSha ? d.commitSha.slice(0, 7) : "—"}</p>
                  <p className="mt-0.5 text-[12px] text-[#6B7280]">{formatarData(d.createdAt)}</p>
                </div>
              ))}
            </div>
            {deploymentsState.data.source === "partial" && (
              <p className="mt-2 text-[11px] text-[#9A5B12]">Alguns ambientes não retornaram deployments agora.</p>
            )}
          </>
        )}
      </Secao>

      {/* Histórico (Central de Releases) */}
      <Secao icone={<History className="h-4 w-4" aria-hidden="true" />} titulo="Histórico de releases">
        {historyState.status !== "success" ? (
          <EstadoResourceInline resourceState={historyState} rotulo="histórico" />
        ) : historyState.data?.source === "not_connected" ? (
          <EmptyStateClaro titulo="Histórico ainda não conectado." dica="Esta fonte de histórico ainda não está integrada." />
        ) : (historyState.data?.items || []).length === 0 ? (
          <EmptyStateClaro titulo="Nenhum registro de histórico encontrado." />
        ) : (
          <ul className="divide-y divide-[#F3F4F6]">
            {historyState.data.items.map((item, i) => (
              <li key={item.id ?? i} className="py-2 text-sm text-[#111111]">{JSON.stringify(item)}</li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Checklist de promoção */}
      <Secao icone={<ListChecks className="h-4 w-4" aria-hidden="true" />} titulo="Checklist para Produção" descricao="Itens sem evidência direta aparecem como Não verificado.">
        <ul>
          {checklist.map((item) => <ChecklistLinha key={item.id} item={item} />)}
        </ul>
      </Secao>

      {/* Ação futura */}
      <Secao icone={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} titulo="Promoção para Produção">
        <div className="flex flex-col items-start gap-2">
          <PrimeButton variante="blue" disabled>
            <Rocket className="h-4 w-4" aria-hidden="true" />
            Promover para Produção
          </PrimeButton>
          <p className="text-[12px] text-[#6B7280]">Automação de deploy ainda não habilitada.</p>
        </div>
      </Secao>
    </div>
  );
}
