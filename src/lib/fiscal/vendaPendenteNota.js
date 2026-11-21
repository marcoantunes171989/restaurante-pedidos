// ════════════════════════════════════════════════════════════
//  Venda paga cuja NFC-e ainda não foi gerada: a fila fica NO APARELHO do caixa (localStorage).
//
//  Por quê: a nota sai em segundo plano depois do pagamento. Se o navegador atualiza a versão, recarrega, fecha ou a chamada ao
//  servidor não termina, a venda já está paga mas NENHUM número de nota foi reservado — e a tela só dizia "Emitindo nota fiscal…".
//  Agora a venda entra nesta fila antes de emitir e só sai quando a nota existe (autorizada, em contingência, ou documento
//  reservado que aparece em Notas emitidas). O aviso "Venda sem nota fiscal" oferece Emitir agora; a chave de idempotência
//  (derivada dos pedidos) garante que repetir NUNCA gera duas notas da mesma venda.
// ════════════════════════════════════════════════════════════

const CHAVE = "pp.vendasSemNota.v1";
const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias
const LIMITE = 30;

function armazenamento(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}
function ler(storage) {
  const s = armazenamento(storage);
  if (!s) return [];
  try {
    const lista = JSON.parse(s.getItem(CHAVE) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch { return []; }
}
function gravar(lista, storage) {
  const s = armazenamento(storage);
  if (!s) return false;
  try { s.setItem(CHAVE, JSON.stringify(lista.slice(-LIMITE))); return true; } catch { return false; }
}

/** Guarda a venda ANTES de emitir. `venda`: { codigo, total, mesa, pedidos, composicao, pagamento, cpf, modelo, destinatario }. */
export function guardarVendaPendente(lojaId, venda, { storage, agora = Date.now() } = {}) {
  if (lojaId == null || !venda?.codigo) return false;
  const lista = ler(storage).filter((v) => !(v.lojaId === lojaId && v.codigo === venda.codigo));
  lista.push({ ...venda, lojaId, quando: agora, estado: "emitindo", detalhe: "" });
  return gravar(lista, storage);
}

/** A nota existe (ou o documento está reservado em Notas emitidas): a venda sai da fila. */
export function removerVendaPendente(lojaId, codigo, { storage } = {}) {
  return gravar(ler(storage).filter((v) => !(v.lojaId === lojaId && v.codigo === codigo)), storage);
}

/** Registra por que ainda não saiu (estado: erro | pendente | interrompida). A venda continua na fila. */
export function marcarVendaPendente(lojaId, codigo, estado, detalhe = "", { storage } = {}) {
  const lista = ler(storage).map((v) => (v.lojaId === lojaId && v.codigo === codigo ? { ...v, estado, detalhe: String(detalhe || "").slice(0, 300) } : v));
  return gravar(lista, storage);
}

/** Vendas da loja que ainda estão sem nota, da mais antiga para a mais nova. */
export function listarVendasPendentes(lojaId, { storage, agora = Date.now() } = {}) {
  if (lojaId == null) return [];
  return ler(storage).filter((v) => v.lojaId === lojaId && agora - Number(v.quando || 0) < VALIDADE_MS).sort((a, b) => a.quando - b.quando);
}

/**
 * Quais pendentes mostrar no aviso: as que já falharam (erro/pendente) e as que ficaram "emitindo" por mais de `esperaMs`
 * (a emissão foi interrompida). A venda que está sendo emitida AGORA (recente) não aparece.
 */
export function vendasParaAvisar(lista, { agora = Date.now(), esperaMs = 120000 } = {}) {
  return (lista || []).filter((v) => v.estado !== "emitindo" || agora - Number(v.quando || 0) > esperaMs);
}

/** Resolve em `ms` com uma falha "demorou", para a emissão nunca ficar eternamente em "Emitindo…". */
export function comPrazo(promessa, ms, aoExpirar) {
  let t;
  const prazo = new Promise((resolve) => { t = setTimeout(() => resolve(aoExpirar()), ms); });
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(t));
}
