// Nome do cliente lembrado SÓ neste aparelho, por loja e telefone, para preencher o campo no próximo pedido.
// Desde a migration 216 o banco não devolve mais o nome a quem informa um telefone.
const MAXIMO = 5;
const chave = (lojaId) => `pedidoPrime:cliente:${lojaId}`;
const digitos = (telefone) => String(telefone || "").replace(/\D/g, "");

function ler(lojaId) {
  try {
    const lista = JSON.parse(localStorage.getItem(chave(lojaId)) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}

export function nomeLembrado(lojaId, telefone) {
  const tel = digitos(telefone);
  return ler(lojaId).find((c) => c?.telefone === tel)?.nome || "";
}

export function lembrarNome(lojaId, telefone, nome) {
  const tel = digitos(telefone);
  const limpo = String(nome || "").trim();
  if (!lojaId || tel.length < 10 || limpo.length < 2) return;
  const lista = [{ telefone: tel, nome: limpo }, ...ler(lojaId).filter((c) => c?.telefone !== tel)].slice(0, MAXIMO);
  try { localStorage.setItem(chave(lojaId), JSON.stringify(lista)); } catch { /* armazenamento indisponível: o cliente digita de novo */ }
}
