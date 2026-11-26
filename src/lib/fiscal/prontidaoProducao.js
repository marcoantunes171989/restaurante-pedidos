// ════════════════════════════════════════════════════════════
//  Prontidão para emitir NFC-e (e NF-e, quando habilitada) em PRODUÇÃO (nota com valor fiscal).
//  Funções puras: recebem o que a tela Emissão já carrega e devolvem uma lista de itens (ok / falta / aviso) para a pessoa
//  enxergar, em um lugar só, tudo que impede ou arrisca a produção. NÃO liga nada: quem liga é o assistente (trava 186 no banco).
//
//  Itens com `bloqueia: true` são os que a trava do banco (migration 186) exige; os demais são conferências que evitam gastar
//  número de nota real com um cadastro errado (a SEFAZ de produção rejeita e, em SP, número queimado não se recupera).
// ════════════════════════════════════════════════════════════

import { pendenciasEmitenteNfce } from "../emitenteFiscalService.js";
import { resolverFiscalProduto } from "../fiscalService.js";
import { situacaoCertificado, conferirMapaMeios, textoProblemasMeios } from "./emissaoConfig.js";
import { problemasDosItens } from "./validacaoPreEmissao.js";
import { normalizarIbsCbsSn, pendenciasIbsCbsSn } from "./ibsCbsSimples.js";

const AMB = "producao";

/** Produtos ativos cujo cadastro fiscal a SEFAZ de produção rejeitaria (usa o MESMO validador do caixa, com o regime da empresa). */
export function produtosComProblemaDeProducao({ produtos = [], regrasLoja = [], ctxFiscal = {}, crt = "" } = {}) {
  const ctx = { ...ctxFiscal, lojaFiscalRegras: regrasLoja };
  return produtos
    .filter((p) => p && p.active !== false && p.ativo !== false)
    .map((p) => {
      const fiscal = resolverFiscalProduto(p, ctx);
      const nome = p.name ?? p.nome ?? "Produto";
      const problemas = problemasDosItens([{ nome, quantidade: 1, valorBruto: 1, fiscal, produtoId: p.id }], { crt, modelo: 65 }).map((x) => x.msg.replace(`${nome}: `, ""));
      return { id: p.id, nome, problemas };
    })
    .filter((x) => x.problemas.length > 0);
}

/**
 * @param {object} p
 * @param {object|null} p.emitente   cadastro fiscal da loja
 * @param {string} p.documentoLoja   CNPJ da loja
 * @param {object[]} p.credenciais   resumo das credenciais (sem segredo)
 * @param {object[]} p.series
 * @param {object[]} p.formas        formas de pagamento ativas
 * @param {object} p.config          { mapaMeios, taxaServicoTratamento }
 * @param {object[]} p.produtos
 * @param {object[]} p.regrasLoja
 * @param {object} p.ctxFiscal
 * @param {{faltas?:string[], liberada?:boolean, emProducao?:boolean}|null} p.producao  retorno da RPC da trava (186)
 * @param {{ok:boolean}|null} p.teste           último teste de conexão (homologação)
 * @param {{ok:boolean, modelo?:number}|null} p.testeProducao  último teste de conexão com a SEFAZ de PRODUÇÃO
 * @param {{ok:boolean}|null} p.testeProducaoNfe  último teste de conexão da NF-e em PRODUÇÃO (só conta com a NF-e habilitada)
 * @returns {{ pronto:boolean, bloqueios:number, avisos:number, itens:Array<{id,rotulo,ok,bloqueia,dica}> }}
 */
export function prontidaoProducao({
  emitente = null, documentoLoja = "", credenciais = [], series = [], formas = [], config = {}, produtos = [], regrasLoja = [], ctxFiscal = {},
  producao = null, testeProducao = null, testeProducaoNfe = null, agora = new Date(),
} = {}) {
  const crt = String(emitente?.crt || "");
  const cert = credenciais.find((c) => c.tipo === "certificado_a1") || null;
  const sc = situacaoCertificado(cert, agora);
  const csc = credenciais.find((c) => c.tipo === "csc" && c.ambiente === AMB && c.cadastrado);
  const serie = series.find((s) => Number(s.modelo) === 65 && s.ambiente === AMB && s.ativa);
  const mapa = conferirMapaMeios(formas, config?.mapaMeios || {});
  const faltasBanco = Array.isArray(producao?.faltas) ? producao.faltas : [];
  const homologada = !faltasBanco.some((f) => /NFC-e autorizada em homologa/i.test(f));
  const pendEmitente = emitente ? pendenciasEmitenteNfce(emitente, documentoLoja) : ["Cadastro fiscal da empresa"];
  const prods = produtosComProblemaDeProducao({ produtos, regrasLoja, ctxFiscal, crt });
  const mei = crt === "4";
  // A trava também cobra a NF-e quando ela está habilitada: se a loja só emite NFC-e, a saída é desabilitar a NF-e.
  // Com a NF-e habilitada a série tem item próprio (serie-nfe), então a falta de série não é repetida (nem contada) aqui.
  const nfeLigada = emitente?.nfeHabilitada === true;
  const faltaNfe = faltasBanco.filter((f) => /NF-e/.test(f) && !/NFC-e/.test(f) && !(nfeLigada && /^S[ée]rie/i.test(f)));

  const itens = [
    { id: "nfce", rotulo: "NFC-e habilitada no cadastro da empresa", ok: emitente?.nfceHabilitada === true, bloqueia: true, dica: "Habilite a NFC-e em Dados da Empresa." },
    { id: "emitente", rotulo: "Cadastro da empresa completo (razão social, endereço, código IBGE, IE)", ok: pendEmitente.length === 0, bloqueia: true, dica: pendEmitente.length ? `Faltam: ${pendEmitente.join(", ")}.` : "" },
    { id: "regime", rotulo: mei ? "Regime: MEI (CRT 4) — CSOSN 102 e CFOP 5102" : "Regime tributário (CRT) informado", ok: ["1", "2", "3", "4"].includes(crt), bloqueia: true, dica: "Informe o CRT no cadastro da empresa (MEI = 4; confirme com o contador)." },
    { id: "certificado", rotulo: "Certificado A1 válido (com folga de 30 dias)", ok: sc.estado === "ok", bloqueia: true, dica: sc.estado === "vencendo" ? `${sc.texto} Renove antes de ligar a produção.` : sc.texto },
    { id: "serie", rotulo: "Série da NFC-e em PRODUÇÃO (numeração que não colide com outro emissor)", ok: !!serie, bloqueia: true, dica: "Cadastre a série e o próximo número de produção em Séries e numeração. Use um número que nenhum outro sistema já tenha usado neste CNPJ." },
    { id: "csc", rotulo: "CSC de produção cadastrado (usado na contingência off-line)", ok: !!csc, bloqueia: true, dica: "Gere o CSC no portal da NFC-e da SEFAZ-SP e cadastre em CSC da NFC-e (ambiente Produção)." },
    { id: "homologacao", rotulo: "Pelo menos 1 NFC-e autorizada em homologação neste ambiente", ok: homologada && producao != null, bloqueia: true, dica: "Emita uma nota de teste em homologação aqui mesmo (a trava do banco confere neste banco)." },
    { id: "pagamentos", rotulo: "Código fiscal de cada forma de pagamento (cartão = 03/04, PIX = 17…)", ok: mapa.ok, bloqueia: true, dica: mapa.ok ? "" : `Corrija: ${textoProblemasMeios(mapa)}.` },
    { id: "taxa", rotulo: "Regra da taxa de serviço na nota (confirmada com o contador)", ok: ["outras_despesas", "fora_da_nota"].includes(config?.taxaServicoTratamento), bloqueia: true, dica: "Defina em Pagamentos e taxa de serviço na nota." },
    { id: "produtos", rotulo: mei ? "Produtos prontos para MEI (NCM, CSOSN 102, CFOP 5102, PIS/COFINS)" : "Produtos com cadastro fiscal completo", ok: prods.length === 0, bloqueia: false,
      dica: prods.length ? `${prods.length} produto(s) com problema, por exemplo: ${prods.slice(0, 3).map((x) => `${x.nome} (${x.problemas[0]})`).join("; ")}.` : "" },
    { id: "conexao", rotulo: "Teste de conexão com a SEFAZ de PRODUÇÃO feito com sucesso", ok: testeProducao?.ok === true, bloqueia: false, dica: "Use o botão Testar conexão (produção) na seção do certificado. É só uma consulta de status." },
  ];
  if (faltaNfe.length) itens.splice(1, 0, { id: "nfe", rotulo: nfeLigada ? "Pelo menos 1 NF-e autorizada em homologação neste ambiente" : "NF-e habilitada exige série e nota de teste próprias", ok: false, bloqueia: true, dica: `${faltaNfe.join(" ")} Se a loja só emite NFC-e, desabilite a NF-e em Dados da Empresa.` });
  // NF-e habilitada: série própria de produção (a trava 186 exige) e teste de conexão do serviço da NF-e, que é outro endereço da SEFAZ.
  if (emitente?.nfeHabilitada === true) {
    itens.push(
      { id: "serie-nfe", rotulo: "Série da NF-e em PRODUÇÃO (numeração que não colide com outro emissor)", ok: series.some((s) => Number(s.modelo) === 55 && s.ambiente === AMB && s.ativa), bloqueia: true, dica: "Cadastre a série e o próximo número da NF-e em produção em Séries e numeração. Se a loja só emite NFC-e, desabilite a NF-e em Dados da Empresa." },
      { id: "conexao-nfe", rotulo: "Teste de conexão da NF-e com a SEFAZ de PRODUÇÃO feito com sucesso", ok: testeProducaoNfe?.ok === true, bloqueia: false, dica: "Use o botão NF-e (produção) na seção do certificado. É só uma consulta de status." },
    );
  }
  // Simples (CRT 1): aviso enquanto os parâmetros do IBS/CBS não estiverem ligados e completos.
  if (crt === "1") {
    const sn = normalizarIbsCbsSn(config?.ibsCbsSn);
    const falta = pendenciasIbsCbsSn(sn);
    itens.push({ id: "ibscbs-sn", rotulo: "IBS/CBS do Simples Nacional configurado", ok: sn.ativo && falta.length === 0, bloqueia: false,
      dica: `Preencha e ligue em IBS/CBS do Simples Nacional (início previsto: ${sn.inicio.split("-").reverse().join("/")}). Confirme os códigos e as alíquotas com o contador.` });
  }
  const bloqueios = itens.filter((i) => !i.ok && i.bloqueia).length;
  const avisos = itens.filter((i) => !i.ok && !i.bloqueia).length;
  return { pronto: bloqueios === 0 && avisos === 0, bloqueios, avisos, itens, produtosComProblema: prods, emProducao: producao?.emProducao === true };
}
