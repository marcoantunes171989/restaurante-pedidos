// ════════════════════════════════════════════════════════════
//  Emissor: envia UMA nota assinada à SEFAZ (síncrono) e devolve a
//  situação final. Se a resposta não vier (tempo esgotado / resposta
//  estranha) ou vier "duplicidade", CONSULTA pela chave antes de qualquer
//  reenvio — nunca emite duas vezes a mesma venda.
// ════════════════════════════════════════════════════════════

import { enviarSoap, enderecoServico } from "./transporte.js";
import { montarConsStatServ, montarConsSitNFe, montarEnviNFeSincrono, montarProcNFe, lerRetorno, interpretarAutorizacao, interpretarConsulta, interpretarStatus } from "./mensagens.js";
import { validarMensagemXsd } from "../validarXsd.js";

const TPAMB = { producao: 1, homologacao: 2 };
const COD_UF = { SP: "35" };

function contexto({ uf, modelo, ambiente, pfx, senha, ca, timeoutMs, enviar = enviarSoap, endereco = enderecoServico }) {
  if (!TPAMB[ambiente]) throw new Error("Ambiente inválido.");
  if (!COD_UF[uf]) throw new Error(`UF ${uf} ainda não configurada no emissor.`);
  const chamar = (servicoTabela, servicoWsdl, dados) =>
    enviar({ url: endereco({ uf, modelo, ambiente, servico: servicoTabela }), servico: servicoWsdl, dados, pfx, senha, ca, timeoutMs });
  return { tpAmb: TPAMB[ambiente], cUF: COD_UF[uf], chamar };
}

/** Status do serviço (teste de conexão da tela). */
export async function statusServico(o) {
  const c = contexto(o);
  const r = await c.chamar("StatusServico", "NFeStatusServico4", montarConsStatServ({ tpAmb: c.tpAmb, cUF: c.cUF }));
  if (!r.ok) return { operando: false, code: r.code, erro: r.erro };
  return interpretarStatus(lerRetorno(r.xml));
}

/** Consulta pela chave. */
export async function consultarNota({ chNFe, ...o }) {
  const c = contexto(o);
  const r = await c.chamar("ConsultaProtocolo", "NFeConsultaProtocolo4", montarConsSitNFe({ tpAmb: c.tpAmb, chNFe }));
  if (!r.ok) return { situacao: "indisponivel", code: r.code, erro: r.erro };
  return interpretarConsulta(lerRetorno(r.xml));
}

/**
 * @returns {Promise<{situacao:'autorizada'|'rejeitada'|'indisponivel'|'incerta', cStat?, xMotivo?, nProt?, procNFe?, consultou?:boolean}>}
 */
export async function emitirNaSefaz({ nfeAssinada, chNFe, idLote, ...o }) {
  const c = contexto(o);
  const envio = montarEnviNFeSincrono({ idLote, nfeAssinada });
  const v = await validarMensagemXsd(envio, "enviNFe");
  if (!v.valido) return { situacao: "rejeitada", cStat: null, xMotivo: `Nota fora do leiaute oficial: ${v.erros[0]}`, local: true };

  const r = await c.chamar("Autorizacao", "NFeAutorizacao4", envio);
  let res;
  if (r.ok) res = interpretarAutorizacao(lerRetorno(r.xml));
  else res = r.incerto ? { situacao: "incerta", code: r.code, xMotivo: r.erro } : { situacao: "indisponivel", code: r.code, xMotivo: r.erro };

  if (res.situacao === "incerta" || res.situacao === "consultar") {
    const q = await consultarNota({ chNFe, ...o });
    if (q.situacao === "autorizada") res = { ...q, consultou: true };
    else if (q.situacao === "nao_encontrada") res = { situacao: "indisponivel", consultou: true, cStat: q.cStat, xMotivo: "A SEFAZ não recebeu a nota. Pode reenviar com segurança." };
    else res = { situacao: "incerta", consultou: true, cStat: q.cStat ?? null, xMotivo: q.xMotivo || q.erro || "Situação não confirmada. Consulte novamente antes de reenviar." };
  }
  if (res.situacao === "autorizada") res.procNFe = montarProcNFe({ nfeAssinada, protNFeXml: res.protNFeXml });
  return res;
}
