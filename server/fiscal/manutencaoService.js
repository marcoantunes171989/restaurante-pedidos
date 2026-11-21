// ════════════════════════════════════════════════════════════
//  Manutenção fiscal de nota ainda não autorizada (NFC-e/NF-e): abrir os dados, gravar as correções e retransmitir.
//  • Quem pode: quem administra a loja (app_fiscal_pode_configurar; super admin incluso).
//  • O navegador só manda { caminho, valor }: o servidor reaplica cada alteração sobre os dados guardados, só aceita os campos permitidos
//    (manutencaoCampos.js), revalida o XML e o XSD ANTES de gravar e registra no log: usuário, data, motivo e cada campo (de → para).
//  • Nota autorizada/cancelada NÃO é editável (o XML autorizado não muda): para isso existem cancelamento e carta de correção.
//  Dependências injetadas (como no emissaoService): documento, podeConfigurar, usuarioAtual, salvarManutencao, ufDaLoja, segredoCertificado…
// ════════════════════════════════════════════════════════════

import { aplicarAlteracoes, celulasDaNota, podeManutencao } from "../../src/lib/fiscal/manutencaoCampos.js";
import { montarXmlNFe } from "../../src/lib/fiscal/nfeXml.js";
import { dadosDaNota } from "./dadosDaVenda.js";
import { credencialDoCofre } from "./credencialCofre.js";
import { montarAssinadaNormal } from "./nfeAssinada.js";
import { montarEnviNFeSincrono } from "./sefaz/mensagens.js";
import { validarMensagemXsd } from "./validarXsd.js";

const MSG = {
  FORBIDDEN: "Você não tem permissão para a manutenção fiscal desta loja (só administrador da loja ou super admin).",
  NAO_ENCONTRADO: "Nota não encontrada.",
  STATUS_NAO_PERMITE: "Esta nota não pode receber manutenção: só notas reservadas, rejeitadas ou com erro (a SEFAZ ainda não autorizou). Nota enviada: consulte a SEFAZ antes.",
  EM_CONTINGENCIA: "Esta venda já saiu em contingência: a nota de contingência é a que vale.",
  MOTIVO_OBRIGATORIO: "Informe o motivo da manutenção (mínimo de 5 letras): ele fica registrado no log.",
  SEM_ALTERACAO: "Nenhum campo foi alterado.",
  ALTERACAO_INVALIDA: "Há campo com valor inválido. Corrija os destacados e tente de novo.",
  XML_INVALIDO: "Com essas alterações a nota fica fora do padrão oficial. Nada foi gravado.",
  SEM_USUARIO: "Não foi possível identificar o usuário logado para registrar no log. Faça login de novo.",
  DADOS_DIVERGENTES: "Os dados alterados não batem com a nota reservada (chave, número, série, CNPJ). Nada foi gravado.",
};
const falha = (code, extra = {}) => ({ ok: false, code, erro: MSG[code] || "Não foi possível concluir.", ...extra });
const limpar = (m) => String(m || "").replace(/\s+/g, " ").slice(0, 220);

async function carregar(body, deps) {
  const doc = await deps.documento(String(body.documentoId || ""));
  if (!doc) return { erro: falha("NAO_ENCONTRADO") };
  if (!(await deps.podeConfigurar(doc.loja_id))) return { erro: falha("FORBIDDEN") };
  if (doc.contingencia_documento_id) return { erro: falha("EM_CONTINGENCIA") };
  if (!podeManutencao({ status: doc.status, tpEmis: doc.tp_emis })) return { erro: falha("STATUS_NAO_PERMITE", { status: doc.status }) };
  const prep = await dadosDaNota(doc, deps, deps.agora ? deps.agora() : new Date());
  if (prep.code) return { erro: falha(prep.code, prep.detalhe ? { detalhe: prep.detalhe } : {}) };
  return { doc, dados: prep.dados };
}

/**
 * @param {object} body  { acao: "manutencao_abrir"|"manutencao_salvar", documentoId, motivo?, alteracoes?, transmitir? }
 * @param {Function} emitir  (body) => resultado do emissaoService (usado só para retransmitir depois de gravar)
 */
export async function processarManutencao(body = {}, deps, emitir) {
  const acao = String(body.acao || "");
  const r = await carregar(body, deps);
  if (r.erro) return r.erro;
  const { doc, dados } = r;

  if (acao === "manutencao_abrir") {
    return {
      ok: true, dados, celulas: celulasDaNota(dados),
      documento: { id: doc.id, modelo: Number(doc.modelo), serie: doc.serie, numero: doc.numero, ambiente: doc.ambiente, status: doc.status, chave: dados.chave, cStat: doc.cstat ?? null, xMotivo: doc.xmotivo ?? null },
    };
  }

  // manutencao_salvar
  const motivo = String(body.motivo || "").trim();
  if (motivo.length < 5) return falha("MOTIVO_OBRIGATORIO");
  const { dados: novos, aplicadas, erros } = aplicarAlteracoes(dados, body.alteracoes);
  if (erros.length) return falha("ALTERACAO_INVALIDA", { erros });
  if (!aplicadas.length) return falha("SEM_ALTERACAO");

  // O XML com as alterações tem de nascer válido: monta, assina (se houver certificado) e confere no XSD oficial ANTES de gravar.
  try { montarXmlNFe(novos); } catch (e) { return falha("XML_INVALIDO", { detalhe: limpar(e?.message) }); }
  try {
    const uf = await deps.ufDaLoja(doc.loja_id);
    const cred = await credencialDoCofre(deps, doc.loja_id);
    if (!cred.erro) {
      const assinada = montarAssinadaNormal({ dados: novos, modelo: doc.modelo, ambiente: doc.ambiente, uf, cred });
      const v = await validarMensagemXsd(montarEnviNFeSincrono({ idLote: "1", nfeAssinada: assinada }), "enviNFe");
      if (!v.valido) return falha("XML_INVALIDO", { detalhe: limpar(`Fora do leiaute oficial: ${v.erros?.[0]}`) });
    }
  } catch (e) { return falha("XML_INVALIDO", { detalhe: limpar(e?.message) }); }

  const usuario = await deps.usuarioAtual().catch(() => null);
  if (!usuario || (!usuario.id && !usuario.email)) return falha("SEM_USUARIO");
  const g = await deps.salvarManutencao({
    documentoId: doc.id, dados: novos, usuario, motivo,
    alteracoes: aplicadas.map((a) => ({ campo: a.rotulo, caminho: a.caminho, de: a.de, para: a.para })),
  });
  if (!g?.ok) return falha(MSG[g?.code] ? g.code : "DADOS_DIVERGENTES", g?.status ? { status: g.status } : {});

  const saida = { ok: true, salva: true, aplicadas, usuario: { nome: usuario.nome || usuario.email, email: usuario.email || null }, em: g.em || null };
  if (body.transmitir === true && typeof emitir === "function") {
    saida.emissao = await emitir({ acao: "emitir", documentoId: doc.id });
  }
  return saida;
}
