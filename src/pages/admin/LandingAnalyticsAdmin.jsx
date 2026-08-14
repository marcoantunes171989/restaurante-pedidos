import { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarDays, Eye, MapPin, MonitorSmartphone, Users } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const periods = [{ id: 7, label: "7 dias" }, { id: 30, label: "30 dias" }, { id: 90, label: "90 dias" }];
const fmt = (v) => new Intl.NumberFormat("pt-BR").format(v || 0);
const dt = (v) => v ? new Date(v).toLocaleString("pt-BR") : "—";

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
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth?.session?.access_token;
      if (!token) throw new Error("Faça login novamente.");
      const from = new Date(Date.now() - days * 86400000).toISOString();
      const response = await fetch(`/api/landing-analytics?from=${encodeURIComponent(from)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Falha ao carregar métricas.");
      setData(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  const peak = Math.max(...(data?.byDay || []).map((r) => r.value), 1);
  return <div className="space-y-5 pb-8">
    <header className="flex flex-col justify-between gap-5 rounded-3xl bg-[#012E46] p-5 text-white shadow-[0_18px_42px_-28px_rgba(1,46,70,.9)] sm:p-6 lg:flex-row lg:items-center">
      <div className="max-w-3xl"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[.18em] text-[#F38525]">Super Admin</p><span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Visão global</span></div><h1 className="mt-2 text-2xl font-black sm:text-3xl">Audiência da landing page</h1><p className="mt-2 text-sm leading-6 text-white/75">Acessos a www.pedidoprime.com.br por dispositivo, navegador e localização aproximada. Estes indicadores são globais e não mudam com a empresa selecionada.</p></div>
      <div className="shrink-0"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/60">Período analisado</p><div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/15 bg-black/10 p-1.5">{periods.map((p) => <button type="button" key={p.id} onClick={() => setDays(p.id)} className={`!min-h-10 !rounded-xl !border-0 !px-4 !py-2 !text-xs !font-extrabold !shadow-none transition ${days === p.id ? "!bg-[#F38525] !text-[#012E46]" : "!bg-white/10 !text-white hover:!bg-white/20"}`} aria-pressed={days === p.id}>{p.label}</button>)}</div></div>
    </header>
    {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><p>Não foi possível carregar a audiência.</p><p className="mt-1 font-normal">{error}</p><button type="button" onClick={load} className="mt-3 !rounded-xl !bg-[#012E46] !px-4 !py-2 !text-xs !font-bold !text-white">Tentar novamente</button></div> : null}
    {loading ? <div className="rounded-2xl bg-white p-8 text-center text-[#637985]">Carregando indicadores…</div> : data ? <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={Eye} label="Visualizações" value={data.total} help="Carregamentos registrados" /><Metric icon={Users} label="Visitantes" value={data.unique} help="Navegadores únicos" /><Metric icon={CalendarDays} label="Sessões" value={data.sessions} help="Sessões de navegação" /><Metric icon={MonitorSmartphone} label="Dispositivos" value={data.devices?.length} help="Categorias identificadas" /></div>
      <section className="rounded-2xl border border-[#DDE4E8] bg-white p-4"><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#F38525]" /><h3 className="font-black text-[#012E46]">Visualizações por dia</h3></div>{data.byDay.length ? <div className="mt-5 flex h-44 items-end gap-1.5">{data.byDay.map((r) => <div key={r.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${r.date}: ${r.value}`}><span className="hidden text-[9px] font-bold text-[#012E46] group-hover:block">{r.value}</span><div className="w-full rounded-t bg-[#F38525]" style={{ height: `${Math.max(4, r.value / peak * 100)}%` }} /><span className="hidden text-[8px] text-[#637985] md:block">{r.date.slice(5)}</span></div>)}</div> : <div className="mt-4 rounded-xl bg-[#F4F6F7] p-8 text-center text-sm text-[#637985]">As visualizações aparecerão aqui conforme novos acessos forem registrados.</div>}</section>
      <div className="grid gap-4 lg:grid-cols-3"><Ranking title="Dispositivos" rows={data.devices} /><Ranking title="Navegadores" rows={data.browsers} /><Ranking title="Localizações" rows={data.locations} /></div>
      <section className="overflow-hidden rounded-2xl border border-[#DDE4E8] bg-white"><div className="flex items-center gap-2 border-b border-[#E7ECEF] p-4"><MapPin className="h-5 w-5 text-[#F38525]" /><h3 className="font-black text-[#012E46]">Acessos recentes</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[#F4F6F7] uppercase tracking-wide text-[#637985]"><tr><th className="p-3">Data</th><th>Localização</th><th>IP</th><th>Dispositivo</th><th>Navegador</th><th>Resolução</th></tr></thead><tbody>{data.visits.map((v) => <tr key={v.id} className="border-t border-[#EEF2F4]"><td className="p-3">{dt(v.created_at)}</td><td>{[v.city, v.state, v.country].filter(Boolean).join(" / ") || "—"}</td><td className="font-mono">{v.ip_address || "—"}</td><td>{v.device_name || v.device_type || "—"}</td><td>{[v.browser, v.browser_version].filter(Boolean).join(" ") || "—"}</td><td>{v.screen_width && v.screen_height ? `${v.screen_width}×${v.screen_height}` : "—"}</td></tr>)}</tbody></table></div></section>
      <p className="text-xs text-[#637985]">A localização é aproximada e fornecida pela infraestrutura de rede; não utiliza GPS. IP e identificadores devem seguir a política de privacidade e retenção do Pedido Prime.</p>
    </> : null}
  </div>;
}
