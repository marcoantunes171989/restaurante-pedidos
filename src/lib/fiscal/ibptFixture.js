// Apoio dos testes da tabela IBPT. Alíquotas FICTÍCIAS: só para testar o fluxo (não são a tabela do IBPT).
export function csvGrande(n = 1200, { fim = "31/12/2099", versao = "26.2.A" } = {}) {
  const cab = "codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;municipal;vigenciainicio;vigenciafim;chave;versao;fonte";
  const linhas = Array.from({ length: n }, (_, i) => `${String(10000000 + i)};;0;Produto ${i} (teste);13,45;15,45;18,00;0,00;01/07/2026;${fim};ABC123;${versao};IBPT/empresometro.com.br`);
  return [cab, ...linhas].join("\n");
}
