import { useEffect, useState } from "react";
import {
  RefreshCw, GitBranch, GitCommit, CheckCircle2, Circle, Clock,
  AlertTriangle, Database, Activity, ShieldCheck, Radio, Rocket,
  ListChecks, History, ArrowRight, ArrowDown, ExternalLink, ServerCog,
} from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";

// ════════════════════════════════════════════════════════════
//  Ambientes & Releases — MVP visual (Microgate 05)
//  Dados 100% mockados/estáticos. Sem integração GitHub/Vercel/Supabase.
//  Modelo pensado para, no futuro, ser alimentado por uma API real sem
//  mudar a estrutura visual (loading/success/partial/degraded/error).
// ════════════════════════════════════════════════════════════

const AMBIENTES_MOCK = {
  homologacao: {
    nome: "Homologação",
    url: "homologacao.pedidoprime.com.br",
    branch: "homologacao",
    commit: "4c87dd6",
    status: "Online",
    deploy: "Ready",
    supabase: "Online",
  },
  producao: {
    nome: "Produção",
    url: "pedidoprime.com.br",
    branch: "main",
    commit: "4c87dd6",
    status: "Online",
    deploy: "Ready",
    supabase: "Online",
  },
};

// Modelo preparado para os estados futuros de comparação de versão —
// nesta fase apenas SYNCED é utilizado (dados mockados sincronizados).
const ESTADOS_COMPARACAO = {
  SYNCED: { label: "Sincronizados", tom: "ok" },
  HML_AHEAD: { label: "Homologação à frente", tom: "alerta" },
  PROD_AHEAD: { label: "Produção à frente", tom: "alerta" },
  DIVERGED: { label: "Divergentes", tom: "erro" },
  UNKNOWN: { label: "Desconhecido", tom: "neutro" },
};

const COMPARACAO_MOCK = {
  homologacao: "4c87dd6",
  producao: "4c87dd6",
  estado: "SYNCED",
  ahead: 0,
  behind: 0,
};

const PIPELINE_MOCK = [
  { id: "dev", label: "Desenvolvimento", detalhe: "Concluído", tom: "ok" },
  { id: "hml", label: "Homologação", detalhe: "Concluído", tom: "ok" },
  { id: "testes", label: "Testes", detalhe: "Aprovados", tom: "ok" },
  { id: "aprovacao", label: "Aprovação", detalhe: "Aguardando", tom: "alerta" },
  { id: "agendamento", label: "Agendamento", detalhe: "Não agendado", tom: "neutro" },
  { id: "producao", label: "Produção", detalhe: "Versão atual", tom: "azul" },
];

const HEALTH_ITENS = ["Frontend", "API", "Supabase", "Auth", "Realtime"];

const HISTORICO_MOCK = [
  { ambiente: "HML", commit: "4c87dd6", status: "Success", data: "Demonstração" },
  { ambiente: "PROD", commit: "4c87dd6", status: "Success", data: "Demonstração" },
];

const CHECKLIST_MOCK = [
  { label: "Branch homologacao atualizada", ok: true },
  { label: "Working tree limpa", ok: true },
  { label: "Testes automatizados", ok: true },
  { label: "Build", ok: true },
  { label: "Homologação online", ok: true },
  { label: "Smoke HML", ok: true },
  { label: "Banco HML validado", ok: true },
  { label: "Alterações revisadas", ok: true },
  { label: "Backup PROD", ok: true },
  { label: "Migrations revisadas", ok: true },
  { label: "Aprovação humana", ok: false },
  { label: "Janela de deploy", ok: false },
];

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

function EnvCard({ ambiente, dados }) {
  const ehProd = ambiente === "producao";
  return (
    <article
      className="flex flex-col gap-3 rounded-2xl border border-[#D1D5DB] bg-white p-4 sm:p-5"
      aria-label={`Ambiente ${dados.nome}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ehProd ? "bg-[#012E46] text-white" : "bg-[#F38525]/10 text-[#F38525]"}`}
            aria-hidden="true"
          >
            <ServerCog className="h-[18px] w-[18px]" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              {ehProd ? "Produção" : "Homologação"}
            </p>
            <p className="flex items-center gap-1 text-sm font-bold text-[#111111]">
              {dados.url}
              <ExternalLink className="h-3 w-3 text-[#6B7280]" aria-hidden="true" />
            </p>
          </div>
        </div>
        <StatusPill tom="ok"><PillIcone tom="ok" />{dados.status}</StatusPill>
      </div>
      <dl>
        <LinhaDado rotulo="Branch" valor={dados.branch} mono />
        <LinhaDado rotulo="Commit" valor={dados.commit} mono />
        <LinhaDado rotulo="Deploy" valor={dados.deploy} />
        <LinhaDado rotulo="Supabase" valor={dados.supabase} />
      </dl>
    </article>
  );
}

function PipelineEtapa({ etapa, ultima }) {
  return (
    <div className="flex items-center lg:flex-1">
      <div className="flex flex-1 flex-col items-center gap-2 rounded-2xl border border-[#D1D5DB] bg-white px-3 py-4 text-center">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            etapa.tom === "ok" ? "bg-[#F0FDF4] text-[#166534]"
              : etapa.tom === "azul" ? "bg-[#012E46] text-white"
              : etapa.tom === "alerta" ? "bg-[#FFF7ED] text-[#9A5B12]"
              : "bg-[#F9FAFB] text-[#6B7280]"
          }`}
          aria-hidden="true"
        >
          <PillIcone tom={etapa.tom} />
        </span>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[#111111]">{etapa.label}</p>
        <p className="text-[11px] text-[#6B7280]">{etapa.detalhe}</p>
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

function HealthCard({ nomeAmbiente }) {
  return (
    <div className="rounded-2xl border border-[#D1D5DB] bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">{nomeAmbiente}</p>
        <StatusPill tom="neutro">Simulado</StatusPill>
      </div>
      <ul className="space-y-2">
        {HEALTH_ITENS.map((item) => (
          <li key={item} className="flex items-center justify-between text-sm">
            <span className="text-[#111111]">{item}</span>
            <StatusPill tom="ok"><PillIcone tom="ok" />Online</StatusPill>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Estado vazio para superfície clara (fundo branco), local a esta página.
// Não reutiliza <EmptyState> de Prime.jsx: aquele componente é desenhado
// para superfícies escuras (text-slate-300/500, border-white/10) e perde
// contraste sobre bg-white.
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
  return (
    <li className="flex items-center gap-2.5 border-b border-[#F3F4F6] py-2 text-sm last:border-0">
      {item.ok
        ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#166534]" aria-hidden="true" />
        : <Circle className="h-4 w-4 shrink-0 text-[#6B7280]" aria-hidden="true" />}
      <span className={item.ok ? "text-[#111111]" : "text-[#6B7280]"}>{item.label}</span>
      <span className="ml-auto shrink-0 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
        {item.ok ? "Concluído" : "Pendente"}
      </span>
    </li>
  );
}

export default function AmbientesAdmin() {
  const [atualizadoEm, setAtualizadoEm] = useState(() => Date.now());
  const [agora, setAgora] = useState(() => Date.now());

  // Apenas indicação visual — nenhum fetch/polling real nesta fase.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const segundos = Math.max(0, Math.round((agora - atualizadoEm) / 1000));
  const textoAtualizacao = segundos < 5
    ? "Atualizado há poucos segundos"
    : segundos < 60
      ? `Atualizado há ${segundos}s`
      : `Atualizado há ${Math.round(segundos / 60)} min`;

  const comparacao = ESTADOS_COMPARACAO[COMPARACAO_MOCK.estado] || ESTADOS_COMPARACAO.UNKNOWN;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={<Rocket className="h-5 w-5" aria-hidden="true" />}
        titulo="Ambientes & Releases"
        descricao="Acompanhe versões, alterações, validações e promoções entre Homologação e Produção."
        indicadores={[
          { rotulo: textoAtualizacao, valor: "●", tom: "ok" },
          { rotulo: "Auto-refresh: 30s", valor: "⟳", tom: "neutro" },
        ]}
        acao={(
          <PrimeButton variante="ghost" onClick={() => setAtualizadoEm(Date.now())}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar agora
          </PrimeButton>
        )}
      />

      <div className="rounded-2xl border border-[#AFC2CC] bg-[#F7F9FA] px-4 py-2.5 text-[12px] font-semibold text-[#012E46]" role="note">
        Dados simulados — esta tela ainda não está conectada a GitHub, Vercel ou Supabase reais.
      </div>

      {/* Cards de ambiente */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EnvCard ambiente="homologacao" dados={AMBIENTES_MOCK.homologacao} />
        <EnvCard ambiente="producao" dados={AMBIENTES_MOCK.producao} />
      </div>

      {/* Comparação de versões */}
      <Secao icone={<GitCommit className="h-4 w-4" aria-hidden="true" />} titulo="Comparação de versões" descricao="Commit publicado em cada ambiente.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Homologação</p>
            <p className="mt-1 font-mono text-sm font-bold text-[#111111]">{COMPARACAO_MOCK.homologacao}</p>
          </div>
          <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Produção</p>
            <p className="mt-1 font-mono text-sm font-bold text-[#111111]">{COMPARACAO_MOCK.producao}</p>
          </div>
          <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Estado</p>
            <div className="mt-1">
              <StatusPill tom={comparacao.tom}><PillIcone tom={comparacao.tom} />{comparacao.label}</StatusPill>
            </div>
            <p className="mt-1.5 text-[11px] text-[#6B7280]">ahead {COMPARACAO_MOCK.ahead} · behind {COMPARACAO_MOCK.behind}</p>
          </div>
        </div>
      </Secao>

      {/* Pipeline */}
      <Secao icone={<GitBranch className="h-4 w-4" aria-hidden="true" />} titulo="Pipeline de release" descricao="Etapas até a promoção para Produção.">
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          {PIPELINE_MOCK.map((etapa, i) => (
            <PipelineEtapa key={etapa.id} etapa={etapa} ultima={i === PIPELINE_MOCK.length - 1} />
          ))}
        </div>
      </Secao>

      {/* Alterações pendentes */}
      <Secao icone={<History className="h-4 w-4" aria-hidden="true" />} titulo="Alterações aguardando Produção">
        <EmptyStateClaro
          icone={<CheckCircle2 className="h-6 w-6" aria-hidden="true" />}
          titulo="Nenhuma alteração aguardando promoção."
          dica="Homologação e Produção estão sincronizadas no release simulado atual."
        />
      </Secao>

      {/* Banco de dados */}
      <Secao icone={<Database className="h-4 w-4" aria-hidden="true" />} titulo="Banco de Dados">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Migrations detectadas</p>
            <p className="mt-1 text-lg font-black text-[#111111]">0</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">Nenhuma migration pendente identificada no release simulado.</p>
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
          <HealthCard nomeAmbiente="Homologação" />
          <HealthCard nomeAmbiente="Produção" />
        </div>
      </Secao>

      {/* Histórico de deploys */}
      <Secao icone={<Radio className="h-4 w-4" aria-hidden="true" />} titulo="Histórico de deploys">
        <div className="hidden overflow-x-auto rounded-xl border border-[#D1D5DB] md:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-3 py-2.5">Ambiente</th>
                <th className="px-3 py-2.5">Commit</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Quando</th>
              </tr>
            </thead>
            <tbody>
              {HISTORICO_MOCK.map((h, i) => (
                <tr key={i} className="border-t border-[#F3F4F6]">
                  <td className="px-3 py-2.5 font-bold text-[#111111]">{h.ambiente}</td>
                  <td className="px-3 py-2.5 font-mono text-[13px] text-[#111111]">{h.commit}</td>
                  <td className="px-3 py-2.5"><StatusPill tom="ok"><PillIcone tom="ok" />{h.status}</StatusPill></td>
                  <td className="px-3 py-2.5 text-[#6B7280]">{h.data}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 gap-3 md:hidden">
          {HISTORICO_MOCK.map((h, i) => (
            <div key={i} className="rounded-xl border border-[#D1D5DB] bg-[#F9FAFB] p-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-[#111111]">{h.ambiente}</p>
                <StatusPill tom="ok"><PillIcone tom="ok" />{h.status}</StatusPill>
              </div>
              <p className="mt-1 font-mono text-[13px] text-[#111111]">{h.commit}</p>
              <p className="mt-0.5 text-[12px] text-[#6B7280]">{h.data}</p>
            </div>
          ))}
        </div>
      </Secao>

      {/* Checklist de promoção */}
      <Secao icone={<ListChecks className="h-4 w-4" aria-hidden="true" />} titulo="Checklist para Produção" descricao="Checklist demonstrativo — ainda não conectado ao pipeline real.">
        <ul>
          {CHECKLIST_MOCK.map((item) => <ChecklistLinha key={item.label} item={item} />)}
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
