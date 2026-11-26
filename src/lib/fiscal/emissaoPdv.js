// ════════════════════════════════════════════════════════════
//  Nota em cada venda no caixa (Etapa E8, parte 1)
//
//  Depois que o pagamento é finalizado, em segundo plano:
//   1) monta a venda fiscal (conferência completa) — se tiver pendência,
//      NÃO reserva número (nada é gasto) e avisa o caixa;
//   2) reserva a NFC-e com chave de idempotência derivada dos pedidos
//      (a mesma venda nunca gera duas notas, mesmo com clique duplo);
//   3) pede ao servidor para emitir — o servidor monta e confere a nota;
//   4) SEFAZ fora/sem resposta → contingência off-line da NFC-e.
//  NUNCA trava nem desfaz a venda: qualquer falha vira um aviso.
//
//  Ligado só com VITE_FISCAL_EMISSAO_PDV=true (desligado por padrão: em
//  PROD lojas têm NFC-e "habilitada" em simulação) e com o emitente em
//  homologação ou produção (simulação não emite).
// ════════════════════════════════════════════════════════════

import { montarVendaFiscal, composicaoDaConta } from "./vendaFiscal.js";
import { reservarDocumentoFiscal } from "./fiscalApi.js";
import { montarDestinatario } from "./nfeDaVenda.js";
import { normalizarDocumentoFiscal } from "../emitenteFiscalService.js";
import { validarAntesDeEmitir, problemaNfeForaDaUf, problemaEntregaForaDaUf } from "./validacaoPreEmissao.js";

export function emissaoPdvAtivaPorEnv(env) {
  return String(env?.VITE_FISCAL_EMISSAO_PDV ?? "").trim().toLowerCase() === "true";
}
export const EMISSAO_FISCAL_PDV_ATIVA = (() => {
  try { return emissaoPdvAtivaPorEnv(import.meta.env); } catch { return false; }
})();

export const JUSTIFICATIVA_CONTINGENCIA = "SEFAZ indisponivel no momento da venda";

/** Ambiente em que a loja emite NFC-e, ou null (simulação / não habilitada). */
export function ambienteNfceDaLoja(emitente) {
  if (!emitente || emitente.nfceHabilitada !== true) return null;
  return ["homologacao", "producao"].includes(emitente.nfceAmbiente) ? emitente.nfceAmbiente : null;
}

/** Ambiente da NF-e (55): mesma configuração de ambiente da loja, com NF-e habilitada. */
export function ambienteNfeDaLoja(emitente) {
  if (!emitente || emitente.nfeHabilitada !== true) return null;
  return ["homologacao", "producao"].includes(emitente.nfceAmbiente) ? emitente.nfceAmbiente : null;
}

/**
 * Por que a venda NÃO gerou nota fiscal (para o caixa dizer, em vez de mostrar só o recibo antigo em silêncio).
 * Só faz sentido quando a emissão pelo caixa está ligada no build; devolve null quando a loja emite normalmente.
 */
export function motivoSemNota(emitente, { nfe = false } = {}) {
  const sigla = nfe ? "NF-e" : "NFC-e";
  if (!emitente) return `Cadastro fiscal desta empresa não carregado: a ${sigla} não foi emitida. Recarregue a página (Ctrl+F5) e confira em Configurações › Dados da Empresa.`;
  if ((nfe ? emitente.nfeHabilitada : emitente.nfceHabilitada) !== true) return `${sigla} não habilitada para esta empresa: ligue em Configurações › Dados da Empresa.`;
  if (!["homologacao", "producao"].includes(emitente.nfceAmbiente)) return `Emissão fiscal desligada (empresa em simulação): a ${sigla} não foi emitida. Para emitir, ligue a emissão em Configurações › Emissão.`;
  return null;
}

export const NOTA_VAZIA = Object.freeze({ balcao: false, documento: "", nfe: false, entrega: false, quemEntrega: "", intermediador: "", nome: "", ie: "", CEP: "", xLgr: "", nro: "", xCpl: "", xBairro: "", xMun: "", UF: "", cMun: "", fone: "" });

/**
 * Tipo escolhido no fechamento: 'balcao' (Venda Balcão, sem nota agora), 'nfce' ou 'nfe'.
 * Sem escolha, vale a NFC-e quando a loja a emite (comportamento de sempre); senão, Venda Balcão.
 */
export function tipoDaNota(v = NOTA_VAZIA, { nfceDisponivel = true, nfeDisponivel = false } = {}) {
  if (v?.balcao) return "balcao";
  if (v?.nfe) return nfeDisponivel ? "nfe" : "balcao";
  return nfceDisponivel ? "nfce" : "balcao";
}

const enderecoDoCaixa = (v) => ({ xLgr: v.xLgr, nro: v.nro, xCpl: v.xCpl, xBairro: v.xBairro, cMun: v.cMun, xMun: v.xMun, UF: v.UF, CEP: v.CEP, fone: v.fone });

/**
 * Confere o que o caixa digitou para a nota (E8 parte 3).
 * Entrega a domicílio (NFC-e): devolve também `entrega: true` e o cliente em `destinatario`.
 * Venda Balcão: nada é conferido nem emitido agora ({ balcao: true, modelo: null }).
 * @returns {{ ok:boolean, erro?:string, balcao?:true, modelo:55|65|null, cpf:string, destinatario:object|null, entrega?:true }}
 */
export function dadosDaNotaNoCaixa(v = NOTA_VAZIA, { nfceDisponivel = true, nfeDisponivel = false, entregaDisponivel = false, ufEmitente = "" } = {}) {
  if (v.balcao || (!v.nfe && !nfceDisponivel && nfeDisponivel)) return { ok: true, balcao: true, modelo: null, cpf: "", destinatario: null };
  const doc = normalizarDocumentoFiscal(v.documento);
  if (v.nfe) {
    if (!nfeDisponivel) return { ok: false, erro: "Esta loja ainda não emite NF-e." };
    if (doc.length !== 14) return { ok: false, erro: "NF-e: informe o CNPJ da empresa (a NF-e é só para empresa)." };
    const destinatario = { documento: doc, nome: v.nome, ie: v.ie, ender: enderecoDoCaixa(v) };
    const r = montarDestinatario({ modelo: 55, destinatario });
    if (r.erro) return { ok: false, erro: r.erro };
    const foraDaUf = problemaNfeForaDaUf(v.UF, ufEmitente); // antes de fechar a venda
    if (foraDaUf) return { ok: false, erro: foraDaUf };
    return { ok: true, modelo: 55, cpf: "", destinatario };
  }
  if (v.entrega) {
    if (!entregaDisponivel) return { ok: false, erro: "Esta loja não está com a NFC-e de entrega a domicílio ligada." };
    const destinatario = { documento: doc, nome: v.nome, ender: enderecoDoCaixa(v) };
    const r = montarDestinatario({ modelo: 65, destinatario, entrega: true });
    if (r.erro) return { ok: false, erro: r.erro };
    const foraDaUf = problemaEntregaForaDaUf(v.UF, ufEmitente);
    if (foraDaUf) return { ok: false, erro: foraDaUf };
    return { ok: true, modelo: 65, cpf: doc, destinatario, entrega: true, entregaOpcoes: { quem: v.quemEntrega || "", intermediador: v.intermediador || "" } };
  }
  if (!doc) return { ok: true, modelo: 65, cpf: "", destinatario: null };
  const r = montarDestinatario({ modelo: 65, cpfConsumidor: doc });
  if (r.erro) return { ok: false, erro: r.erro };
  return { ok: true, modelo: 65, cpf: doc, destinatario: null };
}

/** UUID estável da venda: SHA-256 de loja + pedidos (ordenados). */
export async function chaveIdempotenciaVenda(lojaId, pedidosIds = [], subtle = globalThis.crypto?.subtle, tentativa = 0) {
  if (!subtle) throw new Error("Navegador sem criptografia para gerar a chave da venda.");
  // `tentativa` > 0: a nota anterior da venda foi DESCARTADA (número não usado); a venda ganha uma chave nova para emitir de novo.
  // Tentativa 0 mantém exatamente a chave de sempre (nada muda para as notas existentes).
  const base = `pp-venda-fiscal:v1:${lojaId}:${[...pedidosIds].map(String).sort().join(",")}${tentativa > 0 ? `:r${tentativa}` : ""}`;
  const h = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(base)));
  h[6] = (h[6] & 0x0f) | 0x50; // versão 5 (derivado por hash)
  h[8] = (h[8] & 0x3f) | 0x80; // variante RFC 4122
  const x = [...h.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** POST na API fiscal que devolve a resposta mesmo quando a nota não foi autorizada. */
export async function postarApiFiscal(supabase, corpo, { fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
  const { data } = (await supabase?.auth?.getSession?.()) || {};
  const token = data?.session?.access_token;
  if (!token) return { ok: false, code: "SEM_LOGIN", erro: "Faça login novamente para emitir a nota." };
  let resp;
  try {
    resp = await fetchFn("/api/fiscal-emitir", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(corpo || {}),
    });
  } catch {
    return { ok: false, code: "REDE", erro: "Sem conexão com o servidor." };
  }
  try { return (await resp.json()) || { ok: false, code: `HTTP_${resp.status}` }; } catch { return { ok: false, code: `HTTP_${resp.status}`, erro: "Resposta inválida do servidor." }; }
}

/**
 * Caixa Operacional (CentralDoCaixa): fecha UMA conta (um pedido) cobrando
 * subtotal + taxa de serviço, sem troco, cupom ou desconto manual. Monta os
 * dados da nota no mesmo formato do PDV principal.
 */
export function dadosNotaContaOperacional({ pedido, subtotal, total, detalhes = [] } = {}) {
  const c = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const sub = c(subtotal), tot = c(total);
  return {
    pedidos: pedido ? [pedido] : [],
    composicao: composicaoDaConta({ subtotal: sub, taxaServico: Math.max(0, c(tot - sub)) }),
    pagamento: { total: tot, troco: 0, detalhes: detalhes.map((d) => ({ forma: d.forma, valor: c(d.valor) })) },
  };
}

/**
 * Resultado para a tela: { estado: 'autorizada'|'contingencia'|'pendente'|'erro'|'fora', titulo, detalhe?, numero? }
 * 'fora' = a loja não emite nota (nada a mostrar).
 */
export async function emitirNotaDaVenda({
  supabase, emitente, pedidos = [], produtos = [], composicao = {}, pagamento = {}, formas = [],
  config = {}, ctxFiscal = {}, cpf = "", modelo = 65, destinatario = null, entrega = false, entregaOpcoes = null, ativo = EMISSAO_FISCAL_PDV_ATIVA, fetchFn, subtle, tentativa = 0,
} = {}) {
  const nfe = Number(modelo) === 55;
  const emEntrega = !nfe && entrega === true;
  const ambiente = ativo ? (nfe ? ambienteNfeDaLoja(emitente) : ambienteNfceDaLoja(emitente)) : null;
  if (!ambiente) return { estado: "fora" };

  let venda;
  try {
    venda = montarVendaFiscal({
      pedidos, produtos, formas, ctxFiscal,
      ajustes: composicao || {}, regras: config?.regras || {}, mapaMeios: config?.mapaMeios || {},
      pagamento: { total: pagamento.total, troco: pagamento.troco, detalhes: pagamento.detalhes || [] },
    });
  } catch {
    return { estado: "erro", titulo: "Nota fiscal não emitida", detalhe: "Erro ao montar a nota da venda." };
  }
  if (!venda.apto) {
    const lista = [...(venda.pendencias || []), ...(venda.itens || []).flatMap((it) => it.pendencias || [])];
    return { estado: "pendente", titulo: "Nota fiscal não emitida: venda com pendência", detalhe: lista.slice(0, 3).join(" ") };
  }

  // Confere os dados fiscais ANTES de gastar um número de nota: se algo estiver errado, a nota não é reservada e a tela diz o que corrigir.
  const pre = validarAntesDeEmitir({ emitente, modelo: nfe ? 55 : 65, ambiente, venda, destinatario, cpfConsumidor: nfe ? "" : cpf, ibsCbsSn: config?.ibsCbsSn, entrega: emEntrega, entregaNfce: config?.entregaNfce, entregaOpcoes });
  if (!pre.ok) return { estado: "pendente", titulo: "Nota fiscal não emitida: dados fiscais com problema", detalhe: pre.texto };

  let reserva;
  try {
    const idempotencyKey = await chaveIdempotenciaVenda(venda.lojaId, venda.pedidosIds, subtle, tentativa);
    reserva = await reservarDocumentoFiscal(supabase, {
      lojaId: venda.lojaId, modelo: nfe ? 55 : 65, ambiente, idempotencyKey,
      rascunho: { versao: 1, origem: "pdv", venda, cpf: nfe ? "" : normalizarDocumentoFiscal(cpf), ...(nfe || emEntrega ? { dest: destinatario } : {}), ...(emEntrega ? { entrega: true, ...(entregaOpcoes ? { entregaOpcoes } : {}) } : {}) },
      pedidosIds: venda.pedidosIds, valorTotal: venda.totais.vNF, qtdItens: venda.itens.length,
    });
  } catch (e) {
    return { estado: "erro", titulo: "Nota fiscal não emitida", detalhe: e?.message || "Não foi possível reservar o número da nota." };
  }

  const opts = fetchFn ? { fetchFn } : {};
  return emitirReservada({ documentoId: reserva.documentoId, numero: reserva.numero, nfe, postar: (corpo) => postarApiFiscal(supabase, corpo, opts) });
}

/**
 * Envia uma nota JÁ reservada (venda do caixa, botão "Emitir agora" ou nova tentativa
 * automática): SEFAZ fora → contingência (NFC-e off-line; NF-e SVC e, se a SVC
 * também estiver fora, EPEC). postar(corpo) = POST na /api/fiscal-emitir.
 */
export async function emitirReservada({ documentoId, numero, nfe = false, postar }) {
  const sigla = nfe ? "NF-e" : "NFC-e";
  const r = await postar({ acao: "emitir", documentoId });
  if (r.ok && r.situacao === "autorizada") return { estado: "autorizada", titulo: `${sigla} nº ${r.numero ?? numero} autorizada`, numero: r.numero ?? numero, documentoId };
  if (r.situacao === "rejeitada") return { estado: "erro", titulo: `${sigla} nº ${numero} rejeitada`, detalhe: [r.cStat, r.xMotivo].filter(Boolean).join(" — "), documentoId };
  // Resposta de "já foi para a contingência" (repetição): a nota que vale é a de contingência.
  if (r.code === "EM_CONTINGENCIA") return { estado: "contingencia", titulo: "Nota emitida em contingência", detalhe: "Será enviada à SEFAZ automaticamente.", documentoId: r.contingenciaDocumentoId };

  if (r.podeContingencia) {
    let c = await postar({ acao: "contingencia", documentoId, xJust: JUSTIFICATIVA_CONTINGENCIA });
    // NF-e: SVC fora também → EPEC (aviso à Receita; MOC 7.0 Anexo III e NT 2014.001).
    if (nfe && !c.ok && c.podeEpec) c = await postar({ acao: "contingencia", documentoId, xJust: JUSTIFICATIVA_CONTINGENCIA, forma: "epec" });
    if (nfe && c.forma === "svc" && c.documentoId) {
      if (c.situacao === "rejeitada") return { estado: "erro", titulo: `NF-e nº ${c.numero} rejeitada na SVC`, detalhe: [c.cStat, c.xMotivo].filter(Boolean).join(" — "), documentoId: c.documentoId };
      return c.situacao === "autorizada"
        ? { estado: "autorizada", titulo: `NF-e nº ${c.numero} autorizada (SVC)`, numero: c.numero, documentoId: c.documentoId }
        : { estado: "contingencia", titulo: `NF-e nº ${c.numero} pela SVC`, numero: c.numero, detalhe: "Servidor reserva da SEFAZ: será reenviada automaticamente.", documentoId: c.documentoId };
    }
    if (nfe && c.ok && c.forma === "epec") return { estado: "contingencia", titulo: `NF-e nº ${c.numero} em contingência EPEC`, numero: c.numero, detalhe: `Aviso registrado na Receita (protocolo ${c.protocoloEpec}). Envie à SEFAZ em até 7 dias.`, documentoId: c.documentoId };
    if (c.ok) return { estado: "contingencia", titulo: `NFC-e nº ${c.numero} em contingência`, numero: c.numero, detalhe: "SEFAZ fora do ar: a nota vale e será enviada depois.", documentoId: c.documentoId };
    return { estado: "erro", titulo: "Nota fiscal pendente", detalhe: c.erro || "SEFAZ fora do ar e a contingência falhou. Veja em Notas emitidas.", documentoId };
  }
  const motivo = [r.erro || r.xMotivo, r.detalhe || ""].filter(Boolean).join(" — ");
  return { estado: "erro", titulo: "Nota fiscal pendente", detalhe: motivo || "Não foi possível emitir agora. Veja em Notas emitidas.", documentoId };
}
