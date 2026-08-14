import { useEffect } from "react";
import { coletarInfoDispositivo } from "../lib/accessControl/deviceInfo.js";

function stableId(storage, key) {
  try {
    let id = storage.getItem(key);
    if (!id) { id = crypto.randomUUID(); storage.setItem(key, id); }
    return id;
  } catch { return null; }
}

export function useLandingAnalytics() {
  useEffect(() => {
    if (window.location.pathname !== "/") return;
    const dedupeKey = "pp_landing_view_sent";
    if (sessionStorage.getItem(dedupeKey) === "1") return;
    sessionStorage.setItem(dedupeKey, "1");
    const sessionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const device = coletarInfoDispositivo();
    const payload = {
      action: "start",
      visitorId: stableId(localStorage, "pp_landing_visitor"),
      sessionId,
      startedAt,
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      deviceType: device.deviceType, deviceName: device.deviceName,
      os: device.os, browser: device.browser, browserVersion: device.browserVersion,
      screenWidth: window.screen?.width, screenHeight: window.screen?.height,
      language: navigator.language,
    };
    const send = (action) => fetch("/api/landing-analytics", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(action === "start" ? payload : { sessionId, startedAt }), action }),
      keepalive: true,
    }).catch(() => {});
    send("start");
    const heartbeat = window.setInterval(() => send("heartbeat"), 15000);
    const finish = () => {
      const body = JSON.stringify({ action: "end", sessionId, startedAt });
      try { navigator.sendBeacon("/api/landing-analytics", new Blob([body], { type: "application/json" })); }
      catch { send("end"); }
    };
    window.addEventListener("pagehide", finish);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", finish);
      finish();
    };
  }, []);
}
