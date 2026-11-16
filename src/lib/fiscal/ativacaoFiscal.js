// ════════════════════════════════════════════════════════════
//  Assistente "Ativar nota fiscal" (Etapa E9, parte 1).
//  Passos em ordem, cada um dizendo se está pronto e o que falta. O último
//  passo liga a emissão em HOMOLOGAÇÃO (ambiente de testes da SEFAZ, sem
//  valor fiscal). Produção continua bloqueada até a E10 (piloto).
// ════════════════════════════════════════════════════════════

import { pendenciasEmitenteNfce } from "../emitenteFiscalService.js";
import { resolverFiscalProduto, pendenciasFiscais } from "../fiscalService.js";
import { situacaoCertificado, conferirMapaMeios } from "./emissaoConfig.js";

const AMB = "homologacao";

/** Produtos ativos da loja que ainda não têm o que a nota exige (NCM, CFOP, CSOSN/CST…). */
export function produtosSemFiscal(produtos = [], regrasLoja = []) {
  return produtos
    .filter((p) => p && p.active !== false && p.ativo !== false)
    .map((p) => ({ produto: p, pend: pendenciasFiscais(resolverFiscalProduto(p, { lojaFiscalRegras: regrasLoja })) }))
    .filter((x) => x.pend.length > 0)
    .map((x) => ({ id: x.produto.id, nome: x.produto.name ?? x.produto.nome ?? "", pendencias: x.pend }));
}

/**
 * @param {object} p
 * @param {object} p.emitente      emitente (dbParaEmitente)
 * @param {string} p.documentoLoja CNPJ da loja (tab_lojas.documento)
 * @param {object[]} p.credenciais resumo das credenciais (sem segredo)
 * @param {object[]} p.series
 * @param {object[]} p.formas      formas de pagamento ativas
 * @param {object} p.config        { mapaMeios, taxaServicoTratamento }
 * @param {object[]} p.produtos
 * @param {object[]} p.regrasLoja  regras fiscais da loja (lojaFiscalRegras)
 * @param {object} [p.teste]       resultado do último teste de conexão { ok, modelo }
 */
export function passosAtivacao({ emitente = null, documentoLoja = "", credenciais = [], series = [], formas = [], config = {}, produtos = [], regrasLoja = [], teste = null, agora = new Date() } = {}) {
  const e = emitente || {};
  const nfce = e.nfceHabilitada === true, nfe = e.nfeHabilitada === true;
  const pendEmit = pendenciasEmitenteNfce(e, documentoLoja);
  const cert = credenciais.find((c) => c.tipo === "certificado_a1") || null;
  const sc = situacaoCertificado(cert, agora);
  const cscHom = credenciais.some((c) => c.tipo === "csc" && c.ambiente === AMB && c.cadastrado !== false);
  const temSerie = (m) => series.some((s) => Number(s.modelo) === m && s.ambiente === AMB && s.ativa);
  const mapa = conferirMapaMeios(formas, config?.mapaMeios || {});
  const taxaOk = ["outras_despesas", "fora_da_nota"].includes(config?.taxaServicoTratamento);
  const semFiscal = produtosSemFiscal(produtos, regrasLoja);
  const ativos = produtos.filter((p) => p && p.active !== false && p.ativo !== false).length;

  const passos = [
    { id: "empresa", titulo: "Dados fiscais da empresa", alvo: "empresa",
      ok: (nfce || nfe) && pendEmit.length === 0,
      detalhe: !(nfce || nfe) ? "Marque NFC-e (e NF-e, se usar) como habilitada no cadastro fiscal da empresa."
        : pendEmit.length ? `Falta: ${pendEmit.join(", ")}.` : "Completo." },
    { id: "certificado", titulo: "Certificado digital A1", alvo: "emissao-cert",
      ok: sc.estado === "ok" || sc.estado === "vencendo", detalhe: sc.texto },
    { id: "csc", titulo: "CSC da NFC-e (homologação)", alvo: "emissao-csc",
      ok: !nfce || cscHom,
      detalhe: !nfce ? "Não se aplica (loja sem NFC-e)." : cscHom ? "Guardado no cofre." : "Cadastre o ID e o código CSC que a SEFAZ forneceu (usado na contingência da NFC-e)." },
    { id: "series", titulo: "Séries e numeração (homologação)", alvo: "emissao-series",
      ok: (!nfce || temSerie(65)) && (!nfe || temSerie(55)),
      detalhe: [nfce && !temSerie(65) ? "falta a série da NFC-e" : "", nfe && !temSerie(55) ? "falta a série da NF-e" : ""].filter(Boolean).join(" e ") || "Cadastradas." },
    { id: "pagamentos", titulo: "Pagamentos e taxa de serviço", alvo: "emissao-pag",
      ok: mapa.ok && taxaOk,
      detalhe: [!mapa.ok ? `Código fiscal faltando em: ${[...mapa.semCodigo, ...mapa.invalidos].join(", ")}` : "", !taxaOk ? "defina com o contador se a taxa de serviço entra na nota" : ""].filter(Boolean).join("; ") || "Configurado." },
    { id: "produtos", titulo: "Produtos com regra fiscal", alvo: "produtos",
      ok: ativos > 0 && semFiscal.length === 0,
      detalhe: ativos === 0 ? "Nenhum produto ativo." : semFiscal.length ? `${semFiscal.length} de ${ativos} produto(s) sem regra fiscal completa.` : `Todos os ${ativos} produtos prontos.`,
      lista: semFiscal.slice(0, 10) },
    { id: "teste", titulo: "Teste de conexão com a SEFAZ", alvo: "emissao-cert",
      ok: !!teste?.ok, detalhe: teste?.ok ? "SEFAZ respondeu: em operação." : teste ? (teste.texto || "O último teste falhou.") : "Clique em \"Testar conexão\" depois de cadastrar o certificado." },
  ];
  const prontos = passos.every((p) => p.ok);
  const ligada = ["homologacao", "producao"].includes(e.nfceAmbiente);
  passos.push({ id: "ligar", titulo: "Ligar a emissão em homologação", alvo: "ligar",
    ok: ligada, detalhe: ligada ? `Ligada (${e.nfceAmbiente === "producao" ? "produção" : "homologação"}).` : prontos ? "Tudo pronto: pode ligar." : "Conclua os passos acima antes." });
  return { passos, prontos, ligada, feitos: passos.filter((p) => p.ok).length, total: passos.length };
}
