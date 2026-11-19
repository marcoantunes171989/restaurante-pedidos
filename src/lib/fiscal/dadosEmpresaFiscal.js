// ════════════════════════════════════════════════════════════
//  Tela "Dados da Empresa" (etapa 4) — só monta a leitura dos dados do emitente.
//  Não grava nada: a edição continua no cadastro da empresa (mesmas validações).
// ════════════════════════════════════════════════════════════

import { rotuloCrt, rotuloAmbienteNfce, normalizarDocumentoFiscal, avisoInscricaoEstadual } from "../emitenteFiscalService.js";
import { usosDoCampo } from "./camposCadastro.js";
import { mascaraDocumentoFiscal, mascaraCep, mascaraTelefone, mascaraCnae } from "../masks.js";

const vazio = (v) => v == null || String(v).trim() === "";
const sim = (b) => (b ? "Sim" : "Não");

/**
 * @param {object|null} e  emitente (dbParaEmitente)
 * @param {string} documento  CNPJ/CPF da loja (tab_lojas.documento)
 * @returns {Array<{ id:string, titulo:string, aba:string, campos:Array<{ rotulo:string, valor:string, faltando:boolean }> }>}
 *   `aba` = aba do cadastro da empresa onde o campo é editado. Campo pode ter `aviso` (não bloqueia).
 */
export function secoesDadosFiscais(e, documento = "") {
  const x = e || {};
  const doc = normalizarDocumentoFiscal(documento);
  const campo = (rotulo, valor, obrigatorio = false, aviso = "", chave = "") => ({ rotulo, valor: vazio(valor) ? "Não informado" : String(valor), faltando: obrigatorio && vazio(valor), usos: usosDoCampo(chave), ...(aviso ? { aviso } : {}) });
  const enderecoLinha = [x.logradouro, x.numero && `nº ${x.numero}`, x.complemento, x.bairro].filter((p) => !vazio(p)).join(", ");
  return [
    { id: "empresa", titulo: "Empresa", aba: "empresa", campos: [
      campo("Razão social", x.razaoSocial, true, "", "razaoSocial"),
      campo("Nome fantasia", x.nomeFantasia, false, "", "nomeFantasia"),
      campo("CNPJ / CPF", doc ? mascaraDocumentoFiscal(doc) : "", true, "", "documento"),
      campo("Inscrição estadual", x.inscricaoEstadual, true, avisoInscricaoEstadual(x.uf, x.inscricaoEstadual), "inscricaoEstadual"),
      campo("Inscrição municipal", x.inscricaoMunicipal, false, "", "inscricaoMunicipal"),
      campo("CNAE principal", x.cnaePrincipal ? mascaraCnae(x.cnaePrincipal) : "", false, "", "cnaePrincipal"),
      campo("Segmento", x.segmento, false, "", "segmento"),
    ] },
    { id: "regime", titulo: "Regime tributário", aba: "fiscal", campos: [
      campo("Regime (CRT)", rotuloCrt(x.crt), true, "", "crt"),
    ] },
    { id: "endereco", titulo: "Endereço e contato", aba: "endereco", campos: [
      campo("Endereço", enderecoLinha, true, "", "logradouro"),
      campo("CEP", x.cep ? mascaraCep(x.cep) : "", true, "", "cep"),
      campo("Município", x.municipio, true, "", "municipio"),
      campo("Código IBGE do município", x.codigoMunicipioIbge, true, "", "codigoMunicipioIbge"),
      campo("UF", x.uf, true, "", "uf"),
      campo("Telefone", x.telefoneFiscal ? mascaraTelefone(x.telefoneFiscal) : "", false, "", "telefoneFiscal"),
      campo("E-mail", x.emailFiscal, false, "", "emailFiscal"),
    ] },
    { id: "documentos", titulo: "NF-e e NFC-e", aba: "documentos", campos: [
      campo("NFC-e habilitada", sim(x.nfceHabilitada)),
      campo("NF-e habilitada", sim(x.nfeHabilitada)),
      campo("Ambiente da emissão", rotuloAmbienteNfce(x.nfceAmbiente)),
      campo("Série da NFC-e", x.nfceSerie, false, "", "nfceSerie"),
    ] },
  ];
}

/** Quantos campos obrigatórios estão faltando (para o resumo do topo). */
export function totalFaltando(secoes = []) {
  return secoes.reduce((n, s) => n + s.campos.filter((c) => c.faltando).length, 0);
}
