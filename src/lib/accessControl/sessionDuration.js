import { ACCESS_PRESENCE } from "./constants.js";

/** Classifica presença a partir de last_activity_at + status. */
export function classificarPresenca(sessao, agora = Date.now()) {
  if (!sessao) return "offline";
  if (sessao.status === "closed" || sessao.presence === "offline") {
    if (sessao.presence) return sessao.presence;
  }
  if (sessao.presence === "online" || sessao.presence === "inativo") return sessao.presence;

  const last = sessao.last_activity_at || sessao.lastActivityAt;
  if (!last) return "offline";
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return "offline";
  const delta = agora - t;
  if (sessao.status === "closed") return "offline";
  if (delta <= ACCESS_PRESENCE.ONLINE_MS) return "online";
  if (delta <= ACCESS_PRESENCE.INATIVO_MS) return "inativo";
  return "offline";
}

/** Duração humanizada: 48min | 1h 12min | 2h 18min */
export function formatarDuracao(msOuSeg, { emSegundos = false } = {}) {
  let seg = emSegundos ? Number(msOuSeg) : Math.floor(Number(msOuSeg) / 1000);
  if (!Number.isFinite(seg) || seg < 0) return "—";
  seg = Math.floor(seg);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h <= 0) return `${Math.max(1, m)}min`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

export function duracaoSessaoMs(sessao, agora = Date.now()) {
  const ini = new Date(sessao?.login_at || sessao?.loginAt || 0).getTime();
  if (!ini) return 0;
  const fim = sessao?.logout_at || sessao?.logoutAt
    ? new Date(sessao.logout_at || sessao.logoutAt).getTime()
    : agora;
  return Math.max(0, fim - ini);
}

export function formatarTempoRelativo(iso, agora = Date.now()) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const seg = Math.max(0, Math.floor((agora - t) / 1000));
  if (seg < 10) return "agora";
  if (seg < 60) return `há ${seg} segundos`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

export function formatarDataHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatarHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}
