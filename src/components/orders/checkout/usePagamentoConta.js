import { useState } from "react";

/**
 * Lógica de pagamento de uma conta (múltiplas formas), compartilhada entre o
 * card do Caixa (AccountCard) e a tela PDV de fechamento (CashierCheckout).
 * Porta 1:1 as regras que já existiam inline no AccountCard — NENHUM cálculo
 * financeiro foi alterado:
 *   • subtotal = total / 1.1 (taxa de serviço de 10% calculada de trás pra
 *     frente a partir do total);
 *   • a soma das formas de pagamento tem que bater EXATAMENTE com o total
 *     (sem troco — nunca foi a regra aqui);
 *   • valores digitados são interpretados em centavos.
 *
 * `total` é o valor da conta (já com a taxa). Retorna o estado das linhas e os
 * utilitários usados pela UI.
 */
export function usePagamentoConta(total, opcoesPontos = null) {
  const [linhas, setLinhas] = useState([]);
  // Forma virtual "Pontos" (fidelidade): limitada ao R$ que o saldo cobre.
  const formaPontos = opcoesPontos?.formaPontos || "Pontos";
  const maxPontosReais = Math.max(0, Math.round((Number(opcoesPontos?.maxReais) || 0) * 100) / 100);

  const sub = Math.round((total / 1.1) * 100) / 100;
  const taxa = Math.round((total - sub) * 100) / 100;

  const soma = Math.round(linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0) * 100) / 100;
  const restante = Math.round((total - soma) * 100) / 100;
  const valido = linhas.length > 0 && linhas.every((l) => (Number(l.valor) || 0) > 0) && Math.abs(restante) < 0.01;

  const fmtMoeda = (n) => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Liga/desliga uma forma de pagamento. Ao ligar, já sugere o valor que falta
  // para fechar o total (mesmo comportamento do card).
  const toggleForma = (f) => setLinhas((cur) => {
    if (cur.some((l) => l.forma === f)) return cur.filter((l) => l.forma !== f);
    const pagoAtual = cur.reduce((s, l) => s + (Number(l.valor) || 0), 0);
    let falta = Math.max(0, Math.round((total - pagoAtual) * 100) / 100);
    if (f === formaPontos) falta = Math.min(falta, maxPontosReais); // pontos limitados ao saldo
    return [...cur, { forma: f, valor: falta }];
  });

  // Edita o valor de uma forma a partir de um texto (só dígitos → centavos).
  const editarValor = (f, raw) => setLinhas((cur) => cur.map((l) => {
    if (l.forma !== f) return l;
    let v = parseInt(String(raw).replace(/\D/g, "") || "0", 10) / 100;
    if (f === formaPontos) v = Math.min(v, maxPontosReais); // trava no saldo em pontos
    return { ...l, valor: v };
  }));

  const formaAtiva = (f) => linhas.some((l) => l.forma === f);

  return { linhas, setLinhas, sub, taxa, soma, restante, valido, fmtMoeda, toggleForma, editarValor, formaAtiva };
}

// Mesmo derivador de subtotal/taxa isolado, para quem só precisa exibir o resumo
// sem gerenciar formas de pagamento (útil em resumos read-only).
export function resumoConta(total) {
  const sub = Math.round((total / 1.1) * 100) / 100;
  const taxa = Math.round((total - sub) * 100) / 100;
  return { sub, taxa };
}
