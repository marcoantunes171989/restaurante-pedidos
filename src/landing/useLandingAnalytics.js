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
    const device = coletarInfoDispositivo();
    const payload = {
      visitorId: stableId(localStorage, "pp_landing_visitor"),
      sessionId: stableId(sessionStorage, "pp_landing_session"),
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      deviceType: device.deviceType, deviceName: device.deviceName,
      os: device.os, browser: device.browser, browserVersion: device.browserVersion,
      screenWidth: window.screen?.width, screenHeight: window.screen?.height,
      language: navigator.language,
    };
    fetch("/api/landing-analytics", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(payload), keepalive: true,
    }).catch(() => {});
  }, []);
}
