import { useEffect, useState } from "react";
import { versaoRodando, versaoPublicada, versaoDesatualizada } from "./versaoApp.js";

/** { rodando, publicada, desatualizada }: confere ao abrir, a cada 3 min e ao voltar para a aba do navegador. */
export function useVersaoApp() {
  const rodando = versaoRodando();
  const [publicada, setPublicada] = useState(null);
  useEffect(() => {
    if (rodando === "local") return undefined;
    let vivo = true;
    const checar = async () => {
      if (document.visibilityState === "hidden") return;
      const v = await versaoPublicada();
      if (vivo && v) setPublicada(v);
    };
    checar();
    const iv = setInterval(checar, 3 * 60 * 1000);
    document.addEventListener("visibilitychange", checar);
    return () => { vivo = false; clearInterval(iv); document.removeEventListener("visibilitychange", checar); };
  }, [rodando]);
  return { rodando, publicada, desatualizada: versaoDesatualizada(rodando, publicada) };
}
