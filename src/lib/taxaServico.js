// Taxa de serviço (10%) só vale para consumo no local. Pedido externo de
// retirada ou entrega não tem atendimento de salão: o cliente confirma no
// cardápio o valor sem a taxa, e o caixa cobra esse mesmo valor.
// O rótulo vem de CardapioPublico.enviar(): "Externo · Retirada" / "Externo · Entrega".
const SEM_TAXA = /^Externo · (Retirada|Entrega)\b/i;

export function cobraTaxaServico(mesa) {
  return !SEM_TAXA.test(String(mesa ?? "").trim());
}
