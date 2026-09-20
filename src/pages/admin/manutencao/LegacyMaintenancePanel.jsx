import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  RefreshCw, AlertTriangle, CheckCircle2, Circle, Clock, ShieldCheck,
  GitCommit, Timer, Megaphone, PlayCircle, Lock,
} from "lucide-react";
import { PrimeButton } from "../../../components/Prime";
import { supabase } from "../../../lib/supabase.js";
import {
  LEGACY_MAINTENANCE_CAPABILITIES,
  LEGACY_MAINTENANCE_LOCK_NOTICE,
  resolveLegacyMaintenanceCapabilities,
} from "./legacyMaintenanceCapabilities.js";

// ════════════════════════════════════════════════════════════
//  Manutenção — controle atual (B15-A2)
//  Painel LEGADO da tela Manutenção, preservado sem mudança de comportamento
//  na PDB-I3-FE2 (só o cabeçalho de página subiu para o shell
//  MaintenanceAdmin.jsx; aqui ficou uma barra de status + "Atualizar").
//  Só monta — e só consulta a rede — quando a aba "Controle atual" é aberta.
//  Consome /api/maintenance?scope=admin (leitura administrativa) e
//  /api/maintenance (POST action:"start"|"notice") com o Bearer da sessão
//  Supabase já existente. A release ativa é descoberta reutilizando
//  POST /api/releases action:"status" (mesmo mecanismo de
//  AmbientesAdmin.jsx) — esta tela nunca deixa o operador digitar
//  release_id/target_sha manualmente. Refresh é manual + pós-action
//  (sem WebSocket/realtime, sem polling automático nesta tela).
//
//  PDB-I3-HML-PREVIEW-A2: as mutations (START e NOTICE) só executam com a
//  capability `canMutateLegacyMaintenance === true` (legacyMaintenanceCapabilities.js,
//  fonte única, padrão false durante a prévia). Com ela false os botões ficam
//  desabilitados E os executores retornam antes de qualquer estado/rede — o código
//  de mutation segue intacto. Leitura (Atualizar, estado, fases) não é afetada.
// ════════════════════════════════════════════════════════════

const PHASES = [
  "NORMAL", "NOTICE", "FENCING", "DRAINING", "QUIESCENT", "RELEASING",
  "SMOKE", "RECOVERING", "ABORTING", "FAILED", "CANCELED",
];

const PHASE_LABEL = {
  NORMAL: "Normal",
  NOTICE: "Aviso",
  FENCING: "Bloqueio",
  DRAINING: "Drenagem",
  QUIESCENT: "Quiescente",
  RELEASING: "Publicando",
  SMOKE: "Smoke test",
  RECOVERING: "Recuperando",
  ABORTING: "Abortando",
  FAILED: "Falhou",
  CANCELED: "Cancelado",
};

const PHASE_TOM = {
  NORMAL: "ok",
  NOTICE: "alerta",
  FENCING: "alerta",
  DRAINING: "alerta",
  QUIESCENT: "alerta",
  RELEASING: "azul",
  SMOKE: "azul",
  RECOVERING: "alerta",
  ABORTING: "erro",
  FAILED: "erro",
  CANCELED: "neutro",
};

// Apenas os errorCodes reais devolvidos por /api/maintenance (B15-A2 §10).
const ERROR_LABEL = {
  STATE_CONFLICT: "O estado da manutenção mudou desde a última leitura. Atualize e tente novamente.",
  VERSION_CONFLICT: "Os dados exibidos estão desatualizados. Atualize e tente novamente.",
  NOT_FOUND: "Release não encontrada.",
  TARGET_MISMATCH: "O commit da release não confere mais com o que foi validado. Atualize e tente novamente.",
  ACTIVE_RELEASE_CONFLICT: "Já existe uma release vinculada ao ciclo de manutenção atual.",
  RELEASE_ID_INVALIDO: "Selecione uma release válida.",
  EXPECTED_VERSION_INVALIDO: "Dados desatualizados. Atualize a tela e tente novamente.",
  MESSAGE_PUBLIC_OBRIGATORIO: "Escreva a mensagem pública do aviso.",
  SCHEDULED_FOR_INVALIDO: "Data/hora agendada inválida.",
};

function estadoInicialResource() {
  return { status: "idle", data: null, httpStatus: null, errorCode: null };
}

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function formatarSha(sha) {
  return sha ? sha.slice(0, 7) : "—";
}

// Mensagem segura por resource (nunca expõe body bruto/stack/token).
function mensagemErroResource(resourceState) {
  if (resourceState.httpStatus === 401) return "Sessão expirada ou inválida.";
  if (resourceState.httpStatus === 403) return "Acesso não autorizado para esta área.";
  if (resourceState.httpStatus === 503) return "Indisponibilidade temporária do Maintenance Write Fence.";
  if (typeof resourceState.httpStatus === "number" && resourceState.httpStatus >= 500) return "Erro no servidor.";
  return "Não foi possível carregar estes dados.";
}

function mensagemErroAcao(errorCode, httpStatus) {
  if (httpStatus === 401) return "Sessão expirada ou inválida.";
  if (httpStatus === 403) return "Acesso não autorizado para esta ação.";
  if (errorCode && ERROR_LABEL[errorCode]) return ERROR_LABEL[errorCode];
  if (httpStatus === 400) return "Dados inválidos.";
  return "Não foi possível concluir a ação agora.";
}

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
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[rgba(1,46,70,0.30)] bg-[rgba(1,46,70,0.10)] text-[#012E46]" aria-hidden="true">
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
    <div className="flex items-start justify-between gap-3 border-b border-[#F3F4F6] py-2 text-sm last:border-0">
      <dt className="shrink-0 text-[#6B7280]">{rotulo}</dt>
      <dd className={`min-w-0 break-words text-right font-semibold text-[#111111] ${mono ? "font-mono text-[13px]" : ""}`}>{valor}</dd>
    </div>
  );
}

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

// Countdown puramente client-side, derivado de scheduledFor + relógio
// local — nenhum RPC/ticker, nenhum NOTICE_TICK. Cleanup obrigatório.
function useAgoraTicking(ativo) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return undefined;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [ativo]);
  return agora;
}

function formatarContagem(diffMs) {
  const atrasado = diffMs < 0;
  const abs = Math.abs(diffMs);
  const totalSeg = Math.floor(abs / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  const partes = [];
  if (h > 0) partes.push(`${h}h`);
  if (h > 0 || m > 0) partes.push(`${m}min`);
  partes.push(`${s}s`);
  return atrasado ? `Atrasado há ${partes.join(" ")}` : `Faltam ${partes.join(" ")}`;
}

function CountdownAviso({ scheduledFor }) {
  const agora = useAgoraTicking(Boolean(scheduledFor));
  if (!scheduledFor) return null;
  const alvo = new Date(scheduledFor).getTime();
  if (Number.isNaN(alvo)) return null;
  const diffMs = alvo - agora;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#AFC2CC] bg-[#F0F6F8] px-3 py-2.5">
      <Timer className="h-4 w-4 shrink-0 text-[#012E46]" aria-hidden="true" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Agendado para {formatarData(scheduledFor)}</p>
        <p className="text-sm font-bold text-[#012E46]">{formatarContagem(diffMs)}</p>
      </div>
    </div>
  );
}

function PhaseChip({ phase, atual }) {
  const tom = atual ? PHASE_TOM[phase] : "neutro";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${atual ? "" : "opacity-60"} ${
        {
          ok: "border-[#B8DFC4] bg-[#F0FDF4] text-[#166534]",
          alerta: "border-[#F9D8AE] bg-[#FFF7ED] text-[#9A5B12]",
          erro: "border-[#F3C1CE] bg-[#FDF0F3] text-[#9F1239]",
          azul: "border-[#AFC2CC] bg-[#F0F6F8] text-[#012E46]",
          neutro: "border-[#D1D5DB] bg-[#F9FAFB] text-[#6B7280]",
        }[tom]
      }`}
    >
      {atual && <PillIcone tom={tom} />}
      {PHASE_LABEL[phase] || phase}
    </span>
  );
}

export default function LegacyMaintenancePanel({ capabilities = LEGACY_MAINTENANCE_CAPABILITIES }) {
  // Fonte única do bloqueio de escrita (fail-closed): só `=== true` libera.
  const { canMutateLegacyMaintenance: podeMutar } = resolveLegacyMaintenanceCapabilities(capabilities);
  const avisoBloqueioId = useId();
  const [sessaoStatus, setSessaoStatus] = useState("checking"); // checking | ok | indisponivel
  const [adminState, setAdminState] = useState(() => estadoInicialResource());
  const [releaseState, setReleaseState] = useState(() => estadoInicialResource());
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

  async function obterToken() {
    try {
      const { data } = await supabase.auth.getSession();
      return data?.session?.access_token || null;
    } catch {
      return null;
    }
  }

  const carregar = useCallback(async () => {
    if (carregandoRef.current) return; // bloqueia refresh concorrente
    carregandoRef.current = true;
    setRefreshing(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = await obterToken();

      if (!token) {
        if (!montadoRef.current) return;
        setSessaoStatus("indisponivel");
        setAdminState(estadoInicialResource());
        setReleaseState(estadoInicialResource());
        return;
      }

      if (!montadoRef.current) return;
      setSessaoStatus("ok");
      setAdminState((s) => ({ ...s, status: "loading" }));
      setReleaseState((s) => ({ ...s, status: "loading" }));

      const [adminResult, releaseResult] = await Promise.allSettled([
        fetch("/api/maintenance?scope=admin", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        }),
        fetch("/api/releases", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status" }),
          signal: controller.signal,
          cache: "no-store",
        }),
      ]);

      if (!montadoRef.current || controller.signal.aborted) return;

      if (adminResult.status === "fulfilled") {
        const response = adminResult.value;
        let body = null;
        try { body = await response.json(); } catch { /* corpo não-JSON */ }
        if (response.ok) {
          setAdminState({ status: "success", data: body?.state ?? null, httpStatus: response.status, errorCode: null });
        } else {
          setAdminState({ status: "error", data: null, httpStatus: response.status, errorCode: body?.error || null });
        }
      } else if (adminResult.reason?.name !== "AbortError") {
        setAdminState({ status: "error", data: null, httpStatus: null, errorCode: "network_error" });
      }

      if (releaseResult.status === "fulfilled") {
        const response = releaseResult.value;
        let body = null;
        try { body = await response.json(); } catch { /* corpo não-JSON */ }
        if (response.ok) {
          setReleaseState({ status: "success", data: body?.activeRelease ?? null, httpStatus: response.status, errorCode: null });
        } else {
          setReleaseState({ status: "error", data: null, httpStatus: response.status, errorCode: body?.error || null });
        }
      } else if (releaseResult.reason?.name !== "AbortError") {
        setReleaseState({ status: "error", data: null, httpStatus: null, errorCode: "network_error" });
      }

      setAtualizadoEm(Date.now());
    } finally {
      carregandoRef.current = false;
      if (montadoRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Ação START ──────────────────────────────────────────────
  const [startAberto, setStartAberto] = useState(false);
  const [startReason, setStartReason] = useState("");
  const [startState, setStartState] = useState({ status: "idle", errorCode: null, httpStatus: null });

  async function executarStart(releaseId) {
    if (!podeMutar) return; // guarda contra "handler escape": sem estado, sem token, sem rede
    setStartState({ status: "submitting", errorCode: null, httpStatus: null });
    const token = await obterToken();
    if (!token) {
      setStartState({ status: "error", errorCode: null, httpStatus: 401 });
      return;
    }
    try {
      const response = await fetch("/api/maintenance", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", releaseId, reason: startReason || undefined }),
        cache: "no-store",
      });
      let body = null;
      try { body = await response.json(); } catch { /* corpo não-JSON */ }
      if (!response.ok) {
        const errorCode = body?.error || null;
        setStartState({ status: "error", errorCode, httpStatus: response.status });
        // STATE_CONFLICT/ACTIVE_RELEASE_CONFLICT: refetch para refletir o estado
        // real — nunca reenvia a ação automaticamente.
        if (errorCode === "STATE_CONFLICT" || errorCode === "ACTIVE_RELEASE_CONFLICT") await carregar();
        return;
      }
      setStartState({ status: "idle", errorCode: null, httpStatus: null });
      setStartAberto(false);
      setStartReason("");
      await carregar();
    } catch {
      setStartState({ status: "error", errorCode: "network_error", httpStatus: null });
    }
  }

  // ── Ação NOTICE ──────────────────────────────────────────────
  const [noticeAberto, setNoticeAberto] = useState(false);
  const [noticeReason, setNoticeReason] = useState("");
  const [noticeMensagem, setNoticeMensagem] = useState("");
  const [noticeAgendamento, setNoticeAgendamento] = useState("");
  const [noticeConfirmacao, setNoticeConfirmacao] = useState("");
  const [noticeState, setNoticeState] = useState({ status: "idle", errorCode: null, httpStatus: null });

  async function executarNotice(expectedVersion) {
    if (!podeMutar) return; // guarda contra "handler escape": sem estado, sem token, sem rede
    setNoticeState({ status: "submitting", errorCode: null, httpStatus: null });
    const token = await obterToken();
    if (!token) {
      setNoticeState({ status: "error", errorCode: null, httpStatus: 401 });
      return;
    }
    try {
      const response = await fetch("/api/maintenance", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "notice",
          expectedVersion,
          reason: noticeReason || undefined,
          messagePublic: noticeMensagem,
          scheduledFor: noticeAgendamento ? new Date(noticeAgendamento).toISOString() : undefined,
        }),
        cache: "no-store",
      });
      let body = null;
      try { body = await response.json(); } catch { /* corpo não-JSON */ }
      if (!response.ok) {
        const errorCode = body?.error || null;
        setNoticeState({ status: "error", errorCode, httpStatus: response.status });
        // STATE_CONFLICT/VERSION_CONFLICT: refetch para refletir o estado
        // real — nunca reenvia a ação automaticamente.
        if (errorCode === "STATE_CONFLICT" || errorCode === "VERSION_CONFLICT") await carregar();
        return;
      }
      setNoticeState({ status: "idle", errorCode: null, httpStatus: null });
      setNoticeAberto(false);
      setNoticeReason("");
      setNoticeMensagem("");
      setNoticeAgendamento("");
      setNoticeConfirmacao("");
      await carregar();
    } catch {
      setNoticeState({ status: "error", errorCode: "network_error", httpStatus: null });
    }
  }

  const segundos = atualizadoEm == null ? null : Math.max(0, Math.round((agora - atualizadoEm) / 1000));
  const textoAtualizacao = segundos == null
    ? "Ainda não atualizado"
    : segundos < 5
      ? "Atualizado há poucos segundos"
      : segundos < 60
        ? `Atualizado há ${segundos}s`
        : `Atualizado há ${Math.round(segundos / 60)} min`;

  if (sessaoStatus === "indisponivel") {
    return (
      <div className="mx-auto max-w-5xl space-y-5 pb-8">
        <div className="rounded-2xl border border-[#F3C1CE] bg-[#FDF0F3] p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-[#9F1239]" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-[#9F1239]">Sessão indisponível.</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">Faça login novamente para acessar a Manutenção.</p>
        </div>
      </div>
    );
  }

  const state = adminState.status === "success" ? adminState.data : null;
  const activeRelease = releaseState.status === "success" ? releaseState.data : null;

  const phase = state?.phase || null;
  const bindingCompleto = Boolean(state?.releaseId && state?.targetSha);
  const podeStart = phase === "NORMAL" && !bindingCompleto;
  const podeNotice = phase === "NORMAL" && bindingCompleto;

  const pageStatus = adminState.status === "error" && (adminState.httpStatus === 401)
    ? "AUTH_ERROR"
    : adminState.status === "error" && adminState.httpStatus === 403
      ? "FORBIDDEN"
      : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D1D5DB] bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#012E46]">Controle ao vivo</p>
          <p className="text-[12px] leading-5 text-[#6B7280]">
            Orquestração do Maintenance Write Fence — início de ciclo e aviso público.{" "}
            {podeMutar ? "Esta aba consulta e pode alterar o estado real da manutenção." : "Nesta prévia a aba apenas consulta o estado real da manutenção."}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#6B7280]"><b className="font-bold text-[#111111]">●</b> {textoAtualizacao}</p>
        </div>
        <PrimeButton className="min-h-11" variante="ghost" onClick={carregar} disabled={refreshing} aria-busy={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          {refreshing ? "Atualizando…" : "Atualizar"}
        </PrimeButton>
      </div>

      {!podeMutar && (
        <p
          id={avisoBloqueioId}
          role="note"
          data-testid="legacy-lock-notice"
          className="flex items-start gap-2.5 rounded-xl border border-l-4 border-[#AFC2CC] border-l-[#F38525] bg-[#F0F6F8] px-3.5 py-2.5 text-[13px] leading-5 text-[#012E46]"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{LEGACY_MAINTENANCE_LOCK_NOTICE}</span>
        </p>
      )}

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

      {/* Estado atual */}
      <Secao icone={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} titulo="Estado atual" descricao="Singleton de manutenção (app_maintenance_state).">
        {adminState.status !== "success" ? (
          <EstadoResourceInline resourceState={adminState} rotulo="estado atual" />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <StatusPill tom={PHASE_TOM[state.phase] || "neutro"}>
                  <PillIcone tom={PHASE_TOM[state.phase] || "neutro"} />
                  {PHASE_LABEL[state.phase] || state.phase}
                </StatusPill>
              </div>
              <dl>
                <LinhaDado rotulo="Versão" valor={state.version} />
                <LinhaDado rotulo="Epoch" valor={state.epoch} />
                <LinhaDado rotulo="Release vinculada" valor={state.releaseId ? formatarSha(state.releaseId) : "—"} mono />
                <LinhaDado rotulo="Commit (target_sha)" valor={formatarSha(state.targetSha)} mono />
                {state.reason && <LinhaDado rotulo="Motivo" valor={state.reason} />}
                <LinhaDado rotulo="Atualizado em" valor={formatarData(state.updatedAt)} />
                {state.updatedByEmail && <LinhaDado rotulo="Atualizado por" valor={state.updatedByEmail} />}
              </dl>
            </div>
            <div>
              <dl>
                {state.messagePublic && <LinhaDado rotulo="Mensagem pública" valor={state.messagePublic} />}
                {state.noticeStartedAt && <LinhaDado rotulo="Aviso iniciado em" valor={formatarData(state.noticeStartedAt)} />}
                {state.scheduledFor && <LinhaDado rotulo="Agendado para" valor={formatarData(state.scheduledFor)} />}
                {state.fenceEffectiveAt && <LinhaDado rotulo="Fence efetivo em" valor={formatarData(state.fenceEffectiveAt)} />}
                {state.quiescentAt && <LinhaDado rotulo="Quiescente em" valor={formatarData(state.quiescentAt)} />}
                {state.releaseStartedAt && <LinhaDado rotulo="Publicação iniciada em" valor={formatarData(state.releaseStartedAt)} />}
                {state.completedAt && <LinhaDado rotulo="Concluído em" valor={formatarData(state.completedAt)} />}
                {state.abortedAt && <LinhaDado rotulo="Abortado em" valor={formatarData(state.abortedAt)} />}
                {state.resultCode && <LinhaDado rotulo="Resultado" valor={state.resultCode} />}
              </dl>
              {state.phase === "NOTICE" && state.scheduledFor && (
                <div className="mt-3">
                  <CountdownAviso scheduledFor={state.scheduledFor} />
                </div>
              )}
            </div>
          </div>
        )}
      </Secao>

      {/* Timeline (somente leitura) */}
      <Secao icone={<GitCommit className="h-4 w-4" aria-hidden="true" />} titulo="Fases do ciclo" descricao="Somente visualização — ações disponíveis apenas em NORMAL.">
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p) => <PhaseChip key={p} phase={p} atual={p === phase} />)}
        </div>
      </Secao>

      {/* START */}
      {podeStart && (
        <Secao icone={<PlayCircle className="h-4 w-4" aria-hidden="true" />} titulo="Iniciar orquestração" descricao="Vincula uma release ativa ao ciclo de manutenção.">
          {releaseState.status !== "success" ? (
            <EstadoResourceInline resourceState={releaseState} rotulo="release ativa" />
          ) : !activeRelease ? (
            <p className="text-sm text-[#6B7280]">Nenhuma release ativa encontrada em Ambientes &amp; Releases. Inicie/agende uma release antes de orquestrar a manutenção.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <dl className="rounded-xl border border-[rgba(1,46,70,0.16)] bg-white p-3 shadow-[0_1px_2px_rgba(1,46,70,0.05)]">
                <LinhaDado rotulo="Status da release" valor={activeRelease.status} />
                <LinhaDado rotulo="Commit (target)" valor={formatarSha(activeRelease.targetSha)} mono />
                <LinhaDado rotulo="Base" valor={formatarSha(activeRelease.baseSha)} mono />
                <LinhaDado rotulo="Solicitante" valor={activeRelease.requestedBy?.email || "—"} />
              </dl>

              {!startAberto ? (
                <PrimeButton
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => setStartAberto(true)}
                  disabled={!podeMutar}
                  aria-describedby={podeMutar ? undefined : avisoBloqueioId}
                >
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  Iniciar orquestração
                </PrimeButton>
              ) : (
                <div className="rounded-xl border border-[#D1D5DB] bg-white p-3">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Motivo (opcional)</label>
                  <input
                    type="text"
                    value={startReason}
                    onChange={(e) => setStartReason(e.target.value)}
                    maxLength={300}
                    className="mb-3 min-h-11 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-base text-[#111111]"
                    placeholder="Ex.: manutenção planejada da 22h"
                  />
                  <p className="mb-3 text-[12px] text-[#6B7280]">
                    Confirma o início da orquestração vinculando a release acima ({formatarSha(activeRelease.targetSha)})? Esta ação não pode ser desfeita pela tela.
                  </p>
                  {startState.status === "error" && (
                    <p className="mb-3 rounded-lg border border-[#F3C1CE] bg-[#FDF0F3] px-3 py-2 text-[12px] font-semibold text-[#9F1239]" role="alert">
                      {mensagemErroAcao(startState.errorCode, startState.httpStatus)}
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <PrimeButton
                      className="min-h-11 w-full sm:w-auto"
                      onClick={() => executarStart(activeRelease.releaseId)}
                      disabled={!podeMutar || startState.status === "submitting"}
                      aria-describedby={podeMutar ? undefined : avisoBloqueioId}
                      aria-busy={startState.status === "submitting"}
                    >
                      {startState.status === "submitting" ? "Iniciando…" : "Confirmar início"}
                    </PrimeButton>
                    <PrimeButton
                      className="min-h-11 w-full sm:w-auto"
                      variante="ghost"
                      onClick={() => { setStartAberto(false); setStartState({ status: "idle", errorCode: null, httpStatus: null }); }}
                      disabled={startState.status === "submitting"}
                    >
                      Cancelar
                    </PrimeButton>
                  </div>
                </div>
              )}
            </div>
          )}
        </Secao>
      )}

      {/* NOTICE */}
      {podeNotice && (
        <Secao icone={<Megaphone className="h-4 w-4" aria-hidden="true" />} titulo="Iniciar aviso de manutenção" descricao="Publica a mensagem no banner público e inicia a fase NOTICE.">
          {!noticeAberto ? (
            <PrimeButton
              className="min-h-11 w-full sm:w-auto"
              onClick={() => setNoticeAberto(true)}
              disabled={!podeMutar}
              aria-describedby={podeMutar ? undefined : avisoBloqueioId}
            >
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              Iniciar aviso de manutenção
            </PrimeButton>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-[#D1D5DB] bg-white p-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Mensagem pública *</label>
                <textarea
                  value={noticeMensagem}
                  onChange={(e) => setNoticeMensagem(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-base text-[#111111]"
                  placeholder="Ex.: O sistema entrará em manutenção às 22h e retornará em até 30 minutos."
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Agendado para (opcional)</label>
                <input
                  type="datetime-local"
                  value={noticeAgendamento}
                  onChange={(e) => setNoticeAgendamento(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-base text-[#111111]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Motivo (opcional)</label>
                <input
                  type="text"
                  value={noticeReason}
                  onChange={(e) => setNoticeReason(e.target.value)}
                  maxLength={300}
                  className="min-h-11 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 text-base text-[#111111]"
                  placeholder="Ex.: publicação da versão 2026.09"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">
                  Digite <span className="font-mono">NOTICE</span> para confirmar
                </label>
                <input
                  type="text"
                  value={noticeConfirmacao}
                  onChange={(e) => setNoticeConfirmacao(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-[#D1D5DB] px-3 py-2 font-mono text-base text-[#111111]"
                  placeholder="NOTICE"
                />
              </div>
              {noticeState.status === "error" && (
                <p className="rounded-lg border border-[#F3C1CE] bg-[#FDF0F3] px-3 py-2 text-[12px] font-semibold text-[#9F1239]" role="alert">
                  {mensagemErroAcao(noticeState.errorCode, noticeState.httpStatus)}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <PrimeButton
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => executarNotice(state?.version)}
                  disabled={!podeMutar || noticeState.status === "submitting" || noticeConfirmacao !== "NOTICE" || !noticeMensagem.trim()}
                  aria-describedby={podeMutar ? undefined : avisoBloqueioId}
                  aria-busy={noticeState.status === "submitting"}
                >
                  {noticeState.status === "submitting" ? "Enviando…" : "Confirmar aviso"}
                </PrimeButton>
                <PrimeButton
                  className="min-h-11 w-full sm:w-auto"
                  variante="ghost"
                  onClick={() => {
                    setNoticeAberto(false);
                    setNoticeState({ status: "idle", errorCode: null, httpStatus: null });
                  }}
                  disabled={noticeState.status === "submitting"}
                >
                  Cancelar
                </PrimeButton>
              </div>
            </div>
          )}
        </Secao>
      )}

      {phase && phase !== "NORMAL" && (
        <Secao icone={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} titulo="Somente visualização" descricao="Nenhuma ação disponível fora de NORMAL nesta versão.">
          <p className="text-sm text-[#6B7280]">
            O ciclo está em <strong className="text-[#111111]">{PHASE_LABEL[phase] || phase}</strong>. Ações de bloqueio, drenagem,
            publicação, smoke test, recuperação, abortar ou reabrir ainda não estão disponíveis nesta tela.
          </p>
        </Secao>
      )}
    </div>
  );
}
