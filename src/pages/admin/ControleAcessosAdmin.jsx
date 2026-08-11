import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, PrimeButton, EmptyState, FilterChip, FiltersPanel } from "../../components/Prime";
import {
  listarSessoesAcesso,
  listarEventosAcesso,
  metricasSessoesAcesso,
} from "../../lib/accessControl/api.js";
import { ACCESS_SECURITY_TYPES } from "../../lib/accessControl/constants.js";
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
  mascararIp,
  rotuloDispositivo,
} from "../../lib/accessControl/deviceInfo.js";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
  { id: "ontem", label: "Ontem" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
];

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

function SessionDetailsDrawer({ sessao, aberto, onFechar, eventos }) {
  if (!aberto || !sessao) return null;
  const presence = classificarPresenca(sessao);
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
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {[
            ["Perfil", sessao.usuarioPerfil || "—"],
            ["Estabelecimento", sessao.lojaNome || "—"],
            ["E-mail", sessao.usuarioEmail || "—"],
            ["Login", formatarDataHora(sessao.loginAt)],
            ["Tempo conectado", formatarDuracao(duracaoSessaoMs(sessao))],
            ["Última atividade", formatarTempoRelativo(sessao.lastActivityAt)],
            ["Saída", sessao.logoutAt ? formatarDataHora(sessao.logoutAt) : "—"],
            ["Dispositivo", sessao.deviceType || "—"],
            ["Sistema", sessao.os || "—"],
            ["Navegador", [sessao.browser, sessao.browserVersion].filter(Boolean).join(" ") || "—"],
            ["Aplicação", sessao.isPwa ? "PWA" : "Navegador"],
            ["IP", mascararIp(sessao.ipAddress)],
            ["Localização aproximada", formatarLocalizacao(sessao)],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-[#F3F4F6] pb-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">{k}</dt>
              <dd className="font-semibold text-[#111111]">{v}</dd>
            </div>
          ))}

          <div className="pt-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6B7280]">Eventos da sessão</p>
            {eventos.length === 0 ? (
              <p className="text-sm text-[#6B7280]">Nenhum evento registrado.</p>
            ) : (
              <ul className="space-y-2">
                {eventos.map((ev) => (
                  <li key={ev.id} className="rounded-xl border border-[#D1D5DB] bg-[#FAFAFA] px-3 py-2">
                    <p className="text-xs font-bold text-[#F38525]">{formatarHora(ev.createdAt)}</p>
                    <p className="text-sm font-semibold text-[#111111]">{ev.description || ev.eventType}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/**
 * Administração → Controle de Acessos
 * Consulta de sessões online, histórico e eventos de segurança.
 */
export default function ControleAcessosAdmin({ lojaInfo = null, lojas = [], isSuperAdmin = false }) {
  const [aba, setAba] = useState("online");
  const [periodo, setPeriodo] = useState("hoje");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [deviceFiltro, setDeviceFiltro] = useState("");
  const [lojaFiltro, setLojaFiltro] = useState("");
  const [pagina, setPagina] = useState(0);
  const pageSize = 40;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [metricas, setMetricas] = useState({
    online: 0, sessoesHoje: 0, tempoMedioSeg: 0, dispositivos: 0, acessosNegados: 0,
  });
  const [detalhe, setDetalhe] = useState(null);
  const [eventosDetalhe, setEventosDetalhe] = useState([]);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const range = useMemo(() => rangePeriodo(periodo), [periodo]);
  const lojaIdEfetiva = isSuperAdmin
    ? (lojaFiltro ? Number(lojaFiltro) : (lojaInfo?.id ?? null))
    : (lojaInfo?.id ?? null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      if (aba === "seguranca") {
        const { rows: evs, total: tot } = await listarEventosAcesso({
          tipos: ACCESS_SECURITY_TYPES,
          desde: range.desde,
          ate: range.ate,
          limit: pageSize,
          offset: pagina * pageSize,
        });
        setRows(evs);
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
    } catch (e) {
      const msg = e?.message || String(e);
      if (/function .* does not exist|relation .* does not exist|forbidden/i.test(msg)) {
        setErro("Módulo ainda não disponível neste ambiente. Aplique a migration 098 no Supabase.");
      } else {
        setErro(msg || "Falha ao carregar sessões.");
      }
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [aba, buscaDebounced, statusFiltro, deviceFiltro, lojaIdEfetiva, range.desde, range.ate, pagina]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setPagina(0); }, [aba, buscaDebounced, statusFiltro, deviceFiltro, periodo, lojaFiltro]);

  async function abrirDetalhe(sessao) {
    setDetalhe(sessao);
    try {
      const { rows: evs } = await listarEventosAcesso({ sessionId: sessao.id, limit: 30 });
      setEventosDetalhe(evs);
    } catch {
      setEventosDetalhe([]);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-1 pb-8">
      <PageHeader
        icone={<span className="text-lg">🛡️</span>}
        titulo="Controle de Acessos"
        descricao="Acompanhe sessões, dispositivos e horários de utilização do sistema."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard titulo="Online agora" valor={metricas.online} />
        <MetricCard titulo="Sessões hoje" valor={metricas.sessoesHoje} />
        <MetricCard titulo="Tempo médio" valor={formatarDuracao(metricas.tempoMedioSeg, { emSegundos: true })} />
        <MetricCard titulo="Dispositivos" valor={metricas.dispositivos} />
        <MetricCard titulo="Acessos negados" valor={metricas.acessosNegados} sub="no período" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "online", label: "Online" },
          { id: "historico", label: "Histórico" },
          { id: "seguranca", label: "Segurança" },
        ].map((t) => (
          <FilterChip key={t.id} selected={aba === t.id} label={t.label} onClick={() => setAba(t.id)} />
        ))}
      </div>

      <FiltersPanel>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="block min-w-[14rem] flex-1 text-xs font-bold text-[#6B7280]">
            Buscar usuário
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou e-mail"
              className="mt-1 h-10 w-full rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111] outline-none focus:border-[#012E46]"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <FilterChip key={p.id} size="sm" selected={periodo === p.id} label={p.label} onClick={() => setPeriodo(p.id)} />
            ))}
          </div>

          {aba !== "seguranca" && (
            <label className="block text-xs font-bold text-[#6B7280]">
              Status
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                className="mt-1 h-10 rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111]"
              >
                <option value="">Todos</option>
                <option value="online">Online</option>
                <option value="inativo">Inativo</option>
                <option value="offline">Offline</option>
                <option value="closed">Encerrada</option>
              </select>
            </label>
          )}

          {aba !== "seguranca" && (
            <label className="block text-xs font-bold text-[#6B7280]">
              Dispositivo
              <select
                value={deviceFiltro}
                onChange={(e) => setDeviceFiltro(e.target.value)}
                className="mt-1 h-10 rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111]"
              >
                <option value="">Todos</option>
                <option value="Desktop">Desktop</option>
                <option value="Notebook">Notebook</option>
                <option value="Tablet">Tablet</option>
                <option value="Smartphone">Smartphone</option>
              </select>
            </label>
          )}

          {isSuperAdmin && (
            <label className="block text-xs font-bold text-[#6B7280]">
              Estabelecimento
              <select
                value={lojaFiltro}
                onChange={(e) => setLojaFiltro(e.target.value)}
                className="mt-1 h-10 min-w-[10rem] rounded-xl border border-[#D1D5DB] bg-white px-3 text-sm font-semibold text-[#111111]"
              >
                <option value="">Empresa em foco / todas</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </label>
          )}

          <PrimeButton
            variante="ghost"
            onClick={() => {
              setBusca("");
              setStatusFiltro("");
              setDeviceFiltro("");
              setLojaFiltro("");
              setPeriodo("hoje");
            }}
          >
            Limpar filtros
          </PrimeButton>
        </div>
      </FiltersPanel>

      {erro ? (
        <div className="rounded-2xl border border-[#F38525]/40 bg-[#FFF7ED] px-4 py-3 text-sm font-semibold text-[#012E46]">
          {erro}
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
      ) : aba === "seguranca" ? (
        <div className="overflow-x-auto rounded-2xl border border-[#D1D5DB] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              <tr>
                <th className="px-3 py-3">Quando</th>
                <th className="px-3 py-3">Evento</th>
                <th className="px-3 py-3">Usuário</th>
                <th className="px-3 py-3">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ev) => (
                <tr key={ev.id} className="border-t border-[#F3F4F6]">
                  <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#111111]">{formatarDataHora(ev.createdAt)}</td>
                  <td className="px-3 py-2.5 font-bold text-[#F38525]">{ev.eventType}</td>
                  <td className="px-3 py-2.5 text-[#111111]">{ev.usuarioNome || ev.metadata?.email || "—"}</td>
                  <td className="px-3 py-2.5 text-[#6B7280]">{ev.description || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Desktop table */}
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
                  <th className="px-3 py-3">Dispositivo</th>
                  <th className="px-3 py-3">Localização</th>
                  <th className="px-3 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const presence = classificarPresenca(s, agora);
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
                      <td className="px-3 py-2.5 text-[#111111]">{rotuloDispositivo(s)}</td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{formatarLocalizacao(s)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => abrirDetalhe(s)}
                          className="rounded-lg border border-[#012E46]/20 px-2.5 py-1 text-xs font-bold text-[#012E46] hover:bg-[#012E46]/5"
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
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
                    <div className="col-span-2"><dt className="text-[#6B7280]">Dispositivo</dt><dd className="font-semibold">{rotuloDispositivo(s)}</dd></div>
                    <div className="col-span-2"><dt className="text-[#6B7280]">Local</dt><dd className="font-semibold">{formatarLocalizacao(s)}</dd></div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => abrirDetalhe(s)}
                    className="mt-3 w-full rounded-xl border border-[#012E46]/20 py-2 text-xs font-bold text-[#012E46]"
                  >
                    Ver detalhes
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}

      {total > pageSize ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-[#6B7280]">{total} registro(s) · página {pagina + 1} de {totalPaginas}</p>
          <div className="flex gap-2">
            <PrimeButton variante="ghost" disabled={pagina <= 0} onClick={() => setPagina((p) => Math.max(0, p - 1))}>
              Anterior
            </PrimeButton>
            <PrimeButton variante="ghost" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
              Próxima
            </PrimeButton>
          </div>
        </div>
      ) : null}

      <SessionDetailsDrawer
        aberto={!!detalhe}
        sessao={detalhe}
        eventos={eventosDetalhe}
        onFechar={() => { setDetalhe(null); setEventosDetalhe([]); }}
      />
    </div>
  );
}
