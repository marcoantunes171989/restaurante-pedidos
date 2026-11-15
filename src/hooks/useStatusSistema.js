import { useEffect, useRef, useState } from "react";
import { buscarStatusSistema, MANUTENCAO_INTERVALO_MS, STATUS_SISTEMA_NORMAL } from "../lib/sistemaStatus";

// Consulta o aviso "Sistema em atualização" ao abrir, a cada 30 s e quando
// a janela volta ao foco. Quando a manutenção termina, o app libera sozinho.
export function useStatusSistema() {
  const [status, setStatus] = useState(STATUS_SISTEMA_NORMAL);
  const statusRef = useRef(STATUS_SISTEMA_NORMAL);

  useEffect(() => {
    let ativo = true;
    const atualizar = async () => {
      const novo = await buscarStatusSistema();
      if (!ativo) return;
      statusRef.current = novo;
      setStatus((atual) => (
        atual.emManutencao === novo.emManutencao && atual.mensagem === novo.mensagem && atual.previsaoFim === novo.previsaoFim
          ? atual
          : novo
      ));
      return novo;
    };
    atualizar();
    const iv = setInterval(atualizar, MANUTENCAO_INTERVALO_MS);
    const onVis = () => { if (document.visibilityState === "visible") atualizar(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", atualizar);
    return () => {
      ativo = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", atualizar);
    };
  }, []);

  return { status, statusRef };
}
