import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Download, ExternalLink, Loader2, RefreshCw, Rocket, Users, XCircle } from "lucide-react";
import { PageHeader, PrimeButton } from "../../components/Prime";
import {
  buscarPreflight,
  buscarScriptMigration,
  buscarStatus,
  etapasDaRelease,
  INTERVALO_PREFLIGHT_MS,
  INTERVALO_STATUS_MS,
  podePublicar,
  promover,
  STATUS_FINAIS,
  textoErro,
} from "../../lib/atualizarProducao";

// ════════════════════════════════════════════════════════════
//  Atualizar Produção (/admin/atualizar-producao) — só super admin.
//  Publica na produção (main) exatamente a versão validada na homologação.
//  Só libera o botão quando: a versão está pronta, ninguém está usando a
//  produção e todos os scripts de banco foram rodados no PROD (manual).
//  O servidor repete as mesmas checagens antes de disparar.
// ════════════════════════════════════════════════════════════

const curto = (sha) => (sha ? String(sha).slice(0, 7) : "—");

function hora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
}

function Cartao({ titulo, icone = null, children, acao = null }) {
  return (
    <section className="rounded-2xl border border-[var(--pp-border)] bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--pp-text)]">{icone}{titulo}</h2>
        {acao}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const CAIXA = {
  ok: "border-[#5E8C31]/30 bg-[#5E8C31]/10 text-[#3F6420]",
  alerta: "border-[#F38525]/40 bg-[#F38525]/10 text-[#8A4A10]",
  erro: "border-[#C81E4A]/30 bg-[#C81E4A]/10 text-[#A0173B]",
};

function Caixa({ tipo, children }) {
  return <div className={`rounded-xl border p-3 text-sm ${CAIXA[tipo]}`}>{children}</div>;
}

function IconeEtapa({ estado }) {
  if (estado === "feito") return <CheckCircle2 className="h-5 w-5 text-[#5E8C31]" />;
  if (estado === "andando") return <Loader2 className="h-5 w-5 animate-spin text-[#F38525]" />;
  if (estado === "erro") return <XCircle className="h-5 w-5 text-[#C81E4A]" />;
  return <Circle className="h-5 w-5 text-[var(--pp-text-muted)]" />;
}

export default function AtualizarProducaoAdmin() {
  const [preflight, setPreflight] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [confirmadas, setConfirmadas] = useState(() => new Set());
  const [baixando, setBaixando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [release, setRelease] = useState(null);
  const releaseIdRef = useRef(null);

  const carregarPreflight = useCallback(async () => {
    const { httpStatus, body } = await buscarPreflight();
    if (httpStatus === 200 && body?.ok) {
      setPreflight(body);
      setErro(null);
    } else {
      setErro(textoErro(body, httpStatus));
    }
    setCarregando(false);
  }, []);

  const acompanhar = useCallback(async () => {
    const id = releaseIdRef.current;
    const { httpStatus, body } = await buscarStatus(id);
    if (httpStatus !== 200 || !body?.ok) return;
    const atual = id ? body.release : body.activeRelease;
    if (atual) {
      releaseIdRef.current = atual.releaseId;
      setRelease(atual);
      if (STATUS_FINAIS.has(atual.status)) carregarPreflight();
    }
  }, [carregarPreflight]);

  useEffect(() => {
    const t0 = setTimeout(() => { carregarPreflight(); acompanhar(); }, 0);
    const ivPre = setInterval(carregarPreflight, INTERVALO_PREFLIGHT_MS);
    const ivSt = setInterval(() => {
      if (releaseIdRef.current) acompanhar();
    }, INTERVALO_STATUS_MS);
    return () => { clearTimeout(t0); clearInterval(ivPre); clearInterval(ivSt); };
  }, [carregarPreflight, acompanhar]);

  const emAndamento = release && !STATUS_FINAIS.has(release.status);
  const { pode, motivos } = podePublicar({ preflight, confirmadas });
  const migrations = preflight?.migrations || [];
  const prod = preflight?.prodCheck;

  function alternar(file) {
    setConfirmadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(file)) novo.delete(file); else novo.add(file);
      return novo;
    });
  }

  async function baixar(file) {
    setBaixando(file);
    const { httpStatus, body } = await buscarScriptMigration(file, preflight?.targetSha);
    setBaixando(null);
    if (httpStatus !== 200 || !body?.ok) { setErro(textoErro(body, httpStatus)); return; }
    const blob = new Blob([body.sql], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function publicar() {
    if (!pode || enviando || emAndamento) return;
    const ok = window.confirm(
      `Atualizar a produção com a versão ${curto(preflight.targetSha)} da homologação?\n\n` +
      "O GitHub roda os testes, gera o build e publica. Leva alguns minutos."
    );
    if (!ok) return;
    setEnviando(true);
    setErro(null);
    const { httpStatus, body } = await promover({ targetSha: preflight.targetSha, migrationsConfirmed: [...confirmadas] });
    setEnviando(false);
    if (httpStatus === 202 && body?.ok) {
      releaseIdRef.current = body.releaseId;
      setRelease({ releaseId: body.releaseId, status: body.status, targetSha: body.targetSha, baseSha: body.baseSha, createdAt: new Date().toISOString() });
      acompanhar();
    } else {
      setErro(textoErro(body, httpStatus));
      carregarPreflight();
    }
  }

  const etapas = release ? etapasDaRelease(release.status) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        icone={<Rocket />}
        titulo="Atualizar Produção"
        descricao="Publica na produção a versão que já foi validada na homologação. Use pelo site de homologação."
        acao={(
          <PrimeButton variante="ghost" onClick={() => { carregarPreflight(); acompanhar(); }} disabled={enviando}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </PrimeButton>
        )}
      />

      {erro && <div role="alert"><Caixa tipo="erro">{erro}</Caixa></div>}

      {release && (
        <Cartao titulo="Andamento da atualização" icone={<Rocket className="h-4 w-4" />}>
          <ol className="space-y-2">
            {etapas.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm text-[var(--pp-text-body)]">
                <IconeEtapa estado={e.estado} /> {e.label}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-[var(--pp-text-muted)]">
            Versão {curto(release.targetSha)} · iniciada em {hora(release.createdAt)}
            {release.completedAt ? ` · terminou em ${hora(release.completedAt)}` : ""}
          </p>
          {release.status === "SUCCEEDED" && (
            <div className="mt-3"><Caixa tipo="ok">Produção atualizada. A Vercel publica o site em 1 ou 2 minutos.</Caixa></div>
          )}
          {["FAILED", "BLOCKED", "CANCELED"].includes(release.status) && (
            <div className="mt-3"><Caixa tipo="erro">A atualização não terminou ({release.resultCode || release.status}). A produção continua na versão anterior.</Caixa></div>
          )}
          {release.githubRunUrl && (
            <a href={release.githubRunUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#012E46] underline">
              Ver detalhes no GitHub <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </Cartao>
      )}

      <Cartao titulo="Versão" icone={<Rocket className="h-4 w-4" />}>
        {carregando ? <p className="text-sm text-[var(--pp-text-muted)]">Carregando…</p> : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p><span className="text-[var(--pp-text-muted)]">Homologação:</span> <b>{curto(preflight?.source?.sha)}</b></p>
              <p><span className="text-[var(--pp-text-muted)]">Produção:</span> <b>{curto(preflight?.destination?.sha)}</b></p>
              <p><span className="text-[var(--pp-text-muted)]">Novidades:</span> <b>{preflight?.compare?.ahead ?? "—"}</b> alteração(ões)</p>
            </div>
            {(preflight?.commits || []).length > 0 && (
              <ul className="mt-3 max-h-56 divide-y divide-[var(--pp-border)] overflow-auto text-sm">
                {preflight.commits.slice(0, 30).map((c) => (
                  <li key={c.sha} className="py-1.5">
                    <span className="font-mono text-xs text-[var(--pp-text-muted)]">{c.shortSha}</span> {c.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Cartao>

      <Cartao titulo="Usuários usando a produção" icone={<Users className="h-4 w-4" />}>
        {!prod ? <p className="text-sm text-[var(--pp-text-muted)]">Carregando…</p>
          : !prod.ok ? <Caixa tipo="erro">{textoErro({ error: prod.error || "PROD_CHECK_UNAVAILABLE" }, 503)}</Caixa>
          : prod.online > 0 ? <Caixa tipo="alerta">{prod.online} usuário(s) online agora. A atualização só libera quando todos saírem.</Caixa>
          : <Caixa tipo="ok">Ninguém usando a produção agora.</Caixa>}
        {prod?.ok && (
          <p className="mt-2 text-xs text-[var(--pp-text-muted)]">
            Conferido às {hora(prod.checkedAt)} · confere de novo a cada 20 s e na hora de publicar. O administrador geral não entra na conta.
          </p>
        )}
      </Cartao>

      <Cartao titulo="Scripts de banco (migrations)">
        {migrations.length === 0 ? (
          <p className="text-sm text-[var(--pp-text-muted)]">Esta atualização não tem script de banco.</p>
        ) : (
          <>
            <p className="text-sm text-[var(--pp-text-body)]">
              Baixe cada script, rode no SQL Editor do Supabase <b>PROD</b> e marque quando terminar.
            </p>
            <ul className="mt-3 space-y-2">
              {migrations.map((m) => (
                <li key={m.file} className="flex flex-col gap-2 rounded-xl border border-[var(--pp-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-mono text-sm text-[var(--pp-text)]">{m.file}{m.status === "modified" ? " (alterada)" : ""}</span>
                  <div className="flex items-center gap-3">
                    <PrimeButton variante="ghost" onClick={() => baixar(m.file)} disabled={baixando === m.file}>
                      <Download className="h-4 w-4" /> {baixando === m.file ? "Baixando…" : "Baixar script"}
                    </PrimeButton>
                    <label className="flex items-center gap-2 text-sm text-[var(--pp-text-body)]">
                      <input type="checkbox" checked={confirmadas.has(m.file)} onChange={() => alternar(m.file)} className="h-4 w-4" />
                      Já rodei no PROD
                    </label>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>

      <Cartao titulo="Publicar">
        {!pode && !emAndamento && motivos.length > 0 && (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-[var(--pp-text-body)]">
            {motivos.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}
        <PrimeButton onClick={publicar} disabled={!pode || enviando || emAndamento}>
          <Rocket className="h-4 w-4" /> {enviando ? "Enviando…" : emAndamento ? "Atualização em andamento…" : "Atualizar produção"}
        </PrimeButton>
      </Cartao>
    </div>
  );
}
