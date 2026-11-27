import { useEffect, useMemo, useState } from "react";
import { anotarCobranca, buscarValoresCobrados, distribuirPagamentos } from "../lib/valoresCobrados";

/** Pedidos do painel com o valor cobrado anotado. `percentualAberto` null = não recalcula pedidos em aberto. */
export function useCobranca(supabase, pedidos, lojaId, percentualAberto = null) {
  const [estado, setEstado] = useState({ lojaId: null, composicoes: [] });
  const pagos = (pedidos || []).reduce((n, o) => n + (o.paymentStatus === "paid" ? 1 : 0), 0); // venda nova → relê

  useEffect(() => {
    let ativo = true;
    buscarValoresCobrados(supabase, lojaId)
      .then((composicoes) => { if (ativo && composicoes) setEstado({ lojaId, composicoes }); })
      .catch(() => { /* sem permissão ou sem rede: os relatórios seguem com o cálculo anterior */ });
    return () => { ativo = false; };
  }, [supabase, lojaId, pagos]);

  return useMemo(() => {
    const composicoes = estado.lojaId === lojaId ? estado.composicoes : [];
    return anotarCobranca(pedidos, distribuirPagamentos(composicoes, pedidos), percentualAberto);
  }, [pedidos, estado, lojaId, percentualAberto]);
}
