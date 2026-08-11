import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader, PrimeButton, EmptyState, FilterChip, FiltersPanel, FilterGroup } from "../../components/Prime";
import {
  listarSessoesAcesso,
  listarEventosAcesso,
  metricasSessoesAcesso,
  encerrarSessaoRemota,
  excluirSessaoAcesso,
  excluirEventoAcesso,
  listarPageStaysSessao,
  listarPermanenciaAcesso,
  escutarControleAcessos,
  bloquearDispositivoAcesso,
  desbloquearDispositivoAcesso,
  listarDispositivosBloqueados,
} from "../../lib/accessControl/api.js";
import {
  ACCESS_ALERT_TYPES,
  ACCESS_SECURITY_TYPES,
  rotuloEventoAcesso,
} from "../../lib/accessControl/constants.js";
import {
  classificarPresenca,
  duracaoSessaoMs,
  formatarDuracao,
  formatarDataHora,
  formatarHora,
  formatarTempoRelativo,
} from "../../lib/accessControl/sessionDuration.js";
import {
  formatarLocalizacao,
  formatarMarcaModelo,
  mascararIp,
  rotuloDispositivo,
} from "../../lib/accessControl/deviceInfo.js";
import {
  exportarEventosExcel,
  exportarEventosPdf,
  exportarSessoesExcel,
  exportarSessoesPdf,
} from "../../lib/accessControl/export.js";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
];

const PAGE_SIZES = [10, 20, 30, 40, 50];

function rangePeriodo(id) {
  const now = new Date();
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const endOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };
  if (id === "ontem") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { desde: startOfDay(y).toISOString(), ate: endOfDay(y).toISOString() };
  }
  if (id === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { desde: d.toISOString(), ate: now.toISOString() };
  }
  if (id === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { desde: d.toISOString(), ate: now.toISOString() };
  }
  if (id === "mes") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { desde: d.toISOString(), ate: now.toISOString() };
  }
  return { desde: startOfDay(now).toISOString(), ate: now.toISOString() };
}

function PresenceDot({ presence }) {
  const map = {
    online: "bg-[#5E8C31]",
    inativo: "bg-[#F38525]",
    offline: "bg-[#9CA3AF]",
  };
  const label = presence === "online" ? "Online" : presence === "inativo" ? "Inativo" : "Offline";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111111]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${map[presence] || map.offline}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function MetricCard({ titulo, valor, sub }) {
  return (
    <article className="rounded-2xl border border-[#D1D5DB] bg-white px-4 py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">{titulo}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-[#012E46]">{valor}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-[#6B7280]">{sub}</p> : null}
    </article>
  );
}

function InfoGroup({ titulo, children }) {
  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-[#FAFAFA] p-3.5">
      <h4 className="mb-2.5 text-[11px] font-black uppercase tracking-wider text-[#012E46]">{titulo}</h4>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 border-b border-[#E5E7EB]/80 pb-2 last:border-0 last:pb-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#6B7280]">{label}</dt>
      <dd className="break-all text-sm font-semibold text-[#111111]">{value ?? "—"}</dd>
    </div>
  );
}

function SessionDetailsDrawer({
  sessao,
  aberto,
  onFechar,
  eventos,
  pageStays,
  encerrando,
  excluindo,
  bloqueando,
  onEncerrar,
  onBloquear,
  onExcluir,
}) {
  if (!aberto || !sessao) return null;
  const presence = classificarPresenca(sessao);
  const podeEncerrar = sessao.status === "active";
  const podeBloquear = !!sessao.deviceId;
  const busy = encerrando || excluindo || bloqueando;
  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-[#012E46]/40" onClick={onFechar}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Detalhes da sessão"
      >
        <header className="flex items-start justify-between border-b border-[#D1D5DB] px-5 py-4">
          <div>
            <h3 className="text-lg font-black text-[#012E46]">{sessao.usuarioNome || "Usuário"}</h3>
            <div className="mt-1"><PresenceDot presence={presence} /></div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-[#D1D5DB] px-2.5 py-1 text-sm font-bold text-[#6B7280] hover:bg-[#F3F4F6]"
          >
            Fechar
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <InfoGroup titulo="Identificação">
            <InfoRow label="Perfil" value={sessao.usuarioPerfil} />
            <InfoRow label="Estabelecimento" value={sessao.lojaNome} />
            <InfoRow label="E-mail" value={sessao.usuarioEmail} />
          </InfoGroup>

          <InfoGroup titulo="Atividade da sessão">
            <InfoRow label="Login" value={formatarDataHora(sessao.loginAt)} />
            <InfoRow label="Tempo conectado" value={formatarDuracao(duracaoSessaoMs(sessao))} />
            <InfoRow label="Última atividade" value={formatarTempoRelativo(sessao.lastActivityAt)} />
            <InfoRow label="Saída" value={sessao.logoutAt ? formatarDataHora(sessao.logoutAt) : "—"} />
          </InfoGroup>

          <InfoGroup titulo="Dispositivo">
            <InfoRow label="Tipo" value={sessao.deviceType} />
            <InfoRow label="Marca / modelo" value={formatarMarcaModelo(sessao)} />
            <InfoRow label="Sistema" value={sessao.os} />
            <InfoRow label="Navegador" value={[sessao.browser, sessao.browserVersion].filter(Boolean).join(" ") || "—"} />
            <InfoRow label="Aplicação" value={sessao.isPwa ? "PWA" : "Navegador"} />
            <InfoRow label="ID aparelho" value={sessao.deviceId ? `${String(sessao.deviceId).slice(0, 18)}…` : "—"} />
          </InfoGroup>

          <InfoGroup titulo="Rede e localização">
            <InfoRow label="IP" value={sessao.ipAddress || "—"} />
            <InfoRow label="Cidade" value={sessao.city || "—"} />
            <InfoRow label="Estado / UF" value={sessao.state || "—"} />
            <InfoRow label="País" value={sessao.country || "—"} />
            <InfoRow label="Localização" value={formatarLocalizacao(sessao)} />
          </InfoGroup>

          <InfoGroup titulo="Permanência por tela">
            {pageStays.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Nenhuma permanência registrada nesta sessão.</p>
            ) : (
              <ul className="space-y-2">
                {pageStays.map((ps) => (
                  <li key={ps.id} className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[#111111]">{ps.screenLabel || ps.screenKey}</p>
                      <p className="shrink-0 text-xs font-bold tabular-nums text-[#012E46]">
                        {formatarDuracao(ps.durationMs)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">
                      {formatarHora(ps.startedAt)}
                      {ps.endedAt ? ` → ${formatarHora(ps.endedAt)}` : " · em andamento"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </InfoGroup>

          <InfoGroup titulo="Eventos da sessão">
            {eventos.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Nenhum evento registrado.</p>
            ) : (
              <ul className="space-y-2">
                {eventos.map((ev) => (
                  <li key={ev.id} className="rounded-xl border border-[#D1D5DB] bg-white px-3 py-2">
                    <p className="text-xs font-bold text-[#F38525]">{formatarHora(ev.createdAt)}</p>
                    <p className="text-sm font-semibold text-[#111111]">
                      {rotuloEventoAcesso(ev.eventType)}
                      {ev.description ? ` — ${ev.description}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </InfoGroup>
        </div>

        <footer className="space-y-2 border-t border-[#D1D5DB] px-5 py-4">
          {podeEncerrar ? (
            <>
              <PrimeButton variante="danger" className="w-full" disabled={busy} onClick={onEncerrar}>
                {encerrando ? "Encerrando…" : "Encerrar sessão remotamente"}
              </PrimeButton>
              <p className="text-[11px] text-[#6B7280]">
                A sessão é derrubada imediatamente no dispositivo (tempo real).
              </p>
            </>
          ) : null}
          {podeBloquear ? (
            <PrimeButton
              variante="danger"
              className="w-full"
              disabled={busy}
              onClick={onBloquear}
            >
              {bloqueando ? "Bloqueando…" : "Bloquear este dispositivo"}
            </PrimeButton>
          ) : (
            <p className="text-[11px] text-[#6B7280]">
              Sem ID de aparelho nesta sessão — bloqueio indisponível (usuário precisa relogar após a migration 101).
            </p>
          )}
          <PrimeButton
            variante="ghost"
            className="w-full !border-[#C81E4A]/30 !text-[#C81E4A]"
            disabled={busy}
            onClick={onExcluir}
          >
            {excluindo ? "Excluindo…" : "Excluir registro"}
          </PrimeButton>
        </footer>
      </aside>
    </div>
  );
}

/**
 * Administração → Controle de Acessos
 */
export default function ControleAcessosAdmin({ lojaInfo = null, lojas = [], isSuperAdmin = false }) {
  const [aba, setAba] = useState("online");
  const [agruparPermanencia, setAgruparPermanencia] = useState("tela");
  const [periodo, setPeriodo] = useState("hoje");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [deviceFiltro, setDeviceFiltro] = useState("");
  const [lojaFiltro, setLojaFiltro] = useState("");
  const [pagina, setPagina] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [aoVivo, setAoVivo] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [metricas, setMetricas] = useState({
    online: 0, sessoesHoje: 0, tempoMedioSeg: 0, dispositivos: 0, acessosNegados: 0,
  });
  const [alertasRecentes, setAlertasRecentes] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  const [eventosDetalhe, setEventosDetalhe] = useState([]);
  const [pageStaysDetalhe, setPageStaysDetalhe] = useState([]);
  const [encerrando, setEncerrando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [bloqueando, setBloqueando] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const reloadTimerRef = useRef(null);
  const carregarRef = useRef(async () => {});

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(""), 3200);
    return () => clearTimeout(t);
  }, [aviso]);

  const range = useMemo(() => rangePeriodo(periodo), [periodo]);
  const lojaIdEfetiva = isSuperAdmin
    ? (lojaFiltro ? Number(lojaFiltro) : (lojaInfo?.id ?? null))
    : (lojaInfo?.id ?? null);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) {
      setLoading(true);
      setErro("");
    }
    try {
      if (aba === "bloqueados") {
        const { rows: blks, total: tot } = await listarDispositivosBloqueados({
          lojaId: lojaIdEfetiva,
          somenteAtivos: true,
          limit: pageSize,
          offset: pagina * pageSize,
        });
        setRows(blks);
        setTotal(tot);
      } else if (aba === "seguranca") {
        const { rows: evs, total: tot } = await listarEventosAcesso({
          tipos: ACCESS_SECURITY_TYPES,
          desde: range.desde,
          ate: range.ate,
          limit: pageSize,
          offset: pagina * pageSize,
        });
        setRows(evs);
        setTotal(tot);
      } else if (aba === "permanencia") {
        const { rows: perm, total: tot } = await listarPermanenciaAcesso({
          agrupar: agruparPermanencia,
          desde: range.desde,
          ate: range.ate,
          lojaId: lojaIdEfetiva,
          limit: pageSize,
          offset: pagina * pageSize,
        });
        setRows(perm);
        setTotal(tot);
      } else {
        const { rows: sessoes, total: tot } = await listarSessoesAcesso({
          modo: aba === "online" ? "online" : "historico",
          busca: buscaDebounced || null,
          status: statusFiltro || null,
          lojaId: lojaIdEfetiva,
          desde: aba === "historico" ? range.desde : null,
          ate: aba === "historico" ? range.ate : null,
          deviceType: deviceFiltro || null,
          limit: pageSize,
          offset: pagina * pageSize,
        });
        setRows(sessoes);
        setTotal(tot);
      }
      const m = await metricasSessoesAcesso({
        desde: range.desde,
        ate: range.ate,
        lojaId: lojaIdEfetiva,
      });
      setMetricas(m);

      const desde24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { rows: alertas } = await listarEventosAcesso({
        tipos: ACCESS_ALERT_TYPES,
        desde: desde24h,
        ate: new Date().toISOString(),
        limit: 8,
        offset: 0,
      });
      setAlertasRecentes(alertas);
    } catch (e) {
      const msg = e?.message || String(e);
      if (/function .* does not exist|relation .* does not exist|forbidden/i.test(msg)) {
        setErro("Módulo ainda não disponível. Aplique as migrations 098–101 no Supabase.");
      } else if (!silencioso) {
        setErro(msg || "Falha ao carregar sessões.");
      }
      if (!silencioso) {
        setRows([]);
        setTotal(0);
        setAlertasRecentes([]);
      }
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [
    aba, agruparPermanencia, buscaDebounced, statusFiltro, deviceFiltro,
    lojaIdEfetiva, range.desde, range.ate, pagina, pageSize,
  ]);

  carregarRef.current = carregar;

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    const t = window.setTimeout(() => setPagina(0), 0);
    return () => clearTimeout(t);
  }, [
    aba, agruparPermanencia, buscaDebounced, statusFiltro, deviceFiltro, periodo, lojaFiltro, pageSize,
  ]);

  // Tempo real: novo login / mudança na loja → recarrega (debounce)
  useEffect(() => {
    const stop = escutarControleAcessos(() => {
      setAoVivo(true);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        carregarRef.current({ silencioso: true });
      }, 450);
    }, { lojaId: lojaIdEfetiva });
    return () => {
      stop();
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, [lojaIdEfetiva]);

  async function abrirDetalhe(sessao) {
    setDetalhe(sessao);
    try {
      const [{ rows: evs }, stays] = await Promise.all([
        listarEventosAcesso({ sessionId: sessao.id, limit: 30 }),
        listarPageStaysSessao(sessao.id, 40).catch(() => []),
      ]);
      setEventosDetalhe(evs);
      setPageStaysDetalhe(stays);
    } catch {
      setEventosDetalhe([]);
      setPageStaysDetalhe([]);
    }
  }

  async function handleEncerrarRemoto() {
    if (!detalhe?.id) return;
    const nome = detalhe.usuarioNome || "este usuário";
    if (typeof window !== "undefined"
      && !window.confirm(`Encerrar remotamente a sessão de ${nome}? O acesso será derrubado imediatamente.`)) {
      return;
    }
    setEncerrando(true);
    try {
      await encerrarSessaoRemota(detalhe.id);
      setAviso("Sessão encerrada. O dispositivo foi desconectado imediatamente.");
      setDetalhe(null);
      setEventosDetalhe([]);
      setPageStaysDetalhe([]);
      await carregar({ silencioso: true });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/function .* does not exist/i.test(msg)) {
        setErro("Para encerrar remotamente, aplique a migration 099 no Supabase.");
      } else {
        setErro(msg || "Não foi possível encerrar a sessão.");
      }
    } finally {
      setEncerrando(false);
    }
  }

  async function handleBloquearDispositivo() {
    if (!detalhe?.deviceId) {
      setErro("Esta sessão ainda não tem ID de aparelho. Peça um novo login após aplicar a migration 101.");
      return;
    }
    const nome = detalhe.usuarioNome || "usuário";
    const motivo = typeof window !== "undefined"
      ? window.prompt(
        `Bloquear o dispositivo de ${nome}?\nEle não conseguirá fazer login neste aparelho até ser desbloqueado.\n\nMotivo (opcional):`,
        "Bloqueado pelo administrador",
      )
      : null;
    if (motivo === null) return;
    setBloqueando(true);
    try {
      await bloquearDispositivoAcesso({
        deviceId: detalhe.deviceId,
        sessionId: detalhe.id,
        userId: detalhe.userId,
        lojaId: detalhe.lojaId,
        motivo: motivo || "Bloqueado pelo administrador",
        deviceLabel: rotuloDispositivo(detalhe),
        os: detalhe.os,
        browser: detalhe.browser,
        ip: detalhe.ipAddress,
      });
      setAviso("Dispositivo bloqueado. Sessões ativas foram encerradas imediatamente.");
      setDetalhe(null);
      setEventosDetalhe([]);
      setPageStaysDetalhe([]);
      setAba("bloqueados");
      await carregar({ silencioso: true });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/function .* does not exist/i.test(msg)) {
        setErro("Para bloquear dispositivos, aplique a migration 101 no Supabase.");
      } else {
        setErro(msg || "Não foi possível bloquear o dispositivo.");
      }
    } finally {
      setBloqueando(false);
    }
  }

  async function handleDesbloquear(row) {
    if (!row?.id) return;
    if (typeof window !== "undefined"
      && !window.confirm("Desbloquear este dispositivo? O login voltará a ser permitido.")) {
      return;
    }
    setBloqueando(true);
    try {
      await desbloquearDispositivoAcesso(row.id);
      setAviso("Dispositivo desbloqueado.");
      await carregar({ silencioso: true });
    } catch (e) {
      setErro(e?.message || "Falha ao desbloquear.");
    } finally {
      setBloqueando(false);
    }
  }

  async function handleExcluirSessao(sessao, { fecharDrawer = false } = {}) {
    if (!sessao?.id) return;
    const nome = sessao.usuarioNome || "este registro";
    if (typeof window !== "undefined"
      && !window.confirm(`Excluir permanentemente o registro de acesso de ${nome}? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setExcluindo(true);
    try {
      await excluirSessaoAcesso(sessao.id);
      setAviso("Registro de sessão excluído.");
      if (fecharDrawer || detalhe?.id === sessao.id) {
        setDetalhe(null);
        setEventosDetalhe([]);
        setPageStaysDetalhe([]);
      }
      await carregar({ silencioso: true });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/function .* does not exist/i.test(msg)) {
        setErro("Para excluir, aplique a migration 100 no Supabase.");
      } else {
        setErro(msg || "Não foi possível excluir.");
      }
    } finally {
      setExcluindo(false);
    }
  }

  async function handleExcluirEvento(ev) {
    if (!ev?.id) return;
    if (typeof window !== "undefined"
      && !window.confirm("Excluir este evento de segurança?")) {
      return;
    }
    setExcluindo(true);
    try {
      await excluirEventoAcesso(ev.id);
      setAviso("Evento excluído.");
      await carregar({ silencioso: true });
    } catch (e) {
      const msg = e?.message || String(e);
      if (/function .* does not exist/i.test(msg)) {
        setErro("Para excluir eventos, aplique a migration 100 no Supabase.");
      } else {
        setErro(msg || "Não foi possível excluir o evento.");
      }
    } finally {
      setExcluindo(false);
    }
  }

  async function buscarParaExport(limit = 500) {
    if (aba === "seguranca") {
      const { rows: evs } = await listarEventosAcesso({
        tipos: ACCESS_SECURITY_TYPES,
        desde: range.desde,
        ate: range.ate,
        limit,
        offset: 0,
      });
      return evs;
    }
    if (aba === "permanencia") {
      const { rows: perm } = await listarPermanenciaAcesso({
        agrupar: agruparPermanencia,
        desde: range.desde,
        ate: range.ate,
        lojaId: lojaIdEfetiva,
        limit,
        offset: 0,
      });
      return perm;
    }
    const { rows: sessoes } = await listarSessoesAcesso({
      modo: aba === "online" ? "online" : "historico",
      busca: buscaDebounced || null,
      status: statusFiltro || null,
      lojaId: lojaIdEfetiva,
      desde: aba === "historico" ? range.desde : null,
      ate: aba === "historico" ? range.ate : null,
      deviceType: deviceFiltro || null,
      limit,
      offset: 0,
    });
    return sessoes;
  }

  async function handleExportExcel() {
    try {
      if (aba === "permanencia") {
        setAviso("Exportação de permanência: use PDF nesta aba por enquanto.");
        return;
      }
      const dados = await buscarParaExport(500);
      if (aba === "seguranca") exportarEventosExcel(dados);
      else exportarSessoesExcel(dados, { aba });
      setAviso("Exportação Excel (CSV) gerada.");
    } catch (e) {
      setErro(e?.message || "Falha ao exportar.");
    }
  }

  async function handleExportPdf() {
    try {
      const dados = await buscarParaExport(500);
      const empresa = lojaInfo?.nome || "Pedido Prime";
      if (aba === "permanencia") {
        const thead = ["Item", "Tempo", "Visitas", "Usuários", "Detalhe"]
          .map((h) => `<th>${h}</th>`).join("");
        const rowsHtml = dados.map((r) => `<tr>
          <td>${(r.rotulo || "—").replace(/</g, "&lt;")}</td>
          <td>${formatarDuracao(r.tempoMs)}</td>
          <td>${r.visitas}</td>
          <td>${r.usuarios}</td>
          <td>${(r.detalhe || "—").replace(/</g, "&lt;")}</td>
        </tr>`).join("");
        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Permanência</title>
          <style>@page{size:A4 landscape;margin:12mm}body{font-family:Segoe UI,Arial,sans-serif;color:#012E46}
          table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;font-size:9px;color:#6B7280;border-bottom:2px solid #D1D5DB;padding:6px 8px}
          td{padding:7px 8px;border-bottom:1px solid #F3F4F6}</style></head><body>
          <h1>Permanência de acesso — ${empresa}</h1>
          <p>Agrupado por ${agruparPermanencia} · ${dados.length} item(ns)</p>
          <table><thead><tr>${thead}</tr></thead><tbody>${rowsHtml}</tbody></table>
          <script>window.onload=function(){window.print();}</${"script"}></body></html>`;
        const w = window.open("", "_blank", "width=1100,height=800");
        if (!w) { setErro("Permita pop-ups para gerar o PDF."); return; }
        w.document.write(html); w.document.close();
        setAviso("Janela de PDF/impressão aberta.");
        return;
      }
      const ok = aba === "seguranca"
        ? exportarEventosPdf(dados, { empresa })
        : exportarSessoesPdf(dados, { aba, empresa });
      if (!ok) setErro("Permita pop-ups para gerar o PDF / impressão.");
      else setAviso("Janela de PDF/impressão aberta.");
    } catch (e) {
      setErro(e?.message || "Falha ao gerar PDF.");
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));
  const podeExportar = true;

  const rotuloAgrupar = {
    tela: "Tela",
    dispositivo: "Dispositivo",
    usuario: "Usuário",
  };

  const abasVisao = [
    { id: "online", label: "Online" },
    { id: "historico", label: "Histórico" },
    { id: "permanencia", label: "Permanência" },
    { id: "bloqueados", label: "Bloqueados" },
    { id: "seguranca", label: "Segurança" },
  ];
  const mostraFiltrosSessao = aba === "online" || aba === "historico";
  const mostraPeriodo = aba !== "bloqueados";
  const mostraBusca = mostraFiltrosSessao;

  const limparFiltros = () => {
    setBusca("");
    setStatusFiltro("");
    setDeviceFiltro("");
    setLojaFiltro("");
    setPeriodo("hoje");
    setPageSize(10);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={(
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-2.8 8.4-7 10-4.2-1.6-7-5.5-7-10V6l7-3z" />
          </svg>
        )}
        titulo="Controle de Acessos"
        descricao="Sessões, localização do dispositivo, marca/modelo e permanência — atualização em tempo real."
      />

      {/* Grupo: indicadores */}
      <section aria-label="Indicadores">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Resumo operacional</p>
          {aoVivo ? (
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#5E8C31]">
              ● Ao vivo
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard titulo="Online agora" valor={metricas.online} />
          <MetricCard titulo="Sessões hoje" valor={metricas.sessoesHoje} />
          <MetricCard titulo="Tempo médio" valor={formatarDuracao(metricas.tempoMedioSeg, { emSegundos: true })} />
          <MetricCard titulo="Dispositivos" valor={metricas.dispositivos} />
          <MetricCard titulo="Acessos negados" valor={metricas.acessosNegados} sub="no período" />
        </div>
      </section>

      {alertasRecentes.length > 0 ? (
        <section className="rounded-2xl border border-[#F38525]/35 bg-[#FFF7ED] px-4 py-3" aria-label="Alertas">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-[#012E46]">
              Alertas recentes (24h) — {alertasRecentes.length}
            </p>
            <button
              type="button"
              onClick={() => setAba("seguranca")}
              className="text-xs font-bold text-[#012E46] underline-offset-2 hover:underline"
            >
              Ver na aba Segurança
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {alertasRecentes.slice(0, 4).map((ev) => (
              <li key={ev.id} className="text-sm text-[#111111]">
                <span className="font-bold text-[#F38525]">{rotuloEventoAcesso(ev.eventType)}</span>
                {" · "}
                {ev.usuarioNome || "Usuário"}
                {" · "}
                <span className="text-[#6B7280]">{formatarDataHora(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Grupo: visão + exportação */}
      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]" aria-label="Visão e exportação">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--pp-text)]">Visão</p>
            <div className="flex flex-wrap items-center gap-2">
              {abasVisao.map((t) => (
                <FilterChip key={t.id} selected={aba === t.id} label={t.label} onClick={() => setAba(t.id)} />
              ))}
            </div>
          </div>
          {podeExportar ? (
            <div className="shrink-0">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--pp-text)]">Relatório</p>
              <div className="flex flex-wrap gap-2">
                <PrimeButton variante="ghost" onClick={handleExportExcel}>
                  Exportar Excel
                </PrimeButton>
                <PrimeButton variante="ghost" onClick={handleExportPdf}>
                  Exportar PDF
                </PrimeButton>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Grupo: filtros alinhados */}
      <section aria-label="Filtros">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">Filtros da análise</p>
        {(mostraPeriodo || mostraFiltrosSessao || aba === "permanencia") ? (
          <FiltersPanel className={mostraFiltrosSessao ? "lg:grid-cols-3" : "sm:grid-cols-1 lg:grid-cols-2"}>
            {mostraPeriodo ? (
              <FilterGroup
                titulo="Período"
                descricao="Janela de tempo do relatório"
                opcoes={PERIODOS}
                valor={periodo}
                onChange={setPeriodo}
              />
            ) : null}

            {mostraFiltrosSessao ? (
              <FilterGroup
                titulo="Status"
                descricao="Presença da sessão"
                opcoes={[
                  { id: "todos", label: "Todos" },
                  { id: "online", label: "Online" },
                  { id: "inativo", label: "Inativo" },
                  { id: "offline", label: "Offline" },
                  { id: "closed", label: "Encerrada" },
                ]}
                valor={statusFiltro || "todos"}
                onChange={(id) => setStatusFiltro(id === "todos" ? "" : id)}
              />
            ) : null}

            {mostraFiltrosSessao ? (
              <FilterGroup
                titulo="Dispositivo"
                descricao="Tipo de aparelho"
                opcoes={[
                  { id: "todos", label: "Todos" },
                  { id: "Desktop", label: "Desktop" },
                  { id: "Notebook", label: "Notebook" },
                  { id: "Tablet", label: "Tablet" },
                  { id: "Smartphone", label: "Smartphone" },
                ]}
                valor={deviceFiltro || "todos"}
                onChange={(id) => setDeviceFiltro(id === "todos" ? "" : id)}
              />
            ) : null}

            {aba === "permanencia" ? (
              <FilterGroup
                titulo="Agrupar permanência"
                descricao="Como consolidar o tempo na tela"
                opcoes={[
                  { id: "tela", label: "Por tela" },
                  { id: "dispositivo", label: "Por dispositivo" },
                  { id: "usuario", label: "Por usuário" },
                ]}
                valor={agruparPermanencia}
                onChange={setAgruparPermanencia}
              />
            ) : null}
          </FiltersPanel>
        ) : null}

        <div className="mt-3 rounded-[14px] border border-[#E2E8F0] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--pp-text)]">
            Busca e exibição
          </p>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {mostraBusca ? (
              <label className="block text-xs font-bold text-[#6B7280] sm:col-span-2 lg:col-span-1">
                Buscar usuário
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome ou e-mail"
                  className="mt-1 h-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111] outline-none focus:border-[#012E46]"
                />
              </label>
            ) : (
              <div className="hidden lg:block" />
            )}

            {isSuperAdmin ? (
              <label className="block text-xs font-bold text-[#6B7280]">
                Estabelecimento
                <select
                  value={lojaFiltro}
                  onChange={(e) => setLojaFiltro(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111]"
                >
                  <option value="">Empresa em foco / todas</option>
                  {lojas.map((l) => (
                    <option key={l.id} value={l.id}>{l.nome}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-xs font-bold text-[#6B7280]">
              Linhas por página
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111]"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <PrimeButton variante="ghost" onClick={limparFiltros} className="w-full sm:w-auto">
                Limpar filtros
              </PrimeButton>
            </div>
          </div>
        </div>
      </section>

      {erro ? (
        <div className="rounded-2xl border border-[#F38525]/40 bg-[#FFF7ED] px-4 py-3 text-sm font-semibold text-[#012E46]">
          {erro}
        </div>
      ) : null}
      {aviso ? (
        <div className="rounded-2xl border border-[#5E8C31]/35 bg-[#F0FDF4] px-4 py-3 text-sm font-semibold text-[#012E46]">
          {aviso}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-[#D1D5DB] bg-white px-4 py-10 text-center text-sm font-semibold text-[#6B7280]">
          Carregando sessões…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          titulo="Nenhum acesso encontrado para os filtros selecionados."
          dica="Ajuste o período ou a busca, ou aguarde novos logins no sistema."
        />
      ) : aba === "bloqueados" ? (
        <div className="overflow-x-auto rounded-2xl border border-[#D1D5DB] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-3 py-3">Quando</th>
                <th className="px-3 py-3">Dispositivo</th>
                <th className="px-3 py-3">Usuário</th>
                <th className="px-3 py-3">Motivo</th>
                <th className="px-3 py-3">Bloqueado por</th>
                <th className="px-3 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t border-[#F3F4F6]">
                  <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#111111]">{formatarDataHora(b.blockedAt)}</td>
                  <td className="px-3 py-2.5 text-[#111111]">
                    <p className="font-bold">{b.deviceLabel || [b.os, b.browser].filter(Boolean).join(" • ") || "Aparelho"}</p>
                    <p className="font-mono text-[11px] text-[#6B7280]">{b.deviceId ? `${String(b.deviceId).slice(0, 22)}…` : "—"}</p>
                  </td>
                  <td className="px-3 py-2.5 text-[#111111]">{b.usuarioNome || "—"}</td>
                  <td className="px-3 py-2.5 text-[#6B7280]">{b.motivo || "—"}</td>
                  <td className="px-3 py-2.5 text-[#6B7280]">{b.bloqueadoPorNome || "—"}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={bloqueando}
                      onClick={() => handleDesbloquear(b)}
                      className="rounded-lg border border-[#012E46]/25 px-2.5 py-1 text-xs font-bold text-[#012E46] hover:bg-[#012E46]/5"
                    >
                      Desbloquear
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : aba === "seguranca" ? (
        <div className="overflow-x-auto rounded-2xl border border-[#D1D5DB] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-3 py-3">Quando</th>
                <th className="px-3 py-3">Evento</th>
                <th className="px-3 py-3">Usuário</th>
                <th className="px-3 py-3">Descrição</th>
                <th className="px-3 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ev) => (
                <tr key={ev.id} className="border-t border-[#F3F4F6]">
                  <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#111111]">{formatarDataHora(ev.createdAt)}</td>
                  <td className="px-3 py-2.5 font-bold text-[#F38525]">{rotuloEventoAcesso(ev.eventType)}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{ev.usuarioNome || ev.metadata?.email || "—"}</td>
                  <td className="px-3 py-2.5 text-[#6B7280]">{ev.description || "—"}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={excluindo}
                      onClick={() => handleExcluirEvento(ev)}
                      className="rounded-lg border border-[#C81E4A]/25 px-2.5 py-1 text-xs font-bold text-[#C81E4A] hover:bg-[#C81E4A]/5"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : aba === "permanencia" ? (
        <div className="overflow-x-auto rounded-2xl border border-[#D1D5DB] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-3 py-3">{rotuloAgrupar[agruparPermanencia]}</th>
                <th className="px-3 py-3">Tempo total</th>
                <th className="px-3 py-3">Visitas</th>
                {agruparPermanencia !== "usuario" ? <th className="px-3 py-3">Usuários</th> : null}
                <th className="px-3 py-3">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.chave} className="border-t border-[#F3F4F6]">
                  <td className="px-3 py-2.5 font-bold text-[#111111]">{r.rotulo || "—"}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-[#012E46]">{formatarDuracao(r.tempoMs)}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{r.visitas}</td>
                  {agruparPermanencia !== "usuario" ? (
                    <td className="px-3 py-2.5 text-[#6B7280]">{r.usuarios}</td>
                  ) : null}
                  <td className="px-3 py-2.5 text-[#6B7280]">{r.detalhe || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-[#D1D5DB] bg-white md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Usuário</th>
                  <th className="px-3 py-3">Perfil</th>
                  <th className="px-3 py-3">Loja</th>
                  <th className="px-3 py-3">{aba === "online" ? "Login" : "Data"}</th>
                  {aba === "historico" ? <th className="px-3 py-3">Saída</th> : null}
                  <th className="px-3 py-3">Tempo</th>
                  {aba === "online" ? <th className="px-3 py-3">Última atividade</th> : null}
                  <th className="px-3 py-3">Marca / modelo</th>
                  <th className="px-3 py-3">Dispositivo</th>
                  <th className="px-3 py-3">IP</th>
                  <th className="px-3 py-3">Localização</th>
                  <th className="px-3 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const presence = classificarPresenca(s, agora);
                  const soft = [s.os, s.browser].filter(Boolean).join(" • ");
                  return (
                    <tr key={s.id} className="border-t border-[#F3F4F6] hover:bg-[#FAFAFA]">
                      <td className="px-3 py-2.5"><PresenceDot presence={presence} /></td>
                      <td className="px-3 py-2.5 font-bold text-[#111111]">{s.usuarioNome}</td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{s.usuarioPerfil || "—"}</td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{s.lojaNome || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#111111]">
                        {aba === "online" ? formatarHora(s.loginAt) : formatarDataHora(s.loginAt)}
                      </td>
                      {aba === "historico" ? (
                        <td className="px-3 py-2.5 whitespace-nowrap text-[#6B7280]">
                          {s.logoutAt ? formatarHora(s.logoutAt) : "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 font-semibold tabular-nums text-[#012E46]">
                        {formatarDuracao(duracaoSessaoMs(s, agora))}
                      </td>
                      {aba === "online" ? (
                        <td className="px-3 py-2.5 text-[#6B7280]">{formatarTempoRelativo(s.lastActivityAt, agora)}</td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <p className="font-bold text-[#111111]">{formatarMarcaModelo(s)}</p>
                        <p className="text-[11px] font-semibold text-[#6B7280]">{s.deviceType || "—"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[#6B7280]">
                        {soft || rotuloDispositivo(s)}
                        {s.isPwa ? <span className="ml-1 font-bold text-[#012E46]">· PWA</span> : null}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-[#6B7280]">{mascararIp(s.ipAddress)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#111111]">{formatarLocalizacao(s)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrirDetalhe(s)}
                            className="rounded-lg border border-[#012E46]/20 px-2.5 py-1 text-xs font-bold text-[#012E46] hover:bg-[#012E46]/5"
                          >
                            Detalhes
                          </button>
                          <button
                            type="button"
                            disabled={excluindo}
                            onClick={() => handleExcluirSessao(s)}
                            className="rounded-lg border border-[#C81E4A]/25 px-2.5 py-1 text-xs font-bold text-[#C81E4A] hover:bg-[#C81E4A]/5"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {rows.map((s) => {
              const presence = classificarPresenca(s, agora);
              return (
                <article key={s.id} className="rounded-2xl border border-[#D1D5DB] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-[#111111]">{s.usuarioNome}</p>
                      <p className="text-xs text-[#6B7280]">{s.usuarioPerfil} · {s.lojaNome || "—"}</p>
                    </div>
                    <PresenceDot presence={presence} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-[#6B7280]">Login</dt><dd className="font-semibold">{formatarHora(s.loginAt)}</dd></div>
                    <div><dt className="text-[#6B7280]">Tempo</dt><dd className="font-semibold">{formatarDuracao(duracaoSessaoMs(s, agora))}</dd></div>
                    <div className="col-span-2"><dt className="text-[#6B7280]">Marca / modelo</dt><dd className="font-semibold">{formatarMarcaModelo(s)}</dd></div>
                    <div className="col-span-2"><dt className="text-[#6B7280]">Dispositivo</dt><dd className="font-semibold">{rotuloDispositivo(s)}</dd></div>
                    <div className="col-span-2"><dt className="text-[#6B7280]">IP</dt><dd className="font-semibold font-mono">{mascararIp(s.ipAddress)}</dd></div>
                    <div className="col-span-2"><dt className="text-[#6B7280]">Localização</dt><dd className="font-semibold">{formatarLocalizacao(s)}</dd></div>
                  </dl>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => abrirDetalhe(s)}
                      className="rounded-xl border border-[#012E46]/20 py-2 text-xs font-bold text-[#012E46]"
                    >
                      Ver detalhes
                    </button>
                    <button
                      type="button"
                      disabled={excluindo}
                      onClick={() => handleExcluirSessao(s)}
                      className="rounded-xl border border-[#C81E4A]/25 py-2 text-xs font-bold text-[#C81E4A]"
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[#6B7280]">
          {total} registro(s) · página {pagina + 1} de {totalPaginas} · {pageSize}/página
        </p>
        <div className="flex gap-2">
          <PrimeButton variante="ghost" disabled={pagina <= 0} onClick={() => setPagina((p) => Math.max(0, p - 1))}>
            Anterior
          </PrimeButton>
          <PrimeButton variante="ghost" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </PrimeButton>
        </div>
      </div>

      <SessionDetailsDrawer
        aberto={!!detalhe}
        sessao={detalhe}
        eventos={eventosDetalhe}
        pageStays={pageStaysDetalhe}
        encerrando={encerrando}
        excluindo={excluindo}
        bloqueando={bloqueando}
        onEncerrar={handleEncerrarRemoto}
        onBloquear={handleBloquearDispositivo}
        onExcluir={() => handleExcluirSessao(detalhe, { fecharDrawer: true })}
        onFechar={() => {
          setDetalhe(null);
          setEventosDetalhe([]);
          setPageStaysDetalhe([]);
        }}
      />
    </div>
  );
}
