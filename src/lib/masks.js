// ════════════════════════════════════════════════════════════
//  Máscaras visuais reutilizáveis — Pedido Prime
//
//  Só FORMATAM para exibição. O valor CANÔNICO/persistido segue a
//  normalização dos serviços (ex.: normalizarDocumentoFiscal). Para o
//  documento fiscal, NUNCA removem letras (compatível com CNPJ alfanumérico).
// ════════════════════════════════════════════════════════════

import { normalizarDocumentoFiscal } from "./emitenteFiscalService";

const soDig = (v) => String(v ?? "").replace(/\D/g, "");

// CPF: 000.000.000-00
export function mascaraCpf(v) {
  const d = soDig(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// CNPJ numérico: 00.000.000/0000-00
export function mascaraCnpj(v) {
  const d = soDig(v).slice(0, 14);
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

// CNPJ alfanumérico: XX.XXX.XXX/XXXX-XX preservando letras (14 posições).
export function mascaraCnpjAlfanumerico(v) {
  const d = normalizarDocumentoFiscal(v).slice(0, 14); // uppercase, sem formatação, letras preservadas
  let out = d.slice(0, 2);
  if (d.length > 2) out += "." + d.slice(2, 5);
  if (d.length > 5) out += "." + d.slice(5, 8);
  if (d.length > 8) out += "/" + d.slice(8, 12);
  if (d.length > 12) out += "-" + d.slice(12, 14);
  return out;
}

// Máscara dinâmica do documento fiscal: CPF (≤11 dígitos numéricos) ou CNPJ
// (numérico/alfanumérico). Não corrompe o valor — apenas formata visualmente.
export function mascaraDocumentoFiscal(v) {
  const d = normalizarDocumentoFiscal(v);
  const alfanumerico = /[A-Z]/.test(d);
  if (!alfanumerico && d.length <= 11) return mascaraCpf(d);
  return alfanumerico ? mascaraCnpjAlfanumerico(d) : mascaraCnpj(d);
}

// CEP: 00000-000
export function mascaraCep(v) {
  const d = soDig(v).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

// Telefone BR: (00) 0000-0000 (10 díg.) ou (00) 00000-0000 (11 díg.)
export function mascaraTelefone(v) {
  const d = soDig(v).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

// CNAE: 0000-0/00
export function mascaraCnae(v) {
  const d = soDig(v).slice(0, 7);
  return d
    .replace(/(\d{4})(\d)/, "$1-$2")
    .replace(/(\d{4}-\d{1})(\d{1,2})$/, "$1/$2");
}
