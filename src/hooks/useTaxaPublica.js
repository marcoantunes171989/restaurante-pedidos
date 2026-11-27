import { useEffect, useState } from "react";
import { PERCENTUAL_PADRAO, buscarTaxaPublica } from "../lib/parametrosCaixa";

/**
 * Percentual da taxa de serviço da empresa para as telas sem login. Vale o padrão enquanto o banco não responde (ou não
 * tem a migration 219). `gatilho` relê quando muda (ex.: o cliente abre a conta).
 */
export function useTaxaPublica(supabase, lojaId, gatilho = null) {
  const [estado, setEstado] = useState({ lojaId: null, percentual: null });

  useEffect(() => {
    let ativo = true;
    buscarTaxaPublica(supabase, lojaId)
      .then((percentual) => { if (ativo && percentual !== null) setEstado({ lojaId, percentual }); })
      .catch(() => { /* mantém o que já vale; quem cobra é o caixa, conferido no servidor */ });
    return () => { ativo = false; };
  }, [supabase, lojaId, gatilho]);

  return estado.lojaId === lojaId && estado.percentual !== null ? estado.percentual : PERCENTUAL_PADRAO;
}
