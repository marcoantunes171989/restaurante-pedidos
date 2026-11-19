// ════════════════════════════════════════════════════════════
//  Mapa de OBRIGATORIEDADE dos campos do cadastro da empresa.
//  Para cada campo diz se é obrigatório na NFC-e (mod. 65), na NF-e (mod. 55) e se é usado
//  na análise gerencial (relatórios, identidade, segmentação). Fonte da verdade do que o
//  formulário e a tela Dados da Empresa destacam, para não haver divergência com a emissão.
//
//  Base do "obrigatório": o XSD oficial (leiaute 4.00) exige no emitente xNome, CNPJ, CRT e o
//  endereço completo (xLgr, nro, xBairro, cMun, xMun, UF, CEP); a IE é exigida pela regra de
//  negócio da SEFAZ (ou "ISENTO"). São opcionais: xFant, IM, CNAE (só com IM), complemento e fone.
//  Os obrigatórios aqui DERIVAM do validador da emissão (chavesPendentesNfce): se ele mudar, o
//  destaque muda junto; um teste confere.
// ════════════════════════════════════════════════════════════

import { chavesPendentesNfce } from "../emitenteFiscalService.js";

/** @typedef {{ chave:string, rotulo:string, aba:string, nfce:boolean, nfe:boolean, gerencial:boolean, motivo:string }} CampoCadastro */

/** @type {CampoCadastro[]} */
export const CAMPOS_CADASTRO = [
  // Empresa
  { chave: "nome", rotulo: "Nome da empresa", aba: "empresa", nfce: false, nfe: false, gerencial: true, motivo: "Identifica a empresa no sistema, em relatórios, tablet e comandas." },
  { chave: "razaoSocial", rotulo: "Razão Social", aba: "empresa", nfce: true, nfe: true, gerencial: true, motivo: "Nome do emitente na nota (xNome) e nos relatórios." },
  { chave: "nomeFantasia", rotulo: "Nome Fantasia", aba: "empresa", nfce: false, nfe: false, gerencial: true, motivo: "Opcional na nota (xFant); usado como nome comercial nos relatórios." },
  { chave: "documento", rotulo: "CNPJ/CPF", aba: "empresa", nfce: true, nfe: true, gerencial: true, motivo: "Identifica o emitente na nota; chave de conferência com o certificado." },
  { chave: "inscricaoEstadual", rotulo: "Inscrição Estadual", aba: "empresa", nfce: true, nfe: true, gerencial: false, motivo: "A SEFAZ rejeita a nota de contribuinte sem IE válida (ou ISENTO)." },
  { chave: "inscricaoMunicipal", rotulo: "Inscrição Municipal", aba: "empresa", nfce: false, nfe: false, gerencial: false, motivo: "Opcional na nota; só necessária se informar o CNAE." },
  { chave: "cnaePrincipal", rotulo: "CNAE Principal", aba: "empresa", nfce: false, nfe: false, gerencial: true, motivo: "Opcional na nota; classifica a atividade nas análises." },
  { chave: "segmento", rotulo: "Segmento", aba: "empresa", nfce: false, nfe: false, gerencial: true, motivo: "Sugere regras fiscais e agrupa a empresa nas análises por segmento." },
  // Fiscal
  { chave: "crt", rotulo: "Regime Tributário (CRT)", aba: "fiscal", nfce: true, nfe: true, gerencial: true, motivo: "Define como o ICMS é informado (CSOSN ou CST); erro aqui rejeita a nota." },
  // Endereço e contato
  { chave: "cep", rotulo: "CEP", aba: "endereco", nfce: true, nfe: true, gerencial: false, motivo: "Parte obrigatória do endereço do emitente." },
  { chave: "uf", rotulo: "UF", aba: "endereco", nfce: true, nfe: true, gerencial: true, motivo: "Define a SEFAZ que autoriza a nota e a tabela de tributos." },
  { chave: "logradouro", rotulo: "Logradouro", aba: "endereco", nfce: true, nfe: true, gerencial: false, motivo: "Endereço do emitente na nota." },
  { chave: "numero", rotulo: "Número", aba: "endereco", nfce: true, nfe: true, gerencial: false, motivo: "Endereço do emitente na nota (use S/N se não houver)." },
  { chave: "complemento", rotulo: "Complemento", aba: "endereco", nfce: false, nfe: false, gerencial: false, motivo: "Opcional na nota; complementa o endereço." },
  { chave: "bairro", rotulo: "Bairro", aba: "endereco", nfce: true, nfe: true, gerencial: false, motivo: "Endereço do emitente na nota." },
  { chave: "municipio", rotulo: "Município", aba: "endereco", nfce: true, nfe: true, gerencial: true, motivo: "Endereço do emitente na nota; praça da empresa nas análises." },
  { chave: "codigoMunicipioIbge", rotulo: "Código IBGE do Município", aba: "endereco", nfce: true, nfe: true, gerencial: false, motivo: "Código de 7 dígitos (cMun); se divergir do município, a SEFAZ rejeita." },
  { chave: "telefoneFiscal", rotulo: "Telefone", aba: "endereco", nfce: false, nfe: false, gerencial: true, motivo: "Opcional na nota; contato da empresa." },
  { chave: "emailFiscal", rotulo: "E-mail fiscal", aba: "endereco", nfce: false, nfe: false, gerencial: true, motivo: "Opcional na nota; contato e envio de documentos." },
  // NF-e / NFC-e
  { chave: "nfceSerie", rotulo: "Série da NFC-e", aba: "documentos", nfce: true, nfe: false, gerencial: false, motivo: "Série da numeração da NFC-e (1 a 999)." },
  // Operação
  { chave: "prefixo", rotulo: "Prefixo da comanda", aba: "operacao", nfce: false, nfe: false, gerencial: true, motivo: "Identifica as comandas da empresa nos relatórios." },
];

const POR_CHAVE = new Map(CAMPOS_CADASTRO.map((c) => [c.chave, c]));
export const metaCampo = (chave) => POR_CHAVE.get(chave) || null;

const vazio = (v) => v == null || String(v).trim() === "";

/**
 * O que falta, por tipo de uso.
 * @param {object} form        valores do cadastro (como no formulário)
 * @param {string} documento   CNPJ/CPF normalizado
 * @returns {{ nfce:string[], nfe:string[], gerencial:string[], obrigatorios:string[] }}  listas de CHAVES
 *   `obrigatorios` = união de NFC-e e NF-e; `gerencial` = campos de análise ainda em branco.
 */
export function camposFaltando(form = {}, documento = "") {
  const base = chavesPendentesNfce(form, documento);          // mesma regra da emissão
  const nfce = base;
  const nfe = base.filter((k) => metaCampo(k)?.nfe);           // a série é só da NFC-e
  const valores = { ...form, documento };
  const gerencial = CAMPOS_CADASTRO
    .filter((c) => c.gerencial && vazio(valores[c.chave]))
    .map((c) => c.chave);
  return { nfce, nfe, gerencial, obrigatorios: [...new Set([...nfce, ...nfe])] };
}

/** Chips de um campo: quais usos ele atende (para o rótulo do formulário). */
export function usosDoCampo(chave) {
  const m = metaCampo(chave);
  if (!m) return [];
  return [m.nfce && "NFC-e", m.nfe && "NF-e", m.gerencial && "Gerencial"].filter(Boolean);
}
