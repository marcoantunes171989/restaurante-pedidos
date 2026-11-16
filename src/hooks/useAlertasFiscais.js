// E9 parte 2: lê as notas (e o certificado, quando a pessoa pode ver) e calcula os alertas.
import { useEffect, useState } from "react";
import { listarDocumentosFiscais } from "../lib/fiscal/notasFiscais";
import { resumoCredenciaisFiscais } from "../lib/fiscal/fiscalApi";
import { alertasFiscais } from "../lib/fiscal/alertasFiscais";

const ATUALIZAR_MS = 5 * 60 * 1000;

/** Busca notas (e certificado, quando a pessoa pode ver) e devolve os alertas. */
export function useAlertasFiscais({ supabase, lojaId, ativo = true, comCertificado = true }) {
  const [alertas, setAlertas] = useState([]);
  useEffect(() => {
    if (!ativo || !supabase || lojaId == null) return undefined;
    let vivo = true;
    const ler = async () => {
      const [notas, credenciais] = await Promise.all([
        listarDocumentosFiscais(supabase, lojaId, { limite: 200 }).catch(() => []),
        comCertificado ? resumoCredenciaisFiscais(supabase, lojaId).catch(() => null) : Promise.resolve(null),
      ]);
      if (vivo) setAlertas(alertasFiscais({ notas, credenciais }));
    };
    ler();
    const timer = setInterval(ler, ATUALIZAR_MS);
    return () => { vivo = false; clearInterval(timer); };
  }, [supabase, lojaId, ativo, comCertificado]);
  return alertas;
}
