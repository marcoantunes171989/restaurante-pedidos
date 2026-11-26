import { formatCurrency } from "./pdvHelpers";

/**
 * Estado da barra inferior do PDV (funções puras, testáveis):
 *   sem conta → "Escolha uma conta"; passo 1 → "Receber R$ …"; passo 2 → "Falta R$ …" / "Continuar para fechar"; passo 3 → "Fechar conta e imprimir NFC-e".
 */
export function acaoPrincipal({ temConta, passo, temItens, restante, podeFechar, total, emiteNota, nfe = false, balcao = false }) {
  if (!temConta) return { texto: "Escolha uma conta", desabilitado: true, tom: "neutro", acao: null };
  if (passo === 0) return { texto: `Receber ${formatCurrency(total)}`, desabilitado: !temItens, tom: "laranja", acao: "receber" };
  if (passo === 1) {
    return restante > 0.001
      ? { texto: `Falta ${formatCurrency(restante)}`, desabilitado: true, tom: "neutro", acao: null }
      : { texto: "Continuar para fechar", desabilitado: !podeFechar, tom: "verde", acao: "continuar" };
  }
  // `nfe`: o operador escolheu o botão NF-e (para a empresa). A NF-e não imprime sozinha (só a NFC-e): o DANFE abre pelo botão do aviso.
  const comNota = nfe ? "Fechar conta e emitir NF-e" : "Fechar conta e imprimir NFC-e";
  return { texto: balcao ? "Fechar venda balcão (sem nota)" : emiteNota ? comNota : "Fechar conta", desabilitado: !podeFechar, tom: "verde", acao: "fechar" };
}

export function frasePasso({ temConta, passo, temItens, restante }) {
  if (!temConta) return { negrito: "Passo 1:", texto: "toque em uma mesa para abrir ou continuar a conta." };
  if (passo === 0) return temItens
    ? { negrito: "Passo 1 de 3:", texto: "confira os produtos. Precisa de algo mais? Aperte * para as funções." }
    : { negrito: "Passo 1 de 3:", texto: "a conta está vazia. Toque em Incluir produto." };
  if (passo === 1) return restante > 0.001
    ? { negrito: "Passo 2 de 3:", texto: `escolha a forma, digite o valor e toque em OK. Falta ${formatCurrency(restante)}.` }
    : { negrito: "Passo 2 de 3:", texto: "pagamento completo. Continue para fechar." };
  return { negrito: "Passo 3 de 3:", texto: "confira e feche a conta." };
}
