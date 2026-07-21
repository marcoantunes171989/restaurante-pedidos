import { useEffect, useState } from "react";

// Conectividade real do dispositivo (API nativa do navegador, não um
// dado inventado) — usado pelos badges "Operação em tempo real" da
// Central Operacional (src/pages/OperationalCentral.jsx) e de Pedidos
// (src/components/orders/OrdersHeader.jsx): só acende quando o aparelho
// realmente está online, e cai para "offline" de verdade se a rede cair
// em campo (Wi-Fi da loja, 4G etc.).
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}
