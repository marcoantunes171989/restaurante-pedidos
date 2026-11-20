// O último "Testar conexão" bem-sucedido fica guardado no navegador por 12 h, para o passo do assistente
// "Ativar nota fiscal" não voltar a pendente quando a página é recarregada. Não guarda segredo nenhum.

export const VALIDADE_TESTE_MS = 12 * 60 * 60 * 1000;
const chaveTeste = (lojaId) => `pp-fiscal-teste-conexao:${lojaId}`;

export function lerTesteSalvo(lojaId, agora = Date.now()) {
  try {
    const t = JSON.parse(window.localStorage.getItem(chaveTeste(lojaId)) || "null");
    return t && t.ok === true && agora - Number(t.em) < VALIDADE_TESTE_MS ? { ok: true, modelo: t.modelo } : null;
  } catch { return null; }
}

export function salvarTeste(lojaId, t) {
  try {
    if (t?.ok) window.localStorage.setItem(chaveTeste(lojaId), JSON.stringify({ ok: true, modelo: t.modelo, em: Date.now() }));
    else window.localStorage.removeItem(chaveTeste(lojaId));
  } catch { /* navegador sem armazenamento: o teste só vale nesta tela */ }
}
