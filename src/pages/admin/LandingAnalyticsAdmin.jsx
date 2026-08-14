import { useCallback, useEffect, useState } from "react";
import { Activity, BarChart3, CalendarDays, Clock3, Download, Eye, MapPin, MonitorSmartphone, RotateCcw, Search, Trash2, UserRoundCheck, Users } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const periods = [{ id: 7, label: "7 dias" }, { id: 30, label: "30 dias" }, { id: 90, label: "90 dias" }];
const fmt = (v) => new Intl.NumberFormat("pt-BR").format(v || 0);
const dt = (v) => v ? new Date(v).toLocaleString("pt-BR") : "—";
const duration = (seconds = 0) => {
  const value = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(value / 3600); const m = Math.floor((value % 3600) / 60); const s = value % 60;
  return h ? `${h}h ${m}min` : m ? `${m}min ${s}s` : `${s}s`;
};

function Metric({ icon: Icon, label, value, help }) {
  return <article className="rounded-2xl border border-[#DDE4E8] bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wider text-[#637985]">{label}</p><Icon className="h-5 w-5 text-[#F38525]" /></div>
    <p className="mt-2 text-3xl font-black text-[#012E46]">{fmt(value)}</p><p className="mt-1 text-xs text-[#637985]">{help}</p>
  </article>;
}

function Ranking({ title, rows = [] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return <section className="rounded-2xl border border-[#DDE4E8] bg-white p-4">
    <h3 className="font-black text-[#012E46]">{title}</h3>
    <div className="mt-4 space-y-3">{rows.slice(0, 7).map((row) => <div key={row.label}>
      <div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-[#334E5B]">{row.label}</span><strong className="text-[#012E46]">{fmt(row.value)}</strong></div>
      <div className="h-2 overflow-hidden rounded-full bg-[#EEF2F4]"><div className="h-full rounded-full bg-[#F38525]" style={{ width: `${Math.max(4, row.value / max * 100)}%` }} /></div>
    </div>)}</div>
  </section>;
}

export default function LandingAnalyticsAdmin() {
  const [days, setDays] = useState(30); const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(""); const [search, setSearch] = useState("");
  const [device, setDevice] = useState(""); const [browser, setBrowser] = useState(""); const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth?.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");
      const from = new Date(Date.now() - days * 86400000).toISOString();
      const params = new URLSearchParams({ from, page: String(page) });
      if (search) params.set("q", search); if (device) params.set("device", device); if (browser) params.set("browser", browser); if (status) params.set("status", status);
      const response = await fetch(`/api/landing-analytics?${params}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao carregar métricas.");
      setData(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [days, page, search, device, browser, status]);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => load({ silent: true }), 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function removeVisit(visit) {
    if (!window.confirm("Excluir permanentemente este registro de acesso?")) return;
    try {
      const { data: auth } = await supabase.auth.getSession();
      const response = await fetch(`/api/landing-analytics?id=${encodeURIComponent(visit.id)}`, { method: "DELETE", headers: { authorization: `Bearer ${auth?.session?.access_token || ""}` } });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível excluir.");
      await load({ silent: true });
    } catch (e) { setError(e.message); }
  }
  function clearFilters() { setSearchInput(""); setSearch(""); setDevice(""); setBrowser(""); setStatus(""); setPage(1); }
  async function exportCsv() {
    try {
      const { data: auth } = await supabase.auth.getSession(); const from = new Date(Date.now() - days * 86400000).toISOString();
      const params = new URLSearchParams({ from, export: "1" });
      if (search) params.set("q", search); if (device) params.set("device", device); if (browser) params.set("browser", browser); if (status) params.set("status", status);
      const response = await fetch(`/api/landing-analytics?${params}`, { headers: { authorization: `Bearer ${auth?.session?.access_token || ""}` } });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao exportar.");
      const columns = ["Início", "Fim", "Permanência (s)", "Cidade", "UF", "País", "IP", "Dispositivo", "Sistema", "Navegador", "Resolução", "Origem"];
      const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const rows = body.visits.map((v) => [v.started_at || v.created_at, v.ended_at, v.duration_seconds, v.city, v.state, v.country, v.ip_address, v.device_name || v.device_type, v.os, [v.browser, v.browser_version].filter(Boolean).join(" "), v.screen_width && v.screen_height ? `${v.screen_width}x${v.screen_height}` : "", v.referrer].map(quote).join(";"));
      const blob = new Blob(["\ufeff", columns.map(quote).join(";"), "\n", rows.join("\n")], { type: "text/csv;charset=utf-8" });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `audiencia-landing-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    } catch (e) { setError(e.message); }
  }
  const peak = Math.max(...(data?.byDay || []).map((r) => r.value), 1);
  return <div className="space-y-5 pb-8">
    <header className="flex flex-col justify-between gap-5 rounded-3xl bg-[#012E46] p-5 text-white shadow-[0_18px_42px_-28px_rgba(1,46,70,.9)] sm:p-6 lg:flex-row lg:items-center">
      <div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[.18em] text-[#F38525]">Super Admin</p><span className="!rounded-full !border !border-white/20 !bg-white/10 !px-2.5 !py-1 !text-[10px] !font-bold !uppercase !tracking-wider !text-white">Visão global</span></div><h1 className="mt-2 text-2xl font-black sm:text-3xl">Audiência da landing page</h1><p className="mt-2 text-sm leading-6 text-white/75">Acessos a www.pedidoprime.com.br por dispositivo, navegador e localização aproximada. Estes indicadores são globais e não mudam com a empresa selecionada.</p></div>
      <div className="shrink-0"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/60">Período analisado</p><div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-black/10 p-1.5">{periods.map((p) => <button type="button" key={p.id} onClick={() => { setDays(p.id); setPage(1); }} className={`!min-h-10 !rounded-xl !border-0 !px-4 !py-2 !text-xs !font-extrabold !shadow-none transition ${days === p.id ? "!bg-[#F38525] !text-[#012E46]" : "!bg-white/10 !text-white hover:!bg-white/20"}`} aria-pressed={days === p.id}>{p.label}</button>)}</div></div>
    </header>
    <section className="rounded-2xl border border-[#DDE4E8] bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_180px_auto]">
        <label className="relative"><span className="sr-only">Buscar em todos os dados</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#637985]" /><input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Buscar IP, cidade, dispositivo, navegador, resolução…" className="h-11 w-full rounded-xl border border-[#DDE4E8] bg-[#FAFBFB] pl-10 pr-3 text-sm text-[#012E46] outline-none focus:border-[#F38525] focus:ring-2 focus:ring-[#F38525]/15" /></label>
        <select value={device} onChange={(e) => { setDevice(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#DDE4E8] bg-white px-3 text-sm font-semibold text-[#334E5B]"><option value="">Todos os dispositivos</option>{(data?.filterOptions?.devices || []).map((v) => <option key={v}>{v}</option>)}</select>
        <select value={browser} onChange={(e) => { setBrowser(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#DDE4E8] bg-white px-3 text-sm font-semibold text-[#334E5B]"><option value="">Todos os navegadores</option>{(data?.filterOptions?.browsers || []).map((v) => <option key={v}>{v}</option>)}</select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-11 rounded-xl border border-[#DDE4E8] bg-white px-3 text-sm font-semibold text-[#334E5B]"><option value="">Todos os status</option><option value="active">Em andamento</option><option value="finished">Finalizados</option></select>
        <div className="flex gap-2"><button type="button" onClick={clearFilters} title="Limpar filtros" className="!flex !h-11 !w-11 !items-center !justify-center !rounded-xl !border !border-[#DDE4E8] !bg-white !p-0 !text-[#012E46]"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={exportCsv} className="!flex !h-11 !items-center !gap-2 !rounded-xl !border-0 !bg-[#012E46] !px-4 !py-0 !text-xs !font-bold !text-white"><Download className="h-4 w-4" />CSV</button></div>
      </div>
      <p className="mt-2 text-[11px] text-[#637985]">A busca considera todos os registros do período e todos os campos técnicos, antes da paginação.</p>
    </section>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><p>Não foi possível carregar a audiência.</p><p className="mt-1 font-normal">{error}</p><button type="button" onClick={load} className="mt-3 !rounded-xl !bg-[#012E46] !px-4 !py-2 !text-xs !font-bold !text-white">Tentar novamente</button></div> : null}
    {loading ? <div className="rounded-2xl bg-white p-8 text-center text-[#637985]">Carregando indicadores…</div> : data ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Eye} label="Visualizações" value={data.total} help="Resultados no filtro atual" /><Metric icon={Activity} label="Ativos agora" value={data.activeNow} help="Sessões com sinal nos últimos 45s" /><Metric icon={Clock3} label="Permanência média" value={duration(data.averageDuration)} help="Tempo médio por sessão" /><Metric icon={UserRoundCheck} label="Visitantes recorrentes" value={data.returningVisitors} help="Mais de um acesso no período" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Users} label="Visitantes únicos" value={data.unique} help="Navegadores identificados" /><Metric icon={CalendarDays} label="Sessões" value={data.sessions} help="Sessões no resultado" /><Metric icon={MonitorSmartphone} label="Dispositivos" value={data.devices?.length} help="Categorias identificadas" /><Metric icon={Eye} label="Acessos rápidos" value={data.shortSessions} help="Permanência de até 10 segundos" /></div>
      <section className="rounded-2xl border border-[#DDE4E8] bg-white p-4"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#F38525]" /><h3 className="font-black text-[#012E46]">Visualizações por dia</h3></div>{data.byDay.length ? <div className="mt-5 flex h-44 items-end gap-1.5">{data.byDay.map((r) => <div key={r.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${r.date}: ${r.value}`}><span className="hidden text-[9px] font-bold text-[#012E46] group-hover:block">{r.value}</span><div className="w-full rounded-t bg-[#F38525]" style={{ height: `${Math.max(4, r.value / peak * 100)}%` }} /><span className="hidden text-[8px] text-[#637985] md:block">{r.date.slice(5)}</span></div>)}</div> : <div className="mt-4 rounded-xl bg-[#F4F6F7] p-8 text-center text-sm text-[#637985]">As visualizações aparecerão aqui conforme novos acessos forem registrados.</div>}</section>
      <div className="grid gap-4 lg:grid-cols-4"><Ranking title="Dispositivos" rows={data.devices} /><Ranking title="Navegadores" rows={data.browsers} /><Ranking title="Localizações" rows={data.locations} /><Ranking title="Acessos por IP" rows={data.ips} /></div>
      <section className="overflow-hidden rounded-2xl border border-[#DDE4E8] bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7ECEF] p-4"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-[#F38525]" /><h3 className="font-black text-[#012E46]">Acessos recentes</h3></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Atualização automática · 10s</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-xs"><thead className="bg-[#F4F6F7] uppercase tracking-wide text-[#637985]"><tr><th className="p-3">Início</th><th>Fim</th><th>Permanência</th><th>Localização</th><th>IP</th><th>Dispositivo</th><th>Navegador</th><th>Resolução</th><th aria-label="Ações" /></tr></thead><tbody>{data.visits.map((v) => <tr key={v.id} className="border-t border-[#EEF2F4] hover:bg-[#FAFBFB]"><td className="p-3">{dt(v.started_at || v.created_at)}</td><td>{v.ended_at ? dt(v.ended_at) : <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Em andamento</span>}</td><td><span className="inline-flex items-center gap-1 font-bold text-[#012E46]"><Clock3 className="h-3.5 w-3.5 text-[#F38525]" />{duration(v.duration_seconds)}</span></td><td>{[v.city, v.state, v.country].filter(Boolean).join(" / ") || "—"}</td><td className="font-mono">{v.ip_address || "—"}</td><td>{v.device_name || v.device_type || "—"}</td><td>{[v.browser, v.browser_version].filter(Boolean).join(" ") || "—"}</td><td>{v.screen_width && v.screen_height ? `${v.screen_width}×${v.screen_height}` : "—"}</td><td className="pr-3"><button type="button" onClick={() => removeVisit(v)} title="Excluir registro" className="!flex !h-8 !w-8 !items-center !justify-center !rounded-lg !border !border-red-200 !bg-red-50 !p-0 !text-red-600 hover:!bg-red-100"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div><footer className="flex flex-col items-center justify-between gap-3 border-t border-[#E7ECEF] px-4 py-3 sm:flex-row"><p className="text-xs text-[#637985]">Página {data.page} de {data.totalPages} · 10 registros por página</p><div className="flex gap-2"><button type="button" disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="!rounded-lg !border !border-[#DDE4E8] !bg-white !px-3 !py-2 !text-xs !font-bold !text-[#012E46] disabled:!opacity-40">Anterior</button><button type="button" disabled={data.page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="!rounded-lg !border-0 !bg-[#012E46] !px-3 !py-2 !text-xs !font-bold !text-white disabled:!opacity-40">Próxima</button></div></footer></section>
      <p className="text-xs text-[#637985]">A localização é aproximada e fornecida pela infraestrutura de rede; não utiliza GPS. IP e identificadores devem seguir a política de privacidade e retenção do Pedido Prime.</p>
    </> : null}
  </div>;
}
