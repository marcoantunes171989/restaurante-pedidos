import { useCallback, useEffect, useState } from "react";
import { PARAMETROS_PADRAO, buscarParametrosCaixa } from "../lib/parametrosCaixa";
import { lerConfigTaxaServico } from "../pages/pdv/pdvHelpers";

// Enquanto o banco não responde (ou ainda não tem a migration 218), vale o que o aparelho já usava.
const doAparelho = (lojaId) => ({ ...PARAMETROS_PADRAO, taxaServico: lerConfigTaxaServico(lojaId) });

/** Parâmetros do caixa da empresa. `doServidor` diz se o que está valendo veio do banco. */
export function useParametrosCaixa(supabase, lojaId) {
  const [estado, setEstado] = useState({ lojaId: null, parametros: null });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    buscarParametrosCaixa(supabase, lojaId)
      .then((p) => { if (ativo) setEstado({ lojaId, parametros: p }); })
      .catch(() => { /* mantém o que já vale; o servidor confere de novo no fechamento */ });
    return () => { ativo = false; };
  }, [supabase, lojaId, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const doServidor = estado.lojaId === lojaId && !!estado.parametros;
  return { parametros: doServidor ? estado.parametros : doAparelho(lojaId), doServidor, recarregar };
}
