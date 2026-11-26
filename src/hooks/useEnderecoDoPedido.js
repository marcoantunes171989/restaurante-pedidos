// Endereço que o cliente informou no pedido de entrega (migration 207), para o caixa. null quando não há.
import { useEffect, useState } from "react";
import { buscarEnderecoDosPedidos } from "../lib/enderecoEntrega";

export function useEnderecoDoPedido(supabase, pedidos = []) {
  // Só consulta pedidos de entrega; a chave em texto evita nova busca a cada renderização.
  const chave = (pedidos || []).filter((o) => /entreg/i.test(o?.table || "")).map((o) => String(o.id)).sort().join(",");
  const [achado, setAchado] = useState({ chave: "", endereco: null });
  useEffect(() => {
    if (!chave) return undefined;
    let vivo = true;
    buscarEnderecoDosPedidos(supabase, chave.split(",")).then((endereco) => { if (vivo) setAchado({ chave, endereco }); });
    return () => { vivo = false; };
  }, [supabase, chave]);
  return chave && achado.chave === chave ? achado.endereco : null;
}
