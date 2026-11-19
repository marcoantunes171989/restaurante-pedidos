// ════════════════════════════════════════════════════════════
//  Consulta de CNPJ (dados públicos da Receita Federal, via BrasilAPI) e preenchimento do
//  cadastro da empresa. Só o CNPJ (dado público) sai do navegador. O que a Receita não informa
//  (ex.: Inscrição Estadual, que vem da SEFAZ do estado) fica EM BRANCO: nada é inventado.
//  Funções puras e testáveis; a rede é injetável (fetchImpl).
// ════════════════════════════════════════════════════════════

import { validarDocumentoFiscal, normalizarDocumentoFiscal } from "./emitenteFiscalService.js";

export const URL_CNPJ = "https://brasilapi.com.br/api/cnpj/v1/";
const TIMEOUT_MS = 12000;

const so = (v, n) => String(v ?? "").replace(/\D/g, "").slice(0, n);
const txt = (v) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tipos de via que a Receita separa do nome (RUA + "DAS FLORES"). Só estes entram na junção.
const VIAS = ["RUA", "AVENIDA", "ALAMEDA", "TRAVESSA", "PRACA", "PRAÇA", "RODOVIA", "ESTRADA", "LARGO", "VIA", "VIELA", "BECO", "PARQUE", "LADEIRA", "VILA", "CAMINHO"];

/** "BURGER STATION" → "Burger Station" (só para o nome de exibição no sistema, nunca para a razão social). */
export function tituloCaixa(s) {
  const peq = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "EM"]);
  return txt(s).toLowerCase().split(" ").map((p, i) => (i > 0 && peq.has(p.toUpperCase()) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

function montarLogradouro(tipo, logradouro) {
  const t = txt(tipo).toUpperCase();
  const l = txt(logradouro);
  if (!l) return "";
  if (!VIAS.includes(t)) return l;                          // ex.: QUADRA, SETOR: o nome já traz o que precisa
  const primeira = l.split(" ")[0].toUpperCase();
  return VIAS.includes(primeira) ? l : `${t} ${l}`;         // não duplica "RUA RUA ..."
}

/** Segmento só quando a atividade principal é clara; senão fica em branco. */
function segmentoPorCnae(descricao) {
  const d = txt(descricao).toLowerCase();
  if (/restaurante/.test(d)) return "Restaurante";
  if (/^bares?\b|bares e outros/.test(d)) return "Bar";
  return "";
}

/** CRT só quando a Receita permite saber sem adivinhar: MEI (4), Simples (1) ou lucro presumido/real (3). */
function crtPelaReceita(r) {
  if (r.opcao_pelo_mei === true) return "4";
  if (r.opcao_pelo_simples === true) return "1";
  const ult = Array.isArray(r.regime_tributario) ? [...r.regime_tributario].sort((a, b) => (a.ano || 0) - (b.ano || 0)).pop() : null;
  if (/LUCRO (PRESUMIDO|REAL)/i.test(ult?.forma_de_tributacao || "")) return "3";
  return "";
}

/**
 * Resposta da BrasilAPI → campos do cadastro. Tudo que não vier (ou vier inválido) fica "".
 * @returns {{ campos:object, nome:string, situacao:{ descricao:string, ativa:boolean }, avisos:string[] }}
 */
export function mapearDadosCnpj(r = {}) {
  const avisos = [];
  const cep = so(r.cep, 8);
  const ibge = so(r.codigo_municipio_ibge, 7);
  const tel = so(r.ddd_telefone_1, 11);
  const email = txt(r.email).toLowerCase();
  const cnae = r.cnae_fiscal != null ? String(r.cnae_fiscal).replace(/\D/g, "").padStart(7, "0").slice(0, 7) : "";
  const numero = txt(r.numero).toUpperCase();
  const razao = txt(r.razao_social);
  const fantasia = txt(r.nome_fantasia);
  const crt = crtPelaReceita(r);
  const campos = {
    razaoSocial: razao,
    nomeFantasia: fantasia,
    cnaePrincipal: cnae === "0000000" ? "" : cnae,
    segmento: segmentoPorCnae(r.cnae_fiscal_descricao),
    crt,
    cep: cep.length === 8 ? cep : "",
    uf: /^[A-Z]{2}$/.test(txt(r.uf).toUpperCase()) ? txt(r.uf).toUpperCase() : "",
    logradouro: montarLogradouro(r.descricao_tipo_de_logradouro, r.logradouro),
    numero: !numero ? "" : numero === "SN" || numero === "S N" || numero === "S/N" ? "S/N" : numero,
    complemento: txt(r.complemento),
    bairro: txt(r.bairro),
    municipio: txt(r.municipio),
    codigoMunicipioIbge: ibge.length === 7 ? ibge : "",
    telefoneFiscal: tel.length === 10 || tel.length === 11 ? tel : "",
    emailFiscal: EMAIL_RE.test(email) ? email : "",
  };
  const descricao = txt(r.descricao_situacao_cadastral) || (r.situacao_cadastral === 2 ? "ATIVA" : "");
  const ativa = descricao.toUpperCase() === "ATIVA";
  if (descricao && !ativa) avisos.push(`Situação cadastral na Receita: ${descricao}. A SEFAZ não autoriza nota para CNPJ que não está ativo.`);
  if (crt === "1" || crt === "4" || crt === "3") avisos.push("Regime sugerido pela opção na Receita (Simples/MEI/lucro). Confirme com o contador: o CRT define como o ICMS vai na nota.");
  if (!crt) avisos.push("A Receita não indica o regime de forma segura: deixei o CRT em branco para você escolher com o contador.");
  return { campos, nome: tituloCaixa(fantasia || razao), situacao: { descricao, ativa }, avisos };
}

/** Campos que a Receita nunca informa: ficam em branco e a tela explica onde obter. */
export const NAO_VEM_DA_RECEITA = [
  { chave: "inscricaoEstadual", rotulo: "Inscrição Estadual", onde: "vem da SEFAZ do estado (consulte o Sintegra ou o contador)" },
  { chave: "inscricaoMunicipal", rotulo: "Inscrição Municipal", onde: "vem da prefeitura" },
];

const igual = (a, b) => txt(a).toUpperCase() === txt(b).toUpperCase();
const vazio = (v) => v == null || txt(v) === "";

/**
 * Aplica os campos encontrados no formulário.
 * - Campo em branco no formulário e com dado da Receita → PREENCHE.
 * - Campo já preenchido com valor diferente → NÃO sobrescreve (lista em `diferentes`), a não ser que `sobrescrever`.
 * - Dado que a Receita não trouxe → continua em branco (lista em `semDado`).
 * @returns {{ form:object, preenchidos:string[], diferentes:Array<{chave:string, atual:string, receita:string}>, semDado:string[] }}
 */
export function aplicarDadosCnpj(form, mapa, { sobrescrever = false } = {}) {
  const out = { ...form };
  const preenchidos = [], diferentes = [], semDado = [];
  for (const [chave, valor] of Object.entries(mapa.campos)) {
    if (vazio(valor)) { if (vazio(form[chave])) semDado.push(chave); continue; }
    if (vazio(form[chave])) { out[chave] = valor; preenchidos.push(chave); }
    else if (!igual(form[chave], valor)) {
      if (sobrescrever) { out[chave] = valor; preenchidos.push(chave); }
      else diferentes.push({ chave, atual: String(form[chave]), receita: valor });
    }
  }
  if (vazio(form.nome) && mapa.nome) { out.nome = mapa.nome; preenchidos.push("nome"); }
  for (const f of NAO_VEM_DA_RECEITA) if (vazio(out[f.chave]) && !semDado.includes(f.chave)) semDado.push(f.chave);
  return { form: out, preenchidos, diferentes, semDado };
}

/**
 * Consulta o CNPJ. Nunca lança: devolve { ok:false, motivo, codigo } em qualquer falha.
 * @param {string} cnpj
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opcoes]
 */
export async function consultarCnpj(cnpj, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const d = normalizarDocumentoFiscal(cnpj);
  const v = validarDocumentoFiscal(d);
  if (!v.valido || v.tipo !== "cnpj") return { ok: false, codigo: "CNPJ_INVALIDO", motivo: "Informe um CNPJ numérico válido (14 dígitos) para buscar os dados." };
  if (typeof fetchImpl !== "function") return { ok: false, codigo: "SEM_REDE", motivo: "Consulta indisponível neste ambiente." };
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const resp = await fetchImpl(`${URL_CNPJ}${d}`, { headers: { Accept: "application/json" }, ...(ctrl ? { signal: ctrl.signal } : {}) });
    if (resp.status === 404) return { ok: false, codigo: "NAO_ENCONTRADO", motivo: "CNPJ não encontrado na base da Receita." };
    if (resp.status === 400) return { ok: false, codigo: "CNPJ_INVALIDO", motivo: "A Receita recusou este CNPJ como inválido." };
    if (resp.status === 429) return { ok: false, codigo: "LIMITE", motivo: "Muitas consultas seguidas. Aguarde um minuto e tente de novo." };
    if (!resp.ok) return { ok: false, codigo: "ERRO_SERVICO", motivo: "O serviço de consulta está indisponível agora. Preencha manualmente ou tente mais tarde." };
    const json = await resp.json();
    return { ok: true, cnpj: d, dados: mapearDadosCnpj(json) };
  } catch (e) {
    const abortou = e?.name === "AbortError";
    return { ok: false, codigo: abortou ? "TEMPO_ESGOTADO" : "SEM_REDE", motivo: abortou ? "A consulta demorou demais. Tente de novo." : "Sem conexão com o serviço de consulta. Preencha manualmente ou tente de novo." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
